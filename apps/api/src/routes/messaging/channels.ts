import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../../middleware/auth';

const createChannelSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(['channel', 'dm', 'group_dm']).default('channel'),
  is_private: z.boolean().default(false),
  topic: z.string().trim().max(500).optional(),
  member_ids: z.array(z.string().uuid()).optional(),
});

const updateChannelSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  topic: z.string().trim().max(500).nullable().optional(),
  is_private: z.boolean().optional(),
});

export function createChannelsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
): Router {
  const router = Router();

  // List channels the user belongs to, with unread counts.
  // Admins may pass ?scope=all to get every workspace channel with member_count (no unread tracking).
  router.get('/', requirePermission('messaging:view'), async (req, res, next) => {
    try {
      const { workspace, user, isAdmin } = req as unknown as AuthenticatedRequest;

      if (req.query['scope'] === 'all' && isAdmin) {
        const allChannels = await db
          .selectFrom('channels')
          .where('channels.workspace_id', '=', workspace.id)
          .select([
            'channels.id', 'channels.workspace_id', 'channels.name', 'channels.type',
            'channels.is_private', 'channels.topic', 'channels.created_by',
            'channels.archived_at', 'channels.created_at', 'channels.updated_at',
          ])
          .orderBy('channels.name', 'asc')
          .execute();

        const channelIds = allChannels.map(c => c.id);
        const memberCounts = channelIds.length
          ? await db
              .selectFrom('channel_members')
              .where('channel_id', 'in', channelIds)
              .select(['channel_id', db.fn.countAll().as('count')])
              .groupBy('channel_id')
              .execute()
          : [];
        const countMap = new Map(memberCounts.map(r => [r.channel_id, Number(r.count)]));

        res.json({
          data: allChannels.map(c => ({ ...c, member_count: countMap.get(c.id) ?? 0 })),
          error: null,
        });
        return;
      }

      const rows = await db
        .selectFrom('channels')
        .innerJoin('channel_members', join =>
          join.onRef('channel_members.channel_id', '=', 'channels.id')
              .on('channel_members.user_id', '=', user.id),
        )
        .where('channels.workspace_id', '=', workspace.id)
        .where('channels.archived_at', 'is', null)
        .select([
          'channels.id', 'channels.workspace_id', 'channels.name', 'channels.type',
          'channels.is_private', 'channels.topic', 'channels.created_by',
          'channels.archived_at', 'channels.created_at', 'channels.updated_at',
          'channel_members.role',
        ])
        .orderBy('channels.name', 'asc')
        .execute();

      // Fetch unread counts: messages after last_read_message_id
      const channelIds = rows.map(r => r.id);
      const readStates = channelIds.length
        ? await db
            .selectFrom('channel_read_state')
            .where('user_id', '=', user.id)
            .where('channel_id', 'in', channelIds)
            .select(['channel_id', 'last_read_message_id'])
            .execute()
        : [];

      const readMap = new Map(readStates.map(r => [r.channel_id, r.last_read_message_id]));

      // Fetch latest message per channel for preview
      const latestMessages = channelIds.length
        ? await db
            .selectFrom('messages')
            .where('channel_id', 'in', channelIds)
            .where('deleted_at', 'is', null)
            .distinctOn(['channel_id'])
            .select(['id', 'channel_id', 'user_id', 'body', 'created_at'])
            .orderBy('channel_id')
            .orderBy('created_at', 'desc')
            .execute()
        : [];

      const latestMap = new Map(latestMessages.map(m => [m.channel_id, m]));

      // Build unread count per channel
      const unreadCounts: Record<string, number> = {};
      for (const channelId of channelIds) {
        const lastRead = readMap.get(channelId) ?? null;
        if (!lastRead) {
          // Never read — count all messages
          const countRow = await db
            .selectFrom('messages')
            .where('channel_id', '=', channelId)
            .where('deleted_at', 'is', null)
            .where('user_id', '!=', user.id)
            .select(db.fn.countAll().as('count'))
            .executeTakeFirst();
          unreadCounts[channelId] = Number(countRow?.count ?? 0);
        } else {
          const lastReadMsg = await db
            .selectFrom('messages')
            .where('id', '=', lastRead)
            .select('created_at')
            .executeTakeFirst();
          if (lastReadMsg) {
            const countRow = await db
              .selectFrom('messages')
              .where('channel_id', '=', channelId)
              .where('deleted_at', 'is', null)
              .where('user_id', '!=', user.id)
              .where('created_at', '>', lastReadMsg.created_at)
              .select(db.fn.countAll().as('count'))
              .executeTakeFirst();
            unreadCounts[channelId] = Number(countRow?.count ?? 0);
          } else {
            unreadCounts[channelId] = 0;
          }
        }
      }

      const channels = rows.map(r => ({
        ...r,
        unread_count: unreadCounts[r.id] ?? 0,
        last_message: latestMap.get(r.id) ?? null,
      }));

      res.json({ data: channels, error: null });
    } catch (err) { next(err); }
  });

  // Create channel
  router.post('/', requirePermission('messaging:manage'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const body = createChannelSchema.parse(req.body);

      const channel = await db
        .insertInto('channels')
        .values({
          workspace_id: workspace.id,
          name: body.name,
          type: body.type,
          is_private: body.is_private,
          topic: body.topic ?? null,
          created_by: user.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Add creator as owner
      const memberIds = [user.id, ...(body.member_ids ?? []).filter(id => id !== user.id)];
      await db
        .insertInto('channel_members')
        .values(memberIds.map((uid, i) => ({
          channel_id: channel.id,
          user_id: uid,
          role: i === 0 ? 'owner' : 'member',
        })))
        .execute();

      res.status(201).json({ data: channel, error: null });
    } catch (err) { next(err); }
  });

  // Get channel + members
  router.get('/:id', requirePermission('messaging:view'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const channel = await db
        .selectFrom('channels')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .executeTakeFirst();

      if (!channel) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
        return;
      }

      // Private channel: must be member
      if (channel.is_private) {
        const membership = await db
          .selectFrom('channel_members')
          .where('channel_id', '=', channel.id)
          .where('user_id', '=', user.id)
          .select('role')
          .executeTakeFirst();
        if (!membership) {
          res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Not a member of this channel' } });
          return;
        }
      }

      const members = await db
        .selectFrom('channel_members')
        .innerJoin('users', 'users.id', 'channel_members.user_id')
        .where('channel_members.channel_id', '=', channel.id)
        .select(['channel_members.user_id', 'channel_members.role', 'channel_members.joined_at', 'users.name', 'users.email'])
        .execute();

      res.json({ data: { ...channel, members }, error: null });
    } catch (err) { next(err); }
  });

  // Update channel
  router.patch('/:id', requirePermission('messaging:manage'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = updateChannelSchema.parse(req.body);

      const updated = await db
        .updateTable('channels')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .set({ ...body, updated_at: new Date().toISOString() })
        .returningAll()
        .executeTakeFirst();

      if (!updated) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
        return;
      }
      res.json({ data: updated, error: null });
    } catch (err) { next(err); }
  });

  // Archive channel
  router.delete('/:id', requirePermission('messaging:manage'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const updated = await db
        .updateTable('channels')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .set({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .returningAll()
        .executeTakeFirst();

      if (!updated) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
        return;
      }
      res.json({ data: updated, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
