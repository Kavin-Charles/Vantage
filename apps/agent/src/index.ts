#!/usr/bin/env node
import { collectMetrics } from './collect';
import { checkDatabases } from './db-checks';
import { report } from './reporter';

const token = process.env['VENCORE_TOKEN'];
const apiUrl = process.env['VENCORE_API_URL'] ?? 'https://api.vencore.app';
const intervalMs = parseInt(process.env['VENCORE_INTERVAL_MS'] ?? '30000', 10);

if (!token) {
  console.error('[vencore-agent] VENCORE_TOKEN is required');
  process.exit(1);
}

const config = { apiUrl, token };

console.log(`[vencore-agent] starting — reporting to ${apiUrl} every ${intervalMs / 1000}s`);

async function tick(): Promise<void> {
  const metrics = collectMetrics();
  const dbChecks = await checkDatabases();
  await report(config, metrics, dbChecks);
}

// Run immediately, then on interval
void tick();
const interval = setInterval(() => { void tick(); }, intervalMs);

process.on('SIGTERM', () => {
  console.log('[vencore-agent] shutting down');
  clearInterval(interval);
  process.exit(0);
});
