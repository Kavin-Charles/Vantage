import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../../middleware/auth';

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  channel_id: z.string().uuid().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function createSearchRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
) {
  const router = Router();

  router.get('/', requirePermission('messaging:view'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const query = searchQuerySchema.parse(req.query);

      // Channels the user is a member of (for access control on results)
      const memberChannels = await db
        .selectFrom('channel_members')
        .innerJoin('channels', join =>
          join.onRef('channels.id', '=', 'channel_members.channel_id')
              .on('channels.workspace_id', '=', workspace.id)
              .on('channels.archived_at', 'is', null),
        )
        .where('channel_members.user_id', '=', user.id)
        .select('channel_members.channel_id')
        .execute();

      const channelIds = memberChannels.map(c => c.channel_id);
      if (channelIds.length === 0) {
        res.json({ data: [], error: null });
        return;
      }

      const tsQuery = query.q
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .join(' & ');

      let q = db
        .selectFrom('messages')
        .innerJoin('users', 'users.id', 'messages.user_id')
        .innerJoin('channels', 'channels.id', 'messages.channel_id')
        .where('messages.workspace_id', '=', workspace.id)
        .where('messages.deleted_at', 'is', null)
        .where('messages.channel_id', 'in', channelIds)
        .where(sql`to_tsvector('english', messages.body) @@ to_tsquery('english', ${tsQuery})`)
        .select([
          'messages.id', 'messages.channel_id', 'messages.user_id', 'messages.body',
          'messages.created_at', 'messages.edited_at',
          'users.name as author_name',
          'channels.name as channel_name',
          sql<string>`ts_headline('english', messages.body, to_tsquery('english', ${tsQuery}), 'MaxWords=20,MinWords=5')`.as('snippet'),
        ])
        .orderBy('messages.created_at', 'desc')
        .limit(query.limit);

      if (query.channel_id) {
        q = q.where('messages.channel_id', '=', query.channel_id);
      }
      if (query.from_date) {
        q = q.where('messages.created_at', '>=', query.from_date);
      }
      if (query.to_date) {
        q = q.where('messages.created_at', '<=', query.to_date);
      }

      const results = await q.execute();
      res.json({ data: results, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
