import { randomBytes } from 'crypto';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const ALLOWED_EVENTS = ['deal.stage_changed', 'item.moved'] as const;

const createSchema = z.object({
  target_url: z.string().url(),
  event: z.enum(ALLOWED_EVENTS),
});

export function createWebhooksRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // POST /api/webhooks/subscriptions
  router.post('/subscriptions', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      const secret = randomBytes(32).toString('hex');
      const sub = await db
        .insertInto('webhook_subscriptions')
        .values({
          workspace_id: workspace.id,
          target_url: parsed.data.target_url,
          event: parsed.data.event,
          secret,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: sub, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/webhooks/subscriptions
  router.get('/subscriptions', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const subs = await db
        .selectFrom('webhook_subscriptions')
        .select(['id', 'workspace_id', 'target_url', 'event', 'created_at'])
        .where('workspace_id', '=', workspace.id)
        .orderBy('created_at', 'asc')
        .execute();

      res.json({ data: subs, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/webhooks/subscriptions/:id
  router.delete('/subscriptions/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const deleted = await db
        .deleteFrom('webhook_subscriptions')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id'])
        .executeTakeFirst();

      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
        return;
      }

      res.json({ data: { id: deleted.id }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
