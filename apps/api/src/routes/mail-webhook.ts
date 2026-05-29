import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { runIncrementalSync } from '../workers/mail-sync';
import { logger } from '../lib/logger';

export function createMailWebhookRouter(
  db: Kysely<Database>,
  pubsubToken: string,
): ExpressRouter {
  const router = Router();

  // POST /api/mail/webhook/gmail
  // Called by Google Pub/Sub push subscription.
  router.post('/gmail', async (req, res) => {
    const incomingToken = req.headers['x-goog-channel-token'];
    if (!incomingToken || incomingToken !== pubsubToken) {
      res.status(401).end();
      return;
    }

    try {
      // Pub/Sub message data is base64-encoded JSON
      const raw = req.body?.message?.data;
      if (!raw) { res.status(204).end(); return; }

      const payload = JSON.parse(Buffer.from(raw as string, 'base64').toString('utf8')) as {
        emailAddress?: string;
      };

      const emailAddress = payload.emailAddress;
      if (!emailAddress) { res.status(204).end(); return; }

      const account = await db
        .selectFrom('email_accounts')
        .where('email', '=', emailAddress)
        .where('provider', '=', 'gmail')
        .select('id')
        .executeTakeFirst();

      if (account) {
        void runIncrementalSync(db, account.id);
      }
    } catch (err) {
      logger.error({ err }, 'mail-webhook: failed to process Gmail push');
    }

    res.status(204).end();
  });

  return router;
}
