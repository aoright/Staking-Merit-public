// ============================================
// ShieldWall Core — Risk Scoring Engine
// ============================================
// Combines all analysis signals into a single risk score

import type {
  AnalysisReport,
  InterceptedRequest,
  RiskLevel,
  SimulationResult,
  ContractRisk,
  AIAnalysis,
  DecodedFunction,
} from '@shieldwall/shared';
import { RISK_THRESHOLDS, PHISHING_SIGNATURES } from '@shieldwall/shared';

interface ScoringInput {
  decoded?: DecodedFunction;
  simulation?: SimulationResult;
  contractRisk?: ContractRisk;
  aiAnalysis?: AIAnalysis;
}

/**
 * Calculate a composite risk score (0-100) from all analysis signals.
 */
export function calculateRiskScore(input: ScoringInput): {
  score: number;
  level: RiskLevel;
} {
  let score = 0;

  // --- Simulation-based signals ---
  if (input.simulation) {
    if (!input.simulation.success) score += 30;
    if (input.simulation.approvalChanges.some((a) => a.newAllowance === 'unlimited')) {
      score += 25;
    }
    if (input.simulation.approvalChanges.some((a) => a.newAllowance === 'all tokens')) {
      score += 30; // setApprovalForAll is very dangerous
    }
    // High value outflow
    const totalOutUsd = input.simulation.balanceChanges
      .filter((c) => c.amount.startsWith('-'))
      .reduce((sum, c) => sum + (c.usdValue ?? 0), 0);
    if (totalOutUsd > 10000) score += 15;
    else if (totalOutUsd > 1000) score += 10;
  }

  // --- Contract risk signals ---
  if (input.contractRisk) {
    const severityWeights: Record<RiskLevel, number> = {
      safe: 0, low: 5, medium: 10, high: 20, critical: 35,
    };
    for (const signal of input.contractRisk.signals) {
      score += severityWeights[signal.severity] ?? 0;
    }
  }

  // --- Decoded function signals ---
  if (input.decoded) {
    // Check for known phishing function signatures
    const sig = input.decoded.signature.toLowerCase();
    if (PHISHING_SIGNATURES.some((p) => sig.includes(p.toLowerCase()))) {
      score += 40;
    }
    // Unknown/undecodable function
    if (input.decoded.name === 'unknown') score += 15;
  }

  // --- AI recommendation ---
  if (input.aiAnalysis) {
    if (input.aiAnalysis.recommendation === 'reject') score += 20;
    else if (input.aiAnalysis.recommendation === 'caution') score += 10;
    else if (input.aiAnalysis.recommendation === 'approve') score -= 10;
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine level
  let level: RiskLevel;
  if (score <= RISK_THRESHOLDS.SAFE) level = 'safe';
  else if (score <= RISK_THRESHOLDS.LOW) level = 'low';
  else if (score <= RISK_THRESHOLDS.MEDIUM) level = 'medium';
  else if (score <= RISK_THRESHOLDS.HIGH) level = 'high';
  else level = 'critical';

  return { score, level };
}

/**
 * Build a complete analysis report from all pipeline outputs.
 */
export function buildReport(
  request: InterceptedRequest,
  input: ScoringInput,
  startTime: number
): AnalysisReport {
  const { score, level } = calculateRiskScore(input);

  return {
    id: crypto.randomUUID(),
    request,
    riskLevel: level,
    riskScore: score,
    decoded: input.decoded,
    simulation: input.simulation,
    contractRisk: input.contractRisk,
    aiAnalysis: input.aiAnalysis,
    analysisDurationMs: Date.now() - startTime,
    timestamp: Date.now(),
  };
}
