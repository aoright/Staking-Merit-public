// ============================================
// ShieldWall Core — Contract Risk Scanner
// ============================================

import { createPublicClient, http, type Address } from 'viem';
import type {
  ContractRisk,
  ContractMetadata,
  RiskSignal,
  RiskLevel,
  ChainId,
} from '@shieldwall/shared';
import { CHAINS, KNOWN_CONTRACTS, RISK_THRESHOLDS } from '@shieldwall/shared';

/**
 * Scan a contract address for risk signals.
 */
export async function scanContract(
  address: string,
  chainId: ChainId,
  explorerApiKey?: string
): Promise<ContractRisk> {
  const signals: RiskSignal[] = [];
  const metadata = await fetchContractMetadata(address, chainId, explorerApiKey);

  // --- Risk Signal Detection ---

  // Unverified source code
  if (!metadata.isVerified) {
    signals.push({
      type: 'unverified_source',
      severity: 'high',
      title: 'Source Code Not Verified',
      description: 'Contract source code is not verified on block explorer. Cannot inspect logic.',
    });
  }

  // Brand new contract
  if (metadata.ageDays !== undefined && metadata.ageDays < 7) {
    signals.push({
      type: 'new_contract',
      severity: metadata.ageDays < 1 ? 'critical' : 'high',
      title: `Very New Contract (${metadata.ageDays} day${metadata.ageDays === 1 ? '' : 's'} old)`,
      description: 'Recently deployed contracts are higher risk. Scammers often deploy and drain within hours.',
    });
  }

  // Proxy contract
  if (metadata.isProxy) {
    signals.push({
      type: 'proxy_contract',
      severity: 'medium',
      title: 'Proxy Contract Detected',
      description: 'Logic can be changed by the owner. Verify the implementation contract.',
    });
  }

  // No audit
  if (metadata.audits.length === 0 && !isKnownContract(address)) {
    signals.push({
      type: 'no_audit',
      severity: 'medium',
      title: 'No Known Audit',
      description: 'No public audit reports found for this contract.',
    });
  }

  // Low interaction count
  if (metadata.uniqueUsers !== undefined && metadata.uniqueUsers < 50) {
    signals.push({
      type: 'low_interaction',
      severity: 'medium',
      title: `Low Usage (${metadata.uniqueUsers} unique users)`,
      description: 'Very few users have interacted with this contract.',
    });
  }

  // Calculate overall risk level
  const riskLevel = calculateRiskLevel(signals);

  return { address, chainId, riskLevel, signals, metadata };
}

/**
 * Fetch contract metadata from block explorer API
 */
async function fetchContractMetadata(
  address: string,
  chainId: ChainId,
  apiKey?: string
): Promise<ContractMetadata> {
  const chain = CHAINS[chainId];
  const defaultMeta: ContractMetadata = {
    isVerified: false,
    isProxy: false,
    audits: [],
    labels: [],
  };

  if (!chain) return defaultMeta;

  try {
    const params = new URLSearchParams({
      module: 'contract',
      action: 'getsourcecode',
      address,
      ...(apiKey ? { apikey: apiKey } : {}),
    });

    const resp = await fetch(`${chain.explorerApiUrl}?${params}`);
    const data = await resp.json();

    if (data.status === '1' && data.result?.[0]) {
      const info = data.result[0];
      const isVerified = info.SourceCode !== '';
      const isProxy = info.Proxy === '1' || info.Implementation !== '';

      // Get contract creation date
      let createdAt: number | undefined;
      let ageDays: number | undefined;
      try {
        const txParams = new URLSearchParams({
          module: 'contract',
          action: 'getcontractcreation',
          contractaddresses: address,
          ...(apiKey ? { apikey: apiKey } : {}),
        });
        const txResp = await fetch(`${chain.explorerApiUrl}?${txParams}`);
        const txData = await txResp.json();
        if (txData.result?.[0]?.timeStamp) {
          createdAt = parseInt(txData.result[0].timeStamp) * 1000;
          ageDays = Math.floor((Date.now() - createdAt) / 86400000);
        }
      } catch { /* not critical */ }

      // Check known labels
      const labels: string[] = [];
      const knownLabel = KNOWN_CONTRACTS[address.toLowerCase()];
      if (knownLabel) labels.push(knownLabel);

      return {
        isVerified,
        name: info.ContractName || undefined,
        compiler: info.CompilerVersion || undefined,
        isProxy,
        implementationAddress: info.Implementation || undefined,
        createdAt,
        ageDays,
        audits: [],
        labels,
      };
    }
  } catch { /* API failure, use defaults */ }

  return defaultMeta;
}

function isKnownContract(address: string): boolean {
  return address.toLowerCase() in KNOWN_CONTRACTS;
}

function calculateRiskLevel(signals: RiskSignal[]): RiskLevel {
  if (signals.some((s) => s.severity === 'critical')) return 'critical';
  if (signals.filter((s) => s.severity === 'high').length >= 2) return 'critical';
  if (signals.some((s) => s.severity === 'high')) return 'high';
  if (signals.some((s) => s.severity === 'medium')) return 'medium';
  if (signals.some((s) => s.severity === 'low')) return 'low';
  return 'safe';
}
