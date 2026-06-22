import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../../middleware/auth';
import { publishMessageEvent } from '../../lib/messaging-pubsub';
import { messagingSendRateLimit } from '../../middleware/messaging-rate-limit';

const attachmentInputSchema = z.object({
  r2_key: z.string().min(1).max(500),
  filename: z.string().min(1).max(255),
  size_bytes: z.number().int().min(1).max(10 * 1024 * 1024),
  mime_type: z.string().min(1).max(120),
});

const sendMessageSchema = z.object({
  body: z.string().trim().min(0).max(4000).default(''),
  mention_user_ids: z.array(z.string().uuid()).optional(),
  parent_message_id: z.string().uuid().optional(),
  attachments: z.array(attachmentInputSchema).max(10).optional(),
}).refine(d => d.body.trim().length > 0 || (d.attachments?.length ?? 0) > 0, {
  message: 'Message must have body text or at least one attachment',
});

const editMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

const historyQuerySchema = z.object({
  before_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

async function assertChannelAccess(
  db: Kysely<Database>,
  channelId: string,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const channel = await db
    .selectFrom('channels')
    .where('id', '=', channelId)
    .where('workspace_id', '=', workspaceId)
    .select(['id', 'is_private'])
    .executeTakeFirst();

  if (!channel) return false;
  if (!channel.is_private) return true;

  const membership = await db
    .selectFrom('channel_members')
    .where('channel_id', '=', channelId)
    .where('user_id', '=', userId)
    .select('user_id')
    .executeTakeFirst();

  return !!membership;
}

async function hydrateMessages(db: Kysely<Database>, messages: { id: string; user_id: string | null }[]) {
  if (messages.length === 0) return [];

  const messageIds = messages.map(m => m.id);
  const userIds = [...new Set(messages.map(m => m.user_id).filter(Boolean))] as string[];

  const [reactions, attachments, users] = await Promise.all([
    db.selectFrom('message_reactions')
      .where('message_id', 'in', messageIds)
      .selectAll()
      .execute(),
    db.selectFrom('message_attachments')
      .where('message_id', 'in', messageIds)
      .selectAll()
      .execute(),
    userIds.length
      ? db.selectFrom('users').where('id', 'in', userIds).select(['id', 'name', 'email']).execute()
      : Promise.resolve([]),
  ]);

  const reactionsByMsg = new Map<string, typeof reactions>();
  for (const r of reactions) {
    const list = reactionsByMsg.get(r.message_id) ?? [];
    list.push(r);
    reactionsByMsg.set(r.message_id, list);
  }
  const attachmentsByMsg = new Map<string, typeof attachments>();
  for (const a of attachments) {
    const list = attachmentsByMsg.get(a.message_id) ?? [];
    list.push(a);
    attachmentsByMsg.set(a.message_id, list);
  }
  const userMap = new Map(users.map(u => [u.id, u]));

  return messages.map(m => ({
    ...m,
    reactions: reactionsByMsg.get(m.id) ?? [],
    attachments: attachmentsByMsg.get(m.id) ?? [],
    author: m.user_id ? (userMap.get(m.user_id) ?? null) : null,
  }));
}

export function createMessagesRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
) {
  const router = Router({ mergeParams: true });

  // GET /channels/:channelId/messages — cursor-paginated history
  router.get('/', requirePermission('messaging:view'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const channelId = req.params['channelId']!;
      const query = historyQuerySchema.parse(req.query);

      const canAccess = await assertChannelAccess(db, channelId, workspace.id, user.id);
      if (!canAccess) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
        return;
      }

      let q = db
        .selectFrom('messages')
        .where('channel_id', '=', channelId)
        .where('parent_message_id', 'is', null) // top-level only; threads fetched separately
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(query.limit + 1);

      if (query.before_id) {
        const pivot = await db
          .selectFrom('messages')
          .where('id', '=', query.before_id)
          .select('created_at')
          .executeTakeFirst();
        if (pivot) {
          q = q.where('created_at', '<', pivot.created_at);
        }
      }

      const rows = await q.execute();
      const has_more = rows.length > query.limit;
      const messages = rows.slice(0, query.limit).reverse(); // oldest-first for display

      const hydrated = await hydrateMessages(db, messages);
      const oldest_id = messages[0]?.id ?? null;

      res.json({ data: { messages: hydrated, has_more, oldest_id }, error: null });
    } catch (err) { next(err); }
  });

  // POST /channels/:channelId/messages — send message
  router.post('/', requirePermission('messaging:send'), messagingSendRateLimit, async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const channelId = req.params['channelId']!;
      const body = sendMessageSchema.parse(req.body);

      const canAccess = await assertChannelAccess(db, channelId, workspace.id, user.id);
      if (!canAccess) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
        return;
      }

      // Validate r2_key ownership — must be under this workspace's prefix
      if (body.attachments?.length) {
        const prefix = `messaging/${workspace.id}/`;
        for (const att of body.attachments) {
          if (!att.r2_key.startsWith(prefix)) {
            res.status(400).json({ data: null, error: { code: 'INVALID_ATTACHMENT', message: 'Invalid attachment key' } });
            return;
          }
        }
      }

      const message = await db
        .insertInto('messages')
        .values({
          channel_id: channelId,
          workspace_id: workspace.id,
          user_id: user.id,
          body: body.body,
          parent_message_id: body.parent_message_id ?? null,
          mention_user_ids: body.mention_user_ids ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Persist attachment records
      if (body.attachments?.length) {
        await db
          .insertInto('message_attachments')
          .values(body.attachments.map(a => ({
            message_id: message.id,
            workspace_id: workspace.id,
            r2_key: a.r2_key,
            filename: a.filename,
            size_bytes: a.size_bytes,
            mime_type: a.mime_type,
          })))
          .execute();
      }

      // Increment parent thread_count
      if (body.parent_message_id) {
        await db
          .updateTable('messages')
          .where('id', '=', body.parent_message_id)
          .set({ thread_count: sql`thread_count + 1` })
          .execute();
      }

      const [hydrated] = await hydrateMessages(db, [message]);

      // Broadcast to WS clients (fire-and-forget)
      void publishMessageEvent(workspace.id, channelId, { type: 'message.new', message: hydrated as any });

      res.status(201).json({ data: hydrated, error: null });
    } catch (err) { next(err); }
  });

  // GET /messages/:id/thread — fetch thread replies
  router.get('/:id/thread', requirePermission('messaging:view'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const parentId = req.params['id']!;

      const parent = await db
        .selectFrom('messages')
        .where('id', '=', parentId)
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'channel_id'])
        .executeTakeFirst();

      if (!parent) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Message not found' } });
        return;
      }

      const canAccess = await assertChannelAccess(db, parent.channel_id, workspace.id, user.id);
      if (!canAccess) {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Access denied' } });
        return;
      }

      const replies = await db
        .selectFrom('messages')
        .where('parent_message_id', '=', parentId)
        .selectAll()
        .orderBy('created_at', 'asc')
        .execute();

      const hydrated = await hydrateMessages(db, replies);
      res.json({ data: hydrated, error: null });
    } catch (err) { next(err); }
  });

  // PATCH /messages/:id — edit own message
  router.patch('/:id', requirePermission('messaging:send'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const body = editMessageSchema.parse(req.body);

      const existing = await db
        .selectFrom('messages')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'user_id', 'deleted_at'])
        .executeTakeFirst();

      if (!existing || existing.deleted_at) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Message not found' } });
        return;
      }
      if (existing.user_id !== user.id) {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Can only edit your own messages' } });
        return;
      }

      const updated = await db
        .updateTable('messages')
        .where('id', '=', existing.id)
        .set({ body: body.body, edited_at: new Date().toISOString() })
        .returningAll()
        .executeTakeFirstOrThrow();

      void publishMessageEvent(workspace.id, updated.channel_id, {
        type: 'message.edited',
        message_id: updated.id,
        body: updated.body,
        edited_at: updated.edited_at!,
      });

      res.json({ data: updated, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /messages/:id — soft delete (own) or any (messaging:manage)
  router.delete('/:id', requirePermission('messaging:send'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;

      const existing = await db
        .selectFrom('messages')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'user_id', 'deleted_at'])
        .executeTakeFirst();

      if (!existing || existing.deleted_at) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Message not found' } });
        return;
      }

      // Admins can delete any message; members only their own
      const isOwner = existing.user_id === user.id;
      const isAdmin = user.role === 'admin';
      if (!isOwner && !isAdmin) {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Can only delete your own messages' } });
        return;
      }

      await db
        .updateTable('messages')
        .where('id', '=', existing.id)
        .set({ deleted_at: new Date().toISOString(), body: '[deleted]' })
        .execute();

      // Decrement parent thread_count if reply
      const full = await db.selectFrom('messages').where('id', '=', existing.id).select(['parent_message_id', 'channel_id']).executeTakeFirst();
      if (full?.parent_message_id) {
        await db
          .updateTable('messages')
          .where('id', '=', full.parent_message_id)
          .set({ thread_count: sql`GREATEST(thread_count - 1, 0)` })
          .execute();
      }

      if (full) {
        void publishMessageEvent(workspace.id, full.channel_id, {
          type: 'message.deleted',
          message_id: existing.id,
          channel_id: full.channel_id,
        });
      }

      res.json({ data: { id: existing.id }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
