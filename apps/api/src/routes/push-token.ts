// apps/api/src/routes/push-token.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const pushPreferencesSchema = z.object({
  alerts_critical: z.boolean().optional(),
  alerts_warning: z.boolean().optional(),
  tasks_due: z.boolean().optional(),
  deals_assigned: z.boolean().optional(),
  contacts_assigned: z.boolean().optional(),
});

export function createPushTokenRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // POST /api/me/push-token — upsert token on login
  router.post('/', async (req, res, next) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest;
      const { token, platform } = z
        .object({
          token: z.string().min(1),
          platform: z.enum(['ios', 'android']),
        })
        .parse(req.body);

      // Upsert: if this (user, token) pair already exists, update updated_at
      await db
        .insertInto('push_tokens')
        .values({
          user_id: user.id,
          workspace_id: workspace.id,
          token,
          platform,
          preferences: JSON.stringify({}) as never,
        })
        .onConflict(oc =>
          oc.columns(['user_id', 'token']).doUpdateSet({
            platform,
            updated_at: new Date(),
          }),
        )
        .execute();

      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/me/push-token — remove token on logout
  router.delete('/', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const { token } = z.object({ token: z.string().min(1) }).parse(req.body);

      await db
        .deleteFrom('push_tokens')
        .where('user_id', '=', user.id)
        .where('token', '=', token)
        .execute();

      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/me/push-token — update notification preferences
  router.patch('/', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const { token, preferences } = z
        .object({
          token: z.string().min(1),
          preferences: pushPreferencesSchema,
        })
        .parse(req.body);

      await db
        .updateTable('push_tokens')
        .set({
          preferences: JSON.stringify(preferences) as never,
          updated_at: new Date(),
        })
        .where('user_id', '=', user.id)
        .where('token', '=', token)
        .execute();

      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
