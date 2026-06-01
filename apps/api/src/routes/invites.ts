import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { SmtpConfig } from '@vantage/config';
import type { AuthenticatedRequest } from '../middleware/auth';

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
});

const directCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'member']).default('member'),
});

const acceptInviteSchema = z.object({
  name: z.string().min(1),
  password: z.string().min(8),
});

export function createInvitesRouter(
  db: Kysely<Database>,
  smtp: SmtpConfig | null | undefined,
): Router {
  const router = Router();

  // POST /api/invites — create invite or direct-create (admin only, enforced at route level)
  router.post('/', async (req, res, next) => {
    try {
      const { workspace, user: inviter } = req as unknown as AuthenticatedRequest;

      if (smtp) {
        // Email invite flow
        const parsed = createInviteSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
          return;
        }

        const existing = await db
          .selectFrom('users')
          .where('email', '=', parsed.data.email)
          .where('workspace_id', '=', workspace.id)
          .select('id')
          .executeTakeFirst();
        if (existing) {
          res.status(409).json({ data: null, error: { code: 'EMAIL_TAKEN' } });
          return;
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

        const invite = await db
          .insertInto('invites')
          .values({
            workspace_id: workspace.id,
            email: parsed.data.email,
            token,
            invited_by: inviter.id,
            role: parsed.data.role,
            expires_at: expiresAt,
          })
          .returning(['id', 'email', 'token'])
          .executeTakeFirstOrThrow();

        try {
          const nodemailer = await import('nodemailer');
          const transporter = nodemailer.default.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            auth: { user: smtp.user, pass: smtp.password },
          });
          const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000';
          await transporter.sendMail({
            from: smtp.from,
            to: parsed.data.email,
            subject: `You've been invited to ${workspace.name} on Vantage`,
            text: [
              `${inviter.name} has invited you to join ${workspace.name} on Vantage.`,
              '',
              `Accept your invitation: ${appUrl}/invite/${token}`,
              '',
              'This link expires in 72 hours.',
            ].join('\n'),
          });
        } catch {
          // Email send failure is non-fatal — invite record still created
        }

        res.status(201).json({ data: { inviteId: invite.id, email: invite.email }, error: null });
      } else {
        // Direct create fallback (no SMTP)
        const parsed = directCreateSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
          return;
        }

        const existing = await db
          .selectFrom('users')
          .where('email', '=', parsed.data.email)
          .where('workspace_id', '=', workspace.id)
          .select('id')
          .executeTakeFirst();
        if (existing) {
          res.status(409).json({ data: null, error: { code: 'EMAIL_TAKEN' } });
          return;
        }

        const hash = await bcrypt.hash(parsed.data.password, 12);
        const user = await db
          .insertInto('users')
          .values({
            workspace_id: workspace.id,
            name: parsed.data.name,
            email: parsed.data.email,
            password_hash: hash,
            role: parsed.data.role,
          })
          .returning(['id', 'name', 'email', 'role', 'created_at'])
          .executeTakeFirstOrThrow();

        res.status(201).json({ data: { user }, error: null });
      }
    } catch (err) { next(err); }
  });

  // GET /api/invites/accept/:token — get invite info (public)
  router.get('/accept/:token', async (req, res, next) => {
    try {
      const invite = await db
        .selectFrom('invites as i')
        .innerJoin('workspaces as w', 'w.id', 'i.workspace_id')
        .where('i.token', '=', req.params['token']!)
        .select(['i.id', 'i.email', 'i.role', 'i.expires_at', 'i.accepted_at', 'w.name as workspace_name'])
        .executeTakeFirst();

      if (!invite) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      if (invite.accepted_at) {
        res.status(410).json({ data: null, error: { code: 'ALREADY_ACCEPTED' } });
        return;
      }
      if (new Date(invite.expires_at) < new Date()) {
        res.status(410).json({ data: null, error: { code: 'EXPIRED' } });
        return;
      }

      res.json({ data: { email: invite.email, role: invite.role, workspaceName: invite.workspace_name }, error: null });
    } catch (err) { next(err); }
  });

  // POST /api/invites/accept/:token — accept invite (public)
  router.post('/accept/:token', async (req, res, next) => {
    try {
      const parsed = acceptInviteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }

      const invite = await db
        .selectFrom('invites')
        .where('token', '=', req.params['token']!)
        .selectAll()
        .executeTakeFirst();

      if (!invite) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      if (invite.accepted_at) {
        res.status(410).json({ data: null, error: { code: 'ALREADY_ACCEPTED' } });
        return;
      }
      if (new Date(invite.expires_at) < new Date()) {
        res.status(410).json({ data: null, error: { code: 'EXPIRED' } });
        return;
      }

      const hash = await bcrypt.hash(parsed.data.password, 12);
      await db
        .insertInto('users')
        .values({
          workspace_id: invite.workspace_id,
          name: parsed.data.name,
          email: invite.email,
          password_hash: hash,
          role: invite.role as 'admin' | 'member',
        })
        .execute();

      await db
        .updateTable('invites')
        .set({ accepted_at: new Date() })
        .where('id', '=', invite.id)
        .execute();

      res.json({ data: { email: invite.email }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
