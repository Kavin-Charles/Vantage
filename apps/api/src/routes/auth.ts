import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticator } from 'otplib';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { SmtpConfig } from '@vencore/config';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { getEnabledModuleIds, resolveUserPermissions } from '../middleware/permission';
import { decryptSecret } from '../lib/secret-crypto';

const loginSchema = z.object({
  // Accept any x@y — self-hosted setups often use local domains without TLDs
  email: z.string().min(3).includes('@'),
  password: z.string().min(1),
  // Second-factor code: either a 6-digit TOTP or a 16-char recovery code.
  code: z.string().min(6).max(64).optional(),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  password: z.string().min(8),
});

export function createAuthRouter(
  db: Kysely<Database>,
  jwtSecret: string,
  smtp: SmtpConfig | null | undefined,
  appUrl: string,
): Router {
  const router = Router();

  // POST /api/auth/login
  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
      return;
    }
    const { email, password, code } = parsed.data;

    try {
      const user = await db
        .selectFrom('users')
        .where('email', '=', email)
        .selectAll()
        .executeTakeFirst();

      // Always run bcrypt.compare to prevent timing-based email enumeration
      const DUMMY_HASH = '$2b$12$invalidhashpadding0000000000000000000000000000000000000';
      const valid = user
        ? await bcrypt.compare(password, user.password_hash)
        : await bcrypt.compare(password, DUMMY_HASH);

      if (!user || !valid) {
        res.status(401).json({ data: null, error: { code: 'INVALID_CREDENTIALS' } });
        return;
      }

      // Second-factor gate: only engaged when the user has TOTP enabled.
      // Password is already verified at this point, but the token/cookie is
      // withheld until a valid TOTP or recovery code is also presented.
      if (user.totp_enabled) {
        if (!code) {
          res.json({ data: { totp_required: true }, error: null });
          return;
        }

        let totpValid = false;
        if (user.totp_secret) {
          totpValid = authenticator.verify({ token: code, secret: decryptSecret(user.totp_secret) });
        }

        let matchedRecoveryCodeId: string | null = null;
        if (!totpValid) {
          const unusedCodes = await db
            .selectFrom('user_recovery_codes')
            .selectAll()
            .where('user_id', '=', user.id)
            .where('used_at', 'is', null)
            .execute();

          for (const row of unusedCodes) {
            // eslint-disable-next-line no-await-in-loop
            if (await bcrypt.compare(code, row.code_hash)) {
              matchedRecoveryCodeId = row.id;
              break;
            }
          }
        }

        if (!totpValid && !matchedRecoveryCodeId) {
          res.status(401).json({ data: null, error: { code: 'INVALID_2FA', message: 'Invalid two-factor code.' } });
          return;
        }

        if (matchedRecoveryCodeId) {
          // Single-use, atomically: only spend the code if it is still unused. The
          // `used_at is null` guard + affected-row check closes the TOCTOU window where
          // two concurrent logins bearing the same code could both redeem it.
          const spend = await db
            .updateTable('user_recovery_codes')
            .set({ used_at: new Date() })
            .where('id', '=', matchedRecoveryCodeId)
            .where('used_at', 'is', null)
            .executeTakeFirst();
          if (spend.numUpdatedRows === 0n) {
            res.status(401).json({ data: null, error: { code: 'INVALID_2FA', message: 'Invalid two-factor code.' } });
            return;
          }
        }
      }

      await db
        .updateTable('users')
        .set({ last_login_at: new Date() })
        .where('id', '=', user.id)
        .execute();

      const token = jwt.sign(
        { sub: user.id, workspaceId: user.workspace_id },
        jwtSecret,
        { expiresIn: '24h' },
      );

      res.cookie('vencore_token', token, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production' && process.env['COOKIE_SECURE'] !== 'false',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });

      // Resolve access up-front so the client has the correct admin/permission
      // state immediately after login (rather than relying on a follow-up /api/me).
      const enabled = await getEnabledModuleIds(db, user.workspace_id);
      const resolved = await resolveUserPermissions(db, user.id, user.workspace_id, enabled);

      res.json({
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          token,
          theme: user.theme,
          isAdmin: resolved.superuser,
          permissions: [...resolved.permissions],
        },
        error: null,
      });
    } catch (err) {
      logger.error({ err }, 'POST /login error');
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  // GET /api/auth/ws-token — exchange session cookie for a short-lived WS-only token
  // Used by browser when opening cross-origin WebSocket (cookie SameSite blocks cross-site send)
  router.get('/ws-token', (req, res) => {
    const cookieToken = req.cookies['vencore_token'] as string | undefined;
    if (!cookieToken) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }
    let payload: { sub: string; workspaceId: string };
    try {
      payload = jwt.verify(cookieToken, jwtSecret) as { sub: string; workspaceId: string };
    } catch {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }
    const wsToken = jwt.sign(
      { sub: payload.sub, workspaceId: payload.workspaceId },
      jwtSecret,
      { expiresIn: '30s' },
    );
    res.json({ data: { token: wsToken }, error: null });
  });

  // POST /api/auth/logout
  router.post('/logout', (_req, res) => {
    res.clearCookie('vencore_token', {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production' && process.env['COOKIE_SECURE'] !== 'false',
      sameSite: 'lax',
      path: '/',
    });
    res.json({ data: null, error: null });
  });

  // GET /api/auth/me
  router.get('/me', async (req, res) => {
    const token = req.cookies['vencore_token'] as string | undefined;
    if (!token) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    let payload: { sub: string };
    try {
      payload = jwt.verify(token, jwtSecret) as { sub: string };
    } catch {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    try {
      const user = await db
        .selectFrom('users')
        .where('id', '=', payload.sub)
        .select(['id', 'name', 'email', 'workspace_id'])
        .executeTakeFirst();

      if (!user) {
        res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
        return;
      }

      res.json({ data: user, error: null });
    } catch (err) {
      logger.error({ err }, 'GET /me db error');
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  // POST /api/auth/forgot
  router.post('/forgot', async (req, res) => {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
      return;
    }

    if (!smtp) {
      res.status(503).json({ data: null, error: { code: 'SMTP_NOT_CONFIGURED' } });
      return;
    }

    const user = await db
      .selectFrom('users')
      .where('email', '=', parsed.data.email)
      .select(['id', 'email', 'name'])
      .executeTakeFirst();

    // Always return 200 to prevent email enumeration
    if (!user) {
      res.json({ data: null, error: null });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db
      .updateTable('users')
      .set({ password_reset_token: token, password_reset_expires_at: expires })
      .where('id', '=', user.id)
      .execute();

    // Send email
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.password },
      });

      await transporter.sendMail({
        from: smtp.from,
        to: user.email,
        subject: 'Password Reset',
        text: `Reset your password: ${appUrl}/reset-password?token=${token}\n\nExpires in 1 hour.`,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to send password reset email');
    }

    res.json({ data: null, error: null });
  });

  // POST /api/auth/reset/:token
  router.post('/reset/:token', async (req, res) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
      return;
    }

    const user = await db
      .selectFrom('users')
      .where('password_reset_token', '=', req.params['token']!)
      .where('password_reset_expires_at', '>', new Date())
      .select(['id'])
      .executeTakeFirst();

    if (!user) {
      res.status(400).json({ data: null, error: { code: 'INVALID_OR_EXPIRED_TOKEN' } });
      return;
    }

    const hash = await bcrypt.hash(parsed.data.password, 12);
    await db
      .updateTable('users')
      .set({ password_hash: hash, password_reset_token: null, password_reset_expires_at: null })
      .where('id', '=', user.id)
      .execute();

    res.json({ data: null, error: null });
  });

  return router;
}
