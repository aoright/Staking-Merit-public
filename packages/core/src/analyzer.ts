// ============================================
// ShieldWall Core — AI Semantic Analyzer
// ============================================
// Uses LLM to translate transaction data into human-readable explanations

import type {
  AIAnalysis,
  DecodedFunction,
  SimulationResult,
  ContractRisk,
  RawTransaction,
} from '@shieldwall/shared';

interface AIProviderConfig {
  provider: 'openai' | 'ollama';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

const DEFAULT_CONFIG: AIProviderConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
};

/**
 * Use an LLM to generate a human-readable analysis of a transaction.
 */
export async function analyzeWithAI(
  tx: RawTransaction,
  decoded: DecodedFunction | undefined,
  simulation: SimulationResult | undefined,
  contractRisk: ContractRisk | undefined,
  config: AIProviderConfig = DEFAULT_CONFIG
): Promise<AIAnalysis> {
  const prompt = buildPrompt(tx, decoded, simulation, contractRisk);

  try {
    const response = await callLLM(prompt, config);
    return parseAIResponse(response, config.model ?? 'unknown');
  } catch (err) {
    // Graceful degradation — return a basic analysis without AI
    return buildFallbackAnalysis(tx, decoded, simulation, contractRisk);
  }
}

/**
 * Build the analysis prompt with all available context.
 */
function buildPrompt(
  tx: RawTransaction,
  decoded: DecodedFunction | undefined,
  simulation: SimulationResult | undefined,
  contractRisk: ContractRisk | undefined
): string {
  let prompt = `You are ShieldWall, a Web3 security assistant. Analyze this blockchain transaction and explain it in simple, clear language for a non-technical user. Be concise but thorough about risks.

## Transaction Details
- **From:** ${tx.from}
- **To:** ${tx.to ?? 'Contract Creation'}
- **Value:** ${tx.value ?? '0'} wei
- **Chain ID:** ${tx.chainId ?? 'unknown'}
`;

  if (decoded) {
    prompt += `
## Decoded Function Call
- **Protocol:** ${decoded.protocol ?? 'Unknown'}
- **Function:** ${decoded.name}(${decoded.params.map((p) => `${p.name}: ${p.value}`).join(', ')})
`;
  }

  if (simulation) {
    prompt += `
## Simulation Results
- **Would succeed:** ${simulation.success ? 'Yes' : 'No'}
- **Gas estimate:** ${simulation.gasUsed}
${simulation.error ? `- **Error:** ${simulation.error}` : ''}
`;
    if (simulation.balanceChanges.length > 0) {
      prompt += `- **Balance changes:**\n`;
      for (const change of simulation.balanceChanges) {
        const direction = change.amount.startsWith('-') ? '📤 OUT' : '📥 IN';
        prompt += `  - ${direction} ${change.amount} ${change.symbol}\n`;
      }
    }
    if (simulation.approvalChanges.length > 0) {
      prompt += `- **Approval changes:**\n`;
      for (const change of simulation.approvalChanges) {
        prompt += `  - ${change.isRevoke ? '🔒 REVOKE' : '🔓 APPROVE'} ${change.newAllowance} ${change.symbol} → ${change.spender}\n`;
      }
    }
  }

  if (contractRisk) {
    prompt += `
## Contract Risk Assessment
- **Risk Level:** ${contractRisk.riskLevel}
- **Verified:** ${contractRisk.metadata.isVerified}
- **Is Proxy:** ${contractRisk.metadata.isProxy}
- **Age:** ${contractRisk.metadata.ageDays ?? 'unknown'} days
- **Signals:** ${contractRisk.signals.map((s) => s.title).join('; ')}
`;
  }

  prompt += `
## Your Task
Respond in this exact JSON format:
{
  "summary": "One-sentence plain-language summary of what this transaction does",
  "steps": ["Step 1 description", "Step 2 description"],
  "risks": ["Risk 1 description", "Risk 2 description"],
  "confidence": 0.95,
  "recommendation": "approve" | "caution" | "reject"
}

Rules:
- "summary" must be understandable by someone who has never used crypto
- "recommendation" should be "reject" if there are critical risks, "caution" if medium/high, "approve" if safe
- Be honest about uncertainties
`;

  return prompt;
}

/**
 * Call the LLM API
 */
async function callLLM(prompt: string, config: AIProviderConfig): Promise<string> {
  if (config.provider === 'ollama') {
    const baseUrl = config.baseUrl ?? 'http://localhost:11434';
    const resp = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model ?? 'llama3.1',
        prompt,
        stream: false,
        format: 'json',
      }),
    });
    const data = await resp.json();
    return data.response;
  }

  // OpenAI
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model ?? 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });
  const data = await resp.json();
  return data.choices[0].message.content;
}

/**
 * Parse the LLM's JSON response into our AIAnalysis type.
 */
function parseAIResponse(raw: string, model: string): AIAnalysis {
  try {
    const parsed = JSON.parse(raw);
    return {
      summary: parsed.summary ?? 'Unable to generate summary',
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      recommendation: ['approve', 'caution', 'reject'].includes(parsed.recommendation)
        ? parsed.recommendation
        : 'caution',
      model,
    };
  } catch {
    return {
      summary: raw.slice(0, 200),
      steps: [],
      risks: ['AI response could not be parsed'],
      confidence: 0.3,
      recommendation: 'caution',
      model,
    };
  }
}

/**
 * Generate a basic analysis without AI when LLM is unavailable.
 */
function buildFallbackAnalysis(
  tx: RawTransaction,
  decoded: DecodedFunction | undefined,
  simulation: SimulationResult | undefined,
  contractRisk: ContractRisk | undefined
): AIAnalysis {
  const risks: string[] = [];
  let recommendation: 'approve' | 'caution' | 'reject' = 'caution';

  if (contractRisk?.riskLevel === 'critical') {
    risks.push('Critical risk signals detected on target contract');
    recommendation = 'reject';
  }
  if (simulation && !simulation.success) {
    risks.push('Transaction simulation failed — it may revert on-chain');
  }
  if (simulation?.approvalChanges.some((a) => a.newAllowance === 'unlimited')) {
    risks.push('This transaction grants unlimited token approval');
  }

  const summary = decoded
    ? `Calling ${decoded.name}() on ${decoded.protocol ?? 'unknown contract'}`
    : `Transaction to ${tx.to ?? 'new contract'}`;

  return {
    summary,
    steps: decoded?.params.map((p) => `${p.name}: ${p.label ?? p.value}`) ?? [],
    risks,
    confidence: 0.5,
    recommendation,
    model: 'fallback-heuristic',
  };
}
