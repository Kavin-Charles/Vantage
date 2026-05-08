import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { calculateBill } from '../lib/billing';
import { logger } from '../lib/logger';

export function createInternalRouter(db: Kysely<Database>, cronSecret: string): ExpressRouter {
  const router = Router();

  // Middleware: validate CRON_SECRET header
  router.use((req, res, next) => {
    const secret = req.headers['x-cron-secret'];
    if (secret !== cronSecret) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' } });
      return;
    }
    next();
  });

  router.post('/cron/usage-snapshot', async (_req, res, next) => {
    try {
      const workspaces = await db
        .selectFrom('workspaces')
        .where('plan', '!=', 'cancelled')
        .selectAll()
        .execute();

      const today = new Date();
      const periodStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      let snapshotted = 0;

      for (const ws of workspaces) {
        const bill = calculateBill({
          contacts: ws.contact_count,
          servers: ws.server_count,
          dbs: ws.db_count,
          seats: ws.seat_count,
        });

        // Upsert usage meter for current period
        const existing = await db
          .selectFrom('usage_meters')
          .where('workspace_id', '=', ws.id)
          .where('period_start', '=', periodStart)
          .selectAll()
          .executeTakeFirst();

        if (existing) {
          await db
            .updateTable('usage_meters')
            .set({
              contact_count_peak: Math.max(existing.contact_count_peak, ws.contact_count),
              server_count_peak: Math.max(existing.server_count_peak, ws.server_count),
              db_count_peak: Math.max(existing.db_count_peak, ws.db_count),
              seat_count_peak: Math.max(existing.seat_count_peak, ws.seat_count),
              base_fee: bill.base / 100,
              overage_total: bill.overage / 100,
              total_bill: bill.total / 100,
            })
            .where('id', '=', existing.id)
            .execute();
        } else {
          await db.insertInto('usage_meters').values({
            workspace_id: ws.id,
            period_start: periodStart,
            period_end: periodEnd,
            contact_count_peak: ws.contact_count,
            server_count_peak: ws.server_count,
            db_count_peak: ws.db_count,
            seat_count_peak: ws.seat_count,
            base_fee: bill.base / 100,
            overage_total: bill.overage / 100,
            total_bill: bill.total / 100,
          }).execute();
        }

        snapshotted++;
      }

      logger.info({ snapshotted }, 'Usage snapshot complete');
      res.json({ data: { snapshotted }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
