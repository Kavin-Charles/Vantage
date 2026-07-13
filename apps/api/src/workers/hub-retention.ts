/**
 * Hub retention worker — hard-deletes tombstoned hub records past the
 * retention window (default 30 days). Uninstalling a provider tombstones its
 * rows so a reinstall can restore them; this worker reclaims the space once
 * the window lapses.
 *
 * Runs once on boot (after a short delay) and then daily.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { purgeExpiredHubRecords } from '@vencore/plugin-runtime';
import { logger } from '../lib/logger';

const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

async function sweep(db: Kysely<Database>): Promise<void> {
  try {
    const purged = await purgeExpiredHubRecords(db as Kysely<any>, RETENTION_DAYS);
    if (purged > 0) {
      logger.info({ purged, retentionDays: RETENTION_DAYS }, 'Hub retention: purged expired tombstoned records');
    }
  } catch (err) {
    logger.error({ err }, 'Hub retention sweep failed');
  }
}

export function startHubRetention(db: Kysely<Database>): void {
  // First sweep 5 min after boot to avoid competing with startup work
  setTimeout(() => void sweep(db), 5 * 60 * 1000);
  setInterval(() => void sweep(db), DAY_MS);
}
