import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { decryptSecret } from '../lib/mail-crypto';
import { createGmailProvider } from '../lib/gmail-provider';
import { createImapProvider } from '../lib/imap-provider';
import type { MailProvider } from '../lib/mail-provider';
import { logger } from '../lib/logger';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  account_id: z.string().uuid().optional(),
  folder: z.enum(['inbox', 'sent', 'drafts', 'trash', 'spam']).optional(),
  contact_id: z.string().uuid().optional(),
  q: z.string().optional(),
});

const sendSchema = z.object({
  account_id: z.string().uuid(),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  body_html: z.string().min(1),
  reply_to_message_id: z.string().optional(),
});

const patchSchema = z.object({
  is_read: z.boolean().optional(),
  is_starred: z.boolean().optional(),
  folder: z.enum(['inbox', 'sent', 'drafts', 'trash', 'spam']).optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' });

interface EmailAccountRow {
  id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_user: string | null;
  imap_pass: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  use_ssl: boolean;
}

function getProvider(account: EmailAccountRow): MailProvider {
  if (account.provider === 'gmail') {
    return createGmailProvider({
      accessToken: decryptSecret(account.access_token!),
      refreshToken: decryptSecret(account.refresh_token!),
    });
  }
  return createImapProvider({
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export function createMailEmailsRouter(db: Kysely<Database>): ExpressRouter {
  const anyDb = db as unknown as AnyDb;
  const router = Router();

  // GET /api/mail/emails
  router.get('/', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const q = listQuerySchema.parse(req.query);

      let query = anyDb.selectFrom('emails').where('user_id', '=', user.id);
      if (q.account_id) query = query.where('account_id', '=', q.account_id);
      if (q.folder) query = query.where('folder', '=', q.folder);
      if (q.contact_id) query = query.where('contact_id', '=', q.contact_id);
      if (q.q) {
        const term = `%${q.q}%`;
        query = query.where((eb: { or: Function; ilike: Function }) =>
          (eb as unknown as { or: Function }).or([
            (eb as unknown as { ilike?: Function; ref?: Function })['ilike']
              ? (eb as unknown as { ilike: Function }).ilike('subject', term)
              : term,
          ])
        );
      }

      const countRow = await query
        .select(anyDb.fn.countAll().as('count'))
        .executeTakeFirstOrThrow();

      const emails = await query
        .selectAll()
        .orderBy('sent_at', 'desc')
        .limit(q.per_page)
        .offset((q.page - 1) * q.per_page)
        .execute();

      res.json({ data: emails, total: Number(countRow.count), page: q.page, per_page: q.per_page, error: null });
    } catch (err) { next(err); }
  });

  // GET /api/mail/emails/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const email = await anyDb
        .selectFrom('emails')
        .where('id', '=', req.params['id'])
        .where('user_id', '=', user.id)
        .selectAll()
        .executeTakeFirst();
      if (!email) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Email not found' } });
        return;
      }
      res.json({ data: email, error: null });
    } catch (err) { next(err); }
  });

  // PATCH /api/mail/emails/:id
  router.patch('/:id', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const body = patchSchema.parse(req.body);

      const email = await anyDb
        .selectFrom('emails')
        .where('id', '=', req.params['id'])
        .where('user_id', '=', user.id)
        .select(['id', 'account_id', 'message_id'])
        .executeTakeFirst();
      if (!email) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Email not found' } });
        return;
      }

      const updated = await anyDb
        .updateTable('emails')
        .set(body)
        .where('id', '=', email.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      // Mirror to provider (fire-and-forget)
      void (async () => {
        try {
          const account: EmailAccountRow | undefined = await anyDb
            .selectFrom('email_accounts')
            .where('id', '=', email.account_id)
            .selectAll()
            .executeTakeFirst();
          if (!account) return;
          await getProvider(account).updateEmail(email.message_id, body);
        } catch (err) { logger.error({ err }, 'mail: provider mirror failed'); }
      })();

      res.json({ data: updated, error: null });
    } catch (err) { next(err); }
  });

  // POST /api/mail/send
  router.post('/send', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const body = sendSchema.parse(req.body);

      const account: EmailAccountRow | undefined = await anyDb
        .selectFrom('email_accounts')
        .where('id', '=', body.account_id)
        .where('user_id', '=', user.id)
        .selectAll()
        .executeTakeFirst();
      if (!account) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Account not found' } });
        return;
      }

      const { message_id } = await getProvider(account).sendEmail({
        to: body.to,
        cc: body.cc,
        bcc: body.bcc,
        subject: body.subject,
        body_html: body.body_html,
        reply_to_message_id: body.reply_to_message_id,
      });

      res.status(201).json({ data: { message_id }, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/mail/emails/:id — move to trash
  router.delete('/:id', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const email = await anyDb
        .selectFrom('emails')
        .where('id', '=', req.params['id'])
        .where('user_id', '=', user.id)
        .select(['id', 'account_id', 'message_id'])
        .executeTakeFirst();
      if (!email) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Email not found' } });
        return;
      }

      await anyDb
        .updateTable('emails')
        .set({ folder: 'trash' })
        .where('id', '=', email.id)
        .execute();

      void (async () => {
        try {
          const account: EmailAccountRow | undefined = await anyDb
            .selectFrom('email_accounts')
            .where('id', '=', email.account_id)
            .selectAll()
            .executeTakeFirst();
          if (!account) return;
          await getProvider(account).updateEmail(email.message_id, { folder: 'trash' });
        } catch (err) { logger.error({ err }, 'mail: provider trash failed'); }
      })();

      res.json({ data: { trashed: true }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
