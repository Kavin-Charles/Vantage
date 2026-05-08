import cron from 'node-cron';
import { logger } from './lib/logger';
import { runWebsitePing } from './jobs/website-ping';
import { runAlertEval } from './jobs/alert-eval';
import { runUsageSnapshot } from './jobs/usage-snapshot';

logger.info('Worker starting');

let shuttingDown = false;
let inflightJob: Promise<void> | null = null;

let running = false;
setInterval(async () => {
  if (shuttingDown || running) return;
  running = true;
  inflightJob = (async () => {
    try {
      await runWebsitePing();
      await runAlertEval();
    } catch (err) {
      logger.error({ err }, 'job error');
    } finally {
      running = false;
    }
  })();
  await inflightJob;
  inflightJob = null;
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

process.on('SIGTERM', async () => {
  shuttingDown = true;
  logger.info('SIGTERM received, draining in-flight jobs...');
  if (inflightJob) await inflightJob;
  logger.info('Shutdown complete');
  process.exit(0);
});
