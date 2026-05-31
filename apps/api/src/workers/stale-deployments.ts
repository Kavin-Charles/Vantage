// Marks 'running' deployments older than 24 h as 'cancelled'.
// Prevents zombie records from staying in the running state if CI never calls PATCH.
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { logger } from '../lib/logger';

const INTERVAL_MS = 60 * 60 * 1_000; // 1 hour
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1_000; // 24 hours

async function cleanStale(db: Kysely<Database>): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
  const result = await db
    .updateTable('deployments')
    .set({ status: 'cancelled' })
    .where('status', '=', 'running')
    .where('started_at', '<', cutoff as unknown as Date)
    .returningAll()
    .execute();

  if (result.length > 0) {
    logger.info({ count: result.length }, '[stale-deployments] cancelled stale running deployments');
  }
}

export function startStaleDeploymentsCleaner(db: Kysely<Database>): void {
  // Run immediately on startup, then every hour
  void cleanStale(db).catch(err => logger.error({ err }, '[stale-deployments] initial run failed'));
  setInterval(() => {
    void cleanStale(db).catch(err => logger.error({ err }, '[stale-deployments] run failed'));
  }, INTERVAL_MS);
  logger.info('stale-deployments cleaner started (1-h interval)');
}
