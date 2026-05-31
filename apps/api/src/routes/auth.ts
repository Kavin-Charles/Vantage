import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { SmtpConfig } from '@vantage/config';
import { z } from 'zod';
import { logger } from '../lib/logger';

const loginSchema = z.object({
  // Accept any x@y — self-hosted setups often use local domains without TLDs
  email: z.string().min(3).includes('@'),
  password: z.string().min(1),
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
): Router {
  const router = Router();

  // POST /api/auth/login
  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
      return;
    }
    const { email, password } = parsed.data;

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

      await db
        .updateTable('users')
        .set({ last_login_at: new Date() })
        .where('id', '=', user.id)
        .execute();

      const token = jwt.sign(
        { sub: user.id, role: user.role, workspaceId: user.workspace_id },
        jwtSecret,
        { expiresIn: '24h' },
      );

      res.cookie('vantage_token', token, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.json({ data: { id: user.id, name: user.name, email: user.email, role: user.role, token }, error: null });
    } catch (err) {
      logger.error({ err }, 'POST /login error');
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  // GET /api/auth/ws-token — exchange session cookie for a short-lived WS-only token
  // Used by browser when opening cross-origin WebSocket (cookie SameSite blocks cross-site send)
  router.get('/ws-token', (req, res) => {
    const cookieToken = req.cookies['vantage_token'] as string | undefined;
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
    res.clearCookie('vantage_token', {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      path: '/',
    });
    res.json({ data: null, error: null });
  });

  // GET /api/auth/me
  router.get('/me', async (req, res) => {
    const token = req.cookies['vantage_token'] as string | undefined;
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
        .select(['id', 'name', 'email', 'role', 'workspace_id'])
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

      const domain = process.env['APP_DOMAIN'] ?? 'localhost:3000';
      await transporter.sendMail({
        from: smtp.from,
        to: user.email,
        subject: 'Password Reset',
        text: `Reset your password: https://${domain}/reset-password?token=${token}\n\nExpires in 1 hour.`,
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
