// ============================================
// ShieldWall — API Server
// ============================================
// Optional backend service for:
// 1. Centralized AI analysis (keep API keys server-side)
// 2. Community threat intelligence database
// 3. Contract risk caching

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { RawTransaction, ChainId } from '@shieldwall/shared';
import { analyzePipeline, type PipelineConfig } from '@shieldwall/core';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// ---- Health Check ----
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'shieldwall-api', version: '0.1.0' });
});

// ---- Analyze Transaction ----
app.post('/api/v1/analyze', async (c) => {
  try {
    const body = await c.req.json();
    const { transaction, chainId, method, origin } = body as {
      transaction: RawTransaction;
      chainId: ChainId;
      method: string;
      origin: string;
    };

    if (!transaction || !chainId) {
      return c.json({ error: 'Missing transaction or chainId' }, 400);
    }

    const config: PipelineConfig = {
      simulationEnabled: true,
      aiEnabled: !!process.env.OPENAI_API_KEY,
      aiProvider: (process.env.AI_PROVIDER as 'openai' | 'ollama') ?? 'openai',
      aiApiKey: process.env.OPENAI_API_KEY,
      aiBaseUrl: process.env.OLLAMA_BASE_URL,
      explorerApiKeys: {
        1: process.env.ETHERSCAN_API_KEY,
        42161: process.env.ARBISCAN_API_KEY,
        8453: process.env.BASESCAN_API_KEY,
        137: process.env.POLYGONSCAN_API_KEY,
        56: process.env.BSCSCAN_API_KEY,
      } as Partial<Record<ChainId, string>>,
    };

    const request = {
      id: crypto.randomUUID(),
      method: method ?? 'eth_sendTransaction',
      params: [transaction],
      chainId,
      origin: origin ?? 'api',
      timestamp: Date.now(),
      transaction,
    } as any;

    const report = await analyzePipeline(request, config);
    return c.json(report);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

// ---- Report Threat ----
app.post('/api/v1/threats/report', async (c) => {
  const body = await c.req.json();
  const { address, chainId, reason, reporter } = body;

  if (!address || !chainId || !reason) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // TODO: Store in SQLite threat database
  console.log(`[THREAT REPORT] ${address} on chain ${chainId}: ${reason}`);

  return c.json({ status: 'received', message: 'Thank you for the report' });
});

// ---- Check Address Threat Status ----
app.get('/api/v1/threats/:address', async (c) => {
  const address = c.req.param('address');

  // TODO: Query SQLite threat database
  return c.json({
    address,
    reported: false,
    reports: 0,
    labels: [],
  });
});

// ---- Start Server ----
const port = parseInt(process.env.SERVER_PORT ?? '3100');

console.log(`
  ╔══════════════════════════════════════════╗
  ║   🛡️  ShieldWall API Server             ║
  ║   Running on http://localhost:${port}       ║
  ╚══════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
