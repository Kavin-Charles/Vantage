import { readConfig } from '@vantage/config';
import { createDb } from '@vantage/db';
import { logger } from './lib/logger';
import { runWebsitePing } from './jobs/website-ping';
import { runAlertEval } from './jobs/alert-eval';
import { runDbHealth } from './jobs/db-health';
import { runServerStaleness } from './jobs/server-staleness';
import { runWebhookDelivery } from './jobs/webhook-delivery';

const config = readConfig();
const db = createDb(process.env['DATABASE_URL']!);

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
      await runWebhookDelivery(db);
      if (config.features.infra) {
        await runDbHealth(db);
        await runServerStaleness(db);
      }
    } catch (err) {
      logger.error({ err }, 'job error');
    } finally {
      running = false;
    }
  })();
  await inflightJob;
  inflightJob = null;
}, 60_000);

// Run immediately on start
runWebsitePing().catch((err: unknown) => logger.error({ err }, 'initial website ping error'));

process.on('SIGTERM', async () => {
  shuttingDown = true;
  logger.info('SIGTERM received, draining in-flight jobs...');
  if (inflightJob) await inflightJob;
  logger.info('Shutdown complete');
  process.exit(0);
});
