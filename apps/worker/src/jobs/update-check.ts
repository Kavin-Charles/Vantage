import { logger } from '../lib/logger';
import { apiEnvSchema } from '@vencore/config';

const env = apiEnvSchema.parse(process.env);
const API_URL = process.env['API_URL'] ?? 'http://localhost:3001';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let lastRunAt = 0;

export async function runUpdateCheck(): Promise<void> {
  if (Date.now() - lastRunAt < CHECK_INTERVAL_MS) return;
  lastRunAt = Date.now();

  try {
    const res = await fetch(`${API_URL}/api/system/internal-check`, {
      method: 'POST',
      headers: { 'x-cron-secret': env.CRON_SECRET },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'update check returned non-OK');
      return;
    }
    logger.debug('update check completed');
  } catch (err) {
    const isNetworkErr = err instanceof TypeError && err.message === 'fetch failed';
    if (isNetworkErr) {
      logger.debug('update check: api unreachable, will retry next interval');
    } else {
      logger.error({ err }, 'update check error');
    }
  }
}
