import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { decryptSecret } from '../lib/mail-crypto';
import { createGmailProvider } from '../lib/gmail-provider';
import { createImapProvider } from '../lib/imap-provider';
import { logger } from '../lib/logger';

export function createMailBodyRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/mail/emails/:id/body
  // Fetches the full body of a single email live from IMAP/Gmail. Never stored in DB.
  router.get('/:id/body', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;

      const email = await db
        .selectFrom('emails')
        .where('id', '=', req.params['id']!)
        .where('user_id', '=', user.id)
        .select(['id', 'account_id', 'message_id'])
        .executeTakeFirst();
      if (!email) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Email not found' } });
        return;
      }

      const account = await db
        .selectFrom('email_accounts')
        .where('id', '=', email.account_id)
        .selectAll()
        .executeTakeFirst();
      if (!account) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Account not found' } });
        return;
      }

      let provider;
      if (account.provider === 'gmail') {
        provider = createGmailProvider({
          accessToken: decryptSecret(account.access_token!),
          refreshToken: decryptSecret(account.refresh_token!),
          onTokenRefreshed: async (newToken) => {
            await db.updateTable('email_accounts')
              .set({ access_token: newToken, updated_at: new Date().toISOString() })
              .where('id', '=', account.id)
              .execute();
          },
        });
      } else {
        provider = createImapProvider({
          imap_host: account.imap_host!,
          imap_port: account.imap_port!,
          imap_user: account.imap_user!,
          imap_pass: decryptSecret(account.imap_pass!),
          smtp_host: account.smtp_host!,
          smtp_port: account.smtp_port!,
          smtp_user: account.smtp_user!,
          smtp_pass: decryptSecret(account.smtp_pass!),
          use_ssl: account.use_ssl,
        });
      }

      const { body_html, body_text } = await provider.fetchBody(email.message_id);

      res.json({ data: { body_html, body_text }, error: null });
    } catch (err) {
      logger.error({ err }, 'mail: fetchBody failed');
      next(err);
    }
  });

  return router;
}
