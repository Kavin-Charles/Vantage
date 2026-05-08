import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const updateSchema = z.object({
  cpu_pct: z.number().min(0).max(100).optional(),
  mem_pct: z.number().min(0).max(100).optional(),
  disk_pct: z.number().min(0).max(100).optional(),
  response_ms: z.number().int().min(100).optional(),
});

export function createAlertThresholdsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      let thresholds = await db
        .selectFrom('alert_thresholds')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .executeTakeFirst();

      if (!thresholds) {
        thresholds = await db
          .insertInto('alert_thresholds')
          .values({ workspace_id: workspace.id })
          .returningAll()
          .executeTakeFirstOrThrow();
      }

      res.json({ data: thresholds, error: null });
    } catch (err) { next(err); }
  });

  router.patch('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = updateSchema.parse(req.body);
      const thresholds = await db
        .updateTable('alert_thresholds')
        .set({ ...body, updated_at: new Date().toISOString() })
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!thresholds) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Thresholds not configured' } });
        return;
      }
      res.json({ data: thresholds, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
