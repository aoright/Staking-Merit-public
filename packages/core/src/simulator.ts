// ============================================
// ShieldWall Core — Transaction Simulator
// ============================================
// Simulates transactions via eth_call to preview state changes

import {
  createPublicClient,
  http,
  formatUnits,
  parseAbi,
  type Hex,
  type PublicClient,
  type Address,
} from 'viem';
import type {
  RawTransaction,
  SimulationResult,
  BalanceChange,
  ApprovalChange,
  ChainId,
} from '@shieldwall/shared';
import { CHAINS, ERC20_ABI } from '@shieldwall/shared';

const MAX_UINT256 = BigInt(
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
);

/**
 * Simulate a transaction using eth_call + gas estimation
 * to preview balance changes, approvals, and gas usage.
 */
export async function simulateTransaction(
  tx: RawTransaction,
  chainId: ChainId,
  rpcUrl?: string
): Promise<SimulationResult> {
  const chain = CHAINS[chainId];
  if (!chain) {
    return {
      success: false,
      gasUsed: '0',
      balanceChanges: [],
      approvalChanges: [],
      internalCalls: [],
      logs: [],
      error: `Unsupported chain: ${chainId}`,
    };
  }

  const client = createPublicClient({
    transport: http(rpcUrl ?? chain.rpcUrl),
  });

  try {
    // 1. Estimate gas (validates the transaction)
    const gasEstimate = await client.estimateGas({
      account: tx.from as Address,
      to: tx.to as Address | undefined,
      value: tx.value ? BigInt(tx.value) : undefined,
      data: tx.data as Hex | undefined,
    });

    // 2. Simulate the call to check for revert
    try {
      await client.call({
        account: tx.from as Address,
        to: tx.to as Address | undefined,
        value: tx.value ? BigInt(tx.value) : undefined,
        data: tx.data as Hex | undefined,
      });
    } catch (callErr: unknown) {
      const errMessage = callErr instanceof Error ? callErr.message : String(callErr);
      return {
        success: false,
        gasUsed: gasEstimate.toString(),
        balanceChanges: [],
        approvalChanges: [],
        internalCalls: [],
        logs: [],
        error: `Transaction would revert: ${errMessage}`,
      };
    }

    // 3. Analyze balance and approval changes from calldata
    const balanceChanges = await analyzeBalanceChanges(client, tx, chainId);
    const approvalChanges = analyzeApprovalChanges(tx);

    // 4. Calculate gas cost in USD
    const gasCostUsd = await estimateGasCostUsd(client, gasEstimate, chainId);

    return {
      success: true,
      gasUsed: gasEstimate.toString(),
      balanceChanges,
      approvalChanges,
      internalCalls: [],
      logs: [],
      gasCostUsd,
    };
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      gasUsed: '0',
      balanceChanges: [],
      approvalChanges: [],
      internalCalls: [],
      logs: [],
      error: errMessage,
    };
  }
}

/** Analyze calldata for ERC-20 transfers */
async function analyzeBalanceChanges(
  client: PublicClient,
  tx: RawTransaction,
  chainId: ChainId
): Promise<BalanceChange[]> {
  const changes: BalanceChange[] = [];
  const chain = CHAINS[chainId];

  // Native token transfer
  if (tx.value && BigInt(tx.value) > 0n) {
    changes.push({
      token: 'native',
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
      amount: `-${tx.value}`,
    });
  }

  // ERC-20 transfer detection from calldata
  const data = tx.data as Hex | undefined;
  if (data && data.length >= 10 && tx.to) {
    const selector = data.slice(0, 10).toLowerCase();

    // transfer(address,uint256) = 0xa9059cbb
    if (selector === '0xa9059cbb') {
      const tokenInfo = await getTokenInfo(client, tx.to as Address);
      if (tokenInfo) {
        const amount = BigInt('0x' + data.slice(74, 138));
        changes.push({
          token: tx.to,
          symbol: tokenInfo.symbol,
          decimals: tokenInfo.decimals,
          amount: `-${amount.toString()}`,
        });
      }
    }
  }

  return changes;
}

/** Analyze calldata for token approvals */
function analyzeApprovalChanges(tx: RawTransaction): ApprovalChange[] {
  const changes: ApprovalChange[] = [];
  const data = tx.data as Hex | undefined;

  if (!data || data.length < 10 || !tx.to) return changes;

  const selector = data.slice(0, 10).toLowerCase();

  // approve(address,uint256) = 0x095ea7b3
  if (selector === '0x095ea7b3') {
    const spender = '0x' + data.slice(34, 74);
    const amount = BigInt('0x' + data.slice(74, 138));
    const isUnlimited = amount >= MAX_UINT256 / 2n;

    changes.push({
      token: tx.to,
      symbol: '',
      spender,
      previousAllowance: 'unknown',
      newAllowance: isUnlimited ? 'unlimited' : amount.toString(),
      isRevoke: amount === 0n,
    });
  }

  // setApprovalForAll(address,bool) = 0xa22cb465
  if (selector === '0xa22cb465') {
    const operator = '0x' + data.slice(34, 74);
    const approved = data.slice(74, 138).includes('1');

    changes.push({
      token: tx.to,
      symbol: 'NFT Collection',
      spender: operator,
      previousAllowance: 'unknown',
      newAllowance: approved ? 'all tokens' : '0',
      isRevoke: !approved,
    });
  }

  return changes;
}

/** Get basic ERC-20 token info */
async function getTokenInfo(
  client: PublicClient,
  address: Address
): Promise<{ symbol: string; decimals: number } | undefined> {
  try {
    const abi = parseAbi(ERC20_ABI);
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address, abi, functionName: 'symbol' }) as Promise<string>,
      client.readContract({ address, abi, functionName: 'decimals' }) as Promise<number>,
    ]);
    return { symbol, decimals };
  } catch {
    return undefined;
  }
}

/** Estimate gas cost in USD */
async function estimateGasCostUsd(
  client: PublicClient,
  gasEstimate: bigint,
  chainId: ChainId
): Promise<number | undefined> {
  try {
    const gasPrice = await client.getGasPrice();
    const gasCostWei = gasEstimate * gasPrice;
    const gasCostEth = parseFloat(formatUnits(gasCostWei, 18));
    const ethPrice = await getTokenPriceUsd(chainId);
    if (ethPrice) {
      return parseFloat((gasCostEth * ethPrice).toFixed(4));
    }
  } catch { /* not critical */ }
  return undefined;
}

/** Get native token price in USD */
async function getTokenPriceUsd(chainId: ChainId): Promise<number | undefined> {
  const ids: Partial<Record<ChainId, string>> = {
    1: 'ethereum', 10: 'ethereum', 56: 'binancecoin',
    137: 'matic-network', 8453: 'ethereum', 42161: 'ethereum', 43114: 'avalanche-2',
  };
  const id = ids[chainId];
  if (!id) return undefined;
  try {
    const resp = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
    );
    const data = await resp.json();
    return data[id]?.usd;
  } catch {
    return undefined;
  }
}
