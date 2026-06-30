import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../../middleware/auth';
import { publishMessageEvent } from '../../lib/messaging-pubsub';

const reactionSchema = z.object({ emoji: z.string().trim().min(1).max(64) });

export function createReactionsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
): Router {
  const router = Router({ mergeParams: true });

  // POST /messages/:messageId/reactions
  router.post('/', requirePermission('messaging:send'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const messageId = req.params['messageId']!;
      const body = reactionSchema.parse(req.body);

      const message = await db
        .selectFrom('messages')
        .where('id', '=', messageId)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .select('id')
        .executeTakeFirst();

      if (!message) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Message not found' } });
        return;
      }

      await db
        .insertInto('message_reactions')
        .values({ message_id: messageId, user_id: user.id, emoji: body.emoji })
        .onConflict(oc => oc.columns(['message_id', 'user_id', 'emoji']).doNothing())
        .execute();

      const msg = await db.selectFrom('messages').where('id', '=', messageId).select(['channel_id', 'workspace_id']).executeTakeFirst();
      if (msg) {
        void publishMessageEvent(msg.workspace_id, msg.channel_id, {
          type: 'reaction.added', message_id: messageId, user_id: user.id, emoji: body.emoji,
        });
      }

      res.status(201).json({ data: { message_id: messageId, user_id: user.id, emoji: body.emoji }, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /messages/:messageId/reactions/:emoji
  router.delete('/:emoji', requirePermission('messaging:send'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const messageId = req.params['messageId']!;
      const emoji = req.params['emoji']!;

      const message = await db
        .selectFrom('messages')
        .where('id', '=', messageId)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();

      if (!message) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Message not found' } });
        return;
      }

      await db
        .deleteFrom('message_reactions')
        .where('message_id', '=', messageId)
        .where('user_id', '=', user.id)
        .where('emoji', '=', emoji)
        .execute();

      const msg2 = await db.selectFrom('messages').where('id', '=', messageId).select(['channel_id', 'workspace_id']).executeTakeFirst();
      if (msg2) {
        void publishMessageEvent(msg2.workspace_id, msg2.channel_id, {
          type: 'reaction.removed', message_id: messageId, user_id: user.id, emoji,
        });
      }

      res.json({ data: { message_id: messageId, user_id: user.id, emoji }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
