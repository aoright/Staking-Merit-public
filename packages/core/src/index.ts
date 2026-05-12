// ============================================
// ShieldWall Core — Main Analysis Pipeline
// ============================================
// Orchestrates the full analysis: decode → simulate → scan → AI → score

import type {
  InterceptedRequest,
  AnalysisReport,
  ChainId,
} from '@shieldwall/shared';
import { decodeTransaction } from './decoder';
import { simulateTransaction } from './simulator';
import { scanContract } from './scanner';
import { analyzeWithAI } from './analyzer';
import { buildReport } from './scorer';

export interface PipelineConfig {
  /** Enable transaction simulation */
  simulationEnabled: boolean;
  /** Enable AI analysis */
  aiEnabled: boolean;
  /** AI provider config */
  aiProvider?: 'openai' | 'ollama';
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
  /** Block explorer API keys per chain */
  explorerApiKeys?: Partial<Record<ChainId, string>>;
  /** Custom RPC URLs per chain */
  customRpcs?: Partial<Record<ChainId, string>>;
}

/**
 * Run the full analysis pipeline on an intercepted request.
 *
 * Pipeline:
 * 1. Decode — parse calldata into human-readable function call
 * 2. Simulate — dry-run to preview balance/approval changes
 * 3. Scan — check contract risk signals (age, verification, etc.)
 * 4. AI Analyze — LLM generates plain-language explanation
 * 5. Score — combine all signals into risk score + report
 */
export async function analyzePipeline(
  request: InterceptedRequest,
  config: PipelineConfig
): Promise<AnalysisReport> {
  const startTime = Date.now();
  const chainId = request.chainId;
  const tx = request.transaction;

  // Step 1: Decode
  const decoded = tx ? await decodeTransaction(tx) : undefined;

  // Steps 2-4 run in parallel for speed
  const [simulation, contractRisk] = await Promise.all([
    // Step 2: Simulate
    tx && config.simulationEnabled
      ? simulateTransaction(tx, chainId, config.customRpcs?.[chainId])
      : Promise.resolve(undefined),

    // Step 3: Scan contract
    tx?.to
      ? scanContract(tx.to, chainId, config.explorerApiKeys?.[chainId])
      : Promise.resolve(undefined),
  ]);

  // Step 4: AI Analysis (depends on decode + simulation + scan results)
  const aiAnalysis = tx && config.aiEnabled
    ? await analyzeWithAI(tx, decoded, simulation, contractRisk, {
        provider: config.aiProvider ?? 'openai',
        apiKey: config.aiApiKey,
        baseUrl: config.aiBaseUrl,
        model: config.aiModel,
      })
    : undefined;

  // Step 5: Score and build report
  return buildReport(request, { decoded, simulation, contractRisk, aiAnalysis }, startTime);
}

// Re-export all modules
export { decodeTransaction } from './decoder';
export { simulateTransaction } from './simulator';
export { scanContract } from './scanner';
export { analyzeWithAI } from './analyzer';
export { calculateRiskScore, buildReport } from './scorer';
