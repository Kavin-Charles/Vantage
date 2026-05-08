import cron from 'node-cron';
import { logger } from './lib/logger';
import { runWebsitePing } from './jobs/website-ping';
import { runAlertEval } from './jobs/alert-eval';
import { runUsageSnapshot } from './jobs/usage-snapshot';

logger.info('Worker starting');

let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await runWebsitePing();
    await runAlertEval();
  } catch (err) {
    logger.error({ err }, 'job error');
  } finally {
    running = false;
  }
}, 60_000);

// Usage snapshot: daily at midnight UTC
cron.schedule('0 0 * * *', async () => {
  try {
    await runUsageSnapshot();
  } catch (err) {
    logger.error({ err }, 'usage snapshot error');
  }
}, { timezone: 'UTC' });

// Run website ping immediately on start
runWebsitePing().catch((err: unknown) => logger.error({ err }, 'initial website ping error'));

process.on('SIGTERM', () => {
  logger.info('Worker shutting down');
  process.exit(0);
});
