#!/usr/bin/env node
import { collectMetrics } from './collect';
import { checkDatabases } from './db-checks';
import { report } from './reporter';

const token = process.env['VANTAGE_TOKEN'];
const apiUrl = process.env['VANTAGE_API_URL'] ?? 'https://api.vantage.app';
const intervalMs = parseInt(process.env['VANTAGE_INTERVAL_MS'] ?? '30000', 10);

if (!token) {
  console.error('[vantage-agent] VANTAGE_TOKEN is required');
  process.exit(1);
}

const config = { apiUrl, token };

console.log(`[vantage-agent] starting — reporting to ${apiUrl} every ${intervalMs / 1000}s`);

async function tick(): Promise<void> {
  const metrics = collectMetrics();
  const dbChecks = await checkDatabases();
  await report(config, metrics, dbChecks);
}

// Run immediately, then on interval
void tick();
const interval = setInterval(() => { void tick(); }, intervalMs);

process.on('SIGTERM', () => {
  console.log('[vantage-agent] shutting down');
  clearInterval(interval);
  process.exit(0);
});
