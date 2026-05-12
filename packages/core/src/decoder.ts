// ============================================
// ShieldWall Core — Transaction Decoder
// ============================================
// Decodes raw transaction calldata into human-readable function calls

import {
  decodeFunctionData,
  parseAbi,
  formatUnits,
  getAddress,
  type Hex,
} from 'viem';
import type { DecodedFunction, DecodedParam, RawTransaction } from '@shieldwall/shared';
import { KNOWN_CONTRACTS } from '@shieldwall/shared';
import { COMMON_ABIS } from './abis';

/**
 * Decode a transaction's calldata into a human-readable function call.
 *
 * Strategy:
 * 1. Try known protocol ABIs (Uniswap, OpenSea, etc.)
 * 2. Try common ERC-20/721 signatures
 * 3. Fall back to 4-byte signature lookup
 */
export async function decodeTransaction(
  tx: RawTransaction
): Promise<DecodedFunction | undefined> {
  const data = tx.data as Hex | undefined;

  // No data = simple ETH transfer
  if (!data || data === '0x' || data.length < 10) {
    return {
      name: 'transfer',
      signature: 'transfer()',
      params: [
        {
          name: 'to',
          type: 'address',
          value: tx.to ?? '0x0',
          label: getContractLabel(tx.to ?? ''),
        },
        {
          name: 'value',
          type: 'uint256',
          value: tx.value ?? '0',
          label: `${formatUnits(BigInt(tx.value ?? '0'), 18)} ETH`,
        },
      ],
      protocol: 'Native Transfer',
    };
  }

  // Extract the 4-byte function selector
  const selector = data.slice(0, 10);

  // Try decoding against known ABIs
  for (const [protocol, abi] of Object.entries(COMMON_ABIS)) {
    try {
      const parsedAbi = parseAbi(abi);
      const { functionName, args } = decodeFunctionData({
        abi: parsedAbi,
        data,
      });

      // Find the matching ABI entry to get param names
      const abiItem = parsedAbi.find(
        (item) => item.type === 'function' && item.name === functionName
      );

      const params: DecodedParam[] = [];
      if (abiItem && 'inputs' in abiItem && abiItem.inputs && args) {
        for (let i = 0; i < abiItem.inputs.length; i++) {
          const input = abiItem.inputs[i];
          const value = args[i];
          params.push({
            name: input.name ?? `param${i}`,
            type: input.type,
            value: String(value),
            label: input.type === 'address' ? getContractLabel(String(value)) : undefined,
          });
        }
      }

      return {
        name: functionName,
        signature: `${functionName}(${abiItem && 'inputs' in abiItem ? abiItem.inputs?.map((i) => i.type).join(',') : ''})`,
        params,
        protocol,
      };
    } catch {
      // This ABI didn't match, try next
      continue;
    }
  }

  // Try 4-byte directory lookup as fallback
  const fallback = await lookup4ByteSelector(selector);
  if (fallback) {
    return {
      name: fallback.name,
      signature: fallback.signature,
      params: [],
      protocol: undefined,
    };
  }

  // Completely unknown
  return {
    name: 'unknown',
    signature: selector,
    params: [
      {
        name: 'raw_data',
        type: 'bytes',
        value: data.length > 66 ? `${data.slice(0, 66)}...` : data,
      },
    ],
  };
}

/**
 * Look up a 4-byte selector against the public 4byte.directory API
 */
async function lookup4ByteSelector(
  selector: string
): Promise<{ name: string; signature: string } | undefined> {
  try {
    const resp = await fetch(
      `https://www.4byte.directory/api/v1/signatures/?hex_signature=${selector}&ordering=-created_at`
    );
    if (!resp.ok) return undefined;

    const data = await resp.json();
    if (data.results && data.results.length > 0) {
      const sig = data.results[0].text_signature;
      const name = sig.split('(')[0];
      return { name, signature: sig };
    }
  } catch {
    // Network error, not critical
  }
  return undefined;
}

/**
 * Get a human-readable label for a contract address
 */
export function getContractLabel(address: string): string | undefined {
  try {
    const checksummed = getAddress(address).toLowerCase();
    return KNOWN_CONTRACTS[checksummed];
  } catch {
    return undefined;
  }
}
