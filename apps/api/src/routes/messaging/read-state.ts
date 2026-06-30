import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../../middleware/auth';

const markReadSchema = z.object({ message_id: z.string().uuid() });

export function createReadStateRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
): import('express').Router {
  const router = Router({ mergeParams: true });

  // PATCH /channels/:channelId/read
  router.patch('/', requirePermission('messaging:view'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const channelId = req.params['channelId']!;
      const body = markReadSchema.parse(req.body);

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
        .insertInto('channel_read_state')
        .values({ channel_id: channelId, user_id: user.id, last_read_message_id: body.message_id })
        .onConflict(oc =>
          oc.columns(['channel_id', 'user_id']).doUpdateSet({ last_read_message_id: body.message_id }),
        )
        .execute();

      res.json({ data: { channel_id: channelId, last_read_message_id: body.message_id }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
