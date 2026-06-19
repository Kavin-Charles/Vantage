import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../../middleware/auth';

const openDmSchema = z.object({ user_id: z.string().uuid() });

export function createDmsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
) {
  const router = Router();

  // GET /dms — list open DM conversations
  router.get('/', requirePermission('messaging:view'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;

      const dms = await db
        .selectFrom('channels')
        .innerJoin('channel_members', join =>
          join.onRef('channel_members.channel_id', '=', 'channels.id')
              .on('channel_members.user_id', '=', user.id),
        )
        .where('channels.workspace_id', '=', workspace.id)
        .where('channels.type', 'in', ['dm', 'group_dm'])
        .where('channels.archived_at', 'is', null)
        .selectAll('channels')
        .orderBy('channels.updated_at', 'desc')
        .execute();

      res.json({ data: dms, error: null });
    } catch (err) { next(err); }
  });

  // POST /dms — open or find existing DM with a user
  router.post('/', requirePermission('messaging:send'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const body = openDmSchema.parse(req.body);

      if (body.user_id === user.id) {
        res.status(400).json({ data: null, error: { code: 'INVALID', message: 'Cannot DM yourself' } });
        return;
      }

      // Find existing DM between the two users in this workspace
      const existing = await db
        .selectFrom('channels')
        .innerJoin('channel_members as cm1', join =>
          join.onRef('cm1.channel_id', '=', 'channels.id').on('cm1.user_id', '=', user.id),
        )
        .innerJoin('channel_members as cm2', join =>
          join.onRef('cm2.channel_id', '=', 'channels.id').on('cm2.user_id', '=', body.user_id),
        )
        .where('channels.workspace_id', '=', workspace.id)
        .where('channels.type', '=', 'dm')
        .selectAll('channels')
        .executeTakeFirst();

      if (existing) {
        res.json({ data: existing, error: null });
        return;
      }

      // Create new DM channel — name is "dm" (display built from member names in frontend)
      const dm = await db
        .insertInto('channels')
        .values({
          workspace_id: workspace.id,
          name: 'dm',
          type: 'dm',
          is_private: true,
          created_by: user.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await db
        .insertInto('channel_members')
        .values([
          { channel_id: dm.id, user_id: user.id, role: 'member' },
          { channel_id: dm.id, user_id: body.user_id, role: 'member' },
        ])
        .execute();

      res.status(201).json({ data: dm, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
