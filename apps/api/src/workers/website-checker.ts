// Polls all websites every 60 seconds and updates status + response_ms.
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { logger } from '../lib/logger';

const INTERVAL_MS = 60_000;
const TIMEOUT_MS = 10_000;
const DEGRADED_THRESHOLD_MS = 2000;

async function checkUrl(url: string): Promise<{ status: 'online' | 'degraded' | 'offline'; response_ms: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    const ms = Date.now() - start;
    if (!res.ok && res.status >= 500) return { status: 'offline', response_ms: ms };
    return { status: ms > DEGRADED_THRESHOLD_MS ? 'degraded' : 'online', response_ms: ms };
  } catch {
    clearTimeout(timer);
    return { status: 'offline', response_ms: Date.now() - start };
  }
}

async function runCheck(db: Kysely<Database>): Promise<void> {
  const sites = await db.selectFrom('websites').selectAll().execute();
  if (sites.length === 0) return;

  await Promise.allSettled(sites.map(async site => {
    try {
      const { status, response_ms } = await checkUrl(site.url);
      await db
        .updateTable('websites')
        .set({ status, response_ms, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .where('id', '=', site.id)
        .execute();
    } catch (err) {
      logger.error({ err, url: site.url }, '[website-checker] check failed');
    }
  }));
}

export function startWebsiteChecker(db: Kysely<Database>): void {
  // Run immediately on startup, then every 60 s
  void runCheck(db).catch(err => logger.error({ err }, '[website-checker] initial run failed'));
  setInterval(() => {
    void runCheck(db).catch(err => logger.error({ err }, '[website-checker] run failed'));
  }, INTERVAL_MS);
  logger.info('website checker started (60-s polling)');
}
