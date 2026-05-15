import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(50).default(20),
  unread_only: z.coerce.boolean().optional(),
});

export function createNotificationsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/notifications
  router.get('/', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, unread_only } = parsed.data;

      let query = db
        .selectFrom('notifications')
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '=', user.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (unread_only) query = query.where('read', '=', false);

      const notifications = await query.execute();

      let countQuery = db
        .selectFrom('notifications')
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '=', user.id)
        .select(db.fn.countAll<number>().as('count'));

      if (unread_only) countQuery = countQuery.where('read', '=', false);

      const { count } = await countQuery.executeTakeFirstOrThrow();

      res.json({ data: notifications, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/notifications/unread-count
  router.get('/unread-count', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const { count } = await db
        .selectFrom('notifications')
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '=', user.id)
        .where('read', '=', false)
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

      res.json({ data: { count: Number(count) }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/notifications/read-all
  router.patch('/read-all', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      await db
        .updateTable('notifications')
        .set({ read: true })
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '=', user.id)
        .where('read', '=', false)
        .execute();

      res.json({ data: null, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/notifications/:id/read
  router.patch('/:id/read', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const notification = await db
        .updateTable('notifications')
        .set({ read: true })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '=', user.id)
        .returningAll()
        .executeTakeFirst();

      if (!notification) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Notification not found' } });
        return;
      }
      res.json({ data: notification, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
