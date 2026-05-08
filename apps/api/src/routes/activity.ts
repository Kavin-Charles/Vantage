import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createActivitySchema = z.object({
  type: z.enum(['email', 'call', 'note', 'meeting', 'deal_change', 'infra_alert']),
  body: z.string().optional(),
  contact_id: z.string().uuid().optional(),
  deal_id: z.string().uuid().optional(),
  meta: z.record(z.unknown()).optional(),
});

export function createActivityRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const page = Number(req.query['page'] ?? 1);
      const per_page = Math.min(Number(req.query['per_page'] ?? 25), 100);

      const activities = await db
        .selectFrom('activities')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page)
        .execute();

      const { count } = await db
        .selectFrom('activities')
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

      res.json({ data: activities, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const body = createActivitySchema.parse(req.body);

      const activity = await db
        .insertInto('activities')
        .values({
          workspace_id: workspace.id,
          user_id: user.id,
          type: body.type,
          body: body.body ?? null,
          contact_id: body.contact_id ?? null,
          deal_id: body.deal_id ?? null,
          meta: body.meta ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: activity, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
