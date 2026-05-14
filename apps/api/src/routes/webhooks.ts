import { randomBytes } from 'crypto';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const ALLOWED_EVENTS = ['deal.stage_changed', 'item.moved'] as const;

// Block private / loopback / link-local ranges to prevent SSRF
const PRIVATE_HOSTNAME_RE =
  /^(localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|::1|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:)/i;

function isSafeWebhookUrl(raw: string): boolean {
  try {
    const { hostname } = new URL(raw);
    return !PRIVATE_HOSTNAME_RE.test(hostname);
  } catch {
    return false;
  }
}

const createSchema = z.object({
  target_url: z
    .string()
    .url()
    .refine(isSafeWebhookUrl, { message: 'target_url must be a publicly reachable URL' }),
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
