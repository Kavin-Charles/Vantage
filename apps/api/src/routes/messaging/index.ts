import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createChannelsRouter } from './channels';
import { createMessagesRouter } from './messages';
import { createMembersRouter } from './members';
import { createReactionsRouter } from './reactions';
import { createDmsRouter } from './dms';
import { createReadStateRouter } from './read-state';
import { createSearchRouter } from './search';
import { createUploadRouter } from './upload';

export function createMessagingRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
): Router {
  const router = Router();

  router.use('/channels/:channelId/messages', createMessagesRouter(db, requirePermission));
  router.use('/channels/:channelId/members', createMembersRouter(db, requirePermission));
  router.use('/channels/:channelId/read', createReadStateRouter(db, requirePermission));
  router.use('/channels', createChannelsRouter(db, requirePermission));
  router.use('/messages/:messageId/reactions', createReactionsRouter(db, requirePermission));
  // Thread + edit/delete on messages top-level
  router.use('/messages', createMessagesRouter(db, requirePermission));
  router.use('/dms', createDmsRouter(db, requirePermission));
  router.use('/search', createSearchRouter(db, requirePermission));
  router.use('/upload', createUploadRouter(requirePermission));

  return router;
}
