import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../../middleware/auth';

const inviteMemberSchema = z.object({ user_id: z.string().uuid() });

export function createMembersRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
) {
  const router = Router({ mergeParams: true });

  // GET /channels/:channelId/members
  router.get('/', requirePermission('messaging:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const channelId = req.params['channelId']!;

      const channel = await db
        .selectFrom('channels')
        .where('id', '=', channelId)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();

      if (!channel) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
        return;
      }

      const members = await db
        .selectFrom('channel_members')
        .innerJoin('users', 'users.id', 'channel_members.user_id')
        .where('channel_members.channel_id', '=', channelId)
        .select(['channel_members.user_id', 'channel_members.role', 'channel_members.joined_at', 'users.name', 'users.email'])
        .orderBy('channel_members.joined_at', 'asc')
        .execute();

      res.json({ data: members, error: null });
    } catch (err) { next(err); }
  });

  // POST /channels/:channelId/members — invite
  router.post('/', requirePermission('messaging:manage'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const channelId = req.params['channelId']!;
      const body = inviteMemberSchema.parse(req.body);

      const channel = await db
        .selectFrom('channels')
        .where('id', '=', channelId)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();

      if (!channel) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
        return;
      }

      await db
        .insertInto('channel_members')
        .values({ channel_id: channelId, user_id: body.user_id, role: 'member' })
        .onConflict(oc => oc.columns(['channel_id', 'user_id']).doNothing())
        .execute();

      res.status(201).json({ data: { channel_id: channelId, user_id: body.user_id }, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /channels/:channelId/members/:userId — remove member
  router.delete('/:userId', requirePermission('messaging:manage'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const channelId = req.params['channelId']!;
      const userId = req.params['userId']!;

      const channel = await db
        .selectFrom('channels')
        .where('id', '=', channelId)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();

      if (!channel) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
        return;
      }

      await db
        .deleteFrom('channel_members')
        .where('channel_id', '=', channelId)
        .where('user_id', '=', userId)
        .execute();

      res.json({ data: { channel_id: channelId, user_id: userId }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
