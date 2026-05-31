// apps/api/src/routes/setup.ts
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { z } from 'zod';
import { smtpSchema } from '@vantage/config';
import { encryptSmtpPassword } from '../lib/setup-crypto';
import { isConfigured } from '../lib/setup-db';
import { seedWorkspaceModules } from '../lib/seed-modules';
import { logger } from '../lib/logger';

// In-memory rate limiter: IP → timestamps of recent requests
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 3;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) return true;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return false;
}

const setupSchema = z.object({
  branding: z.object({
    name: z.string().min(1).max(100),
    logoUrl: z.string().default('/logo.png'),
    domain: z.string().optional(),
  }),
  features: z.object({
    crm: z.boolean(),
    infra: z.boolean(),
    alerts: z.boolean(),
    analytics: z.boolean(),
    files: z.boolean(),
  }),
  smtp: smtpSchema.nullable(),
  admin: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

export function createSetupRouter(db: Kysely<Database>): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    try {
      const configured = await isConfigured(db);
      res.json({ data: { configured }, error: null });
    } catch (err) {
      logger.error({ err }, '[setup] status check failed');
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  router.post('/', async (req, res) => {
    const ip = req.ip ?? 'unknown';
    if (isRateLimited(ip)) {
      res.status(429).json({ data: null, error: { code: 'RATE_LIMITED' } });
      return;
    }

    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error.flatten() } });
      return;
    }

    const { branding, features, smtp, admin } = parsed.data;

    try {
      await db.transaction().execute(async trx => {
        // Row-level lock prevents concurrent setup
        const row = await sql<{ value: { configured: boolean } }>`
          SELECT value FROM system_settings WHERE key = 'setup' FOR UPDATE
        `.execute(trx);

        const isAlreadyConfigured = (row.rows[0]?.value as { configured?: boolean })?.configured === true;
        if (isAlreadyConfigured) {
          const err = new Error('ALREADY_CONFIGURED');
          (err as any).statusCode = 403;
          throw err;
        }

        // Hash admin password
        const passwordHash = await bcrypt.hash(admin.password, 12);

        // Create workspace
        const workspace = await trx
          .insertInto('workspaces')
          .values({
            name: branding.name,
            domain: branding.domain ?? null,
          })
          .returning(['id'])
          .executeTakeFirstOrThrow();

        // Seed module toggles for new workspace
        await seedWorkspaceModules(trx, workspace.id);

        // Create admin user
        await trx
          .insertInto('users')
          .values({
            workspace_id: workspace.id,
            name: admin.name,
            email: admin.email,
            password_hash: passwordHash,
            role: 'admin',
          })
          .execute();

        // Encrypt SMTP password if provided
        let smtpToStore = smtp ? { ...smtp } as Record<string, unknown> : null;
        if (smtpToStore && typeof smtpToStore['password'] === 'string') {
          const { encrypted, iv } = encryptSmtpPassword(smtpToStore['password'] as string);
          smtpToStore = { ...smtpToStore, password: encrypted, password_iv: iv };
        }

        // Save config row
        const configValue = {
          app: { name: branding.name, logoUrl: branding.logoUrl, domain: branding.domain },
          features,
          smtp: smtpToStore,
        };

        await trx
          .insertInto('system_settings')
          .values({ key: 'config', value: JSON.stringify(configValue) as any })
          .execute();

        // Mark setup as complete
        await sql`
          UPDATE system_settings SET value = '{"configured": true}'::jsonb, updated_at = now()
          WHERE key = 'setup'
        `.execute(trx);
      });

      res.cookie('vantage_setup_done', '1', {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.json({ data: { ok: true }, error: null });
    } catch (err: any) {
      if (err?.message === 'ALREADY_CONFIGURED') {
        res.status(403).json({ data: null, error: { code: 'ALREADY_CONFIGURED' } });
        return;
      }
      logger.error({ err }, '[setup] POST failed');
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  return router;
}
