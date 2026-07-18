// apps/api/src/routes/setup.ts
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { z } from 'zod';
import { smtpSchema } from '@vencore/config';
import { encryptSmtpPassword } from '../lib/setup-crypto';
import { isConfigured } from '../lib/setup-db';
import { seedWorkspaceModules } from '../lib/seed-modules';
import { seedWorkspaceRoles } from '../lib/seed-roles';
import { assignRole } from '../lib/role-assignment';
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
    faviconUrl: z.string().optional(),
    tagline: z.string().optional(),
    primaryColor: z.string().optional(),
  }),
  features: z.object({
    crm: z.boolean(),
    infra: z.boolean(),
    alerts: z.boolean(),
    analytics: z.boolean(),
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
        // Single-tenant guard: workspace existence = already configured
        const existingWorkspace = await trx
          .selectFrom('workspaces')
          .select('id')
          .executeTakeFirst();

        if (existingWorkspace) {
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
            domain: branding.domain ?? branding.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          })
          .returning(['id'])
          .executeTakeFirstOrThrow();

        // Seed module toggles — respect installer feature selections
        await seedWorkspaceModules(trx, workspace.id, features);

        // Seed system roles (Administrator/Member)
        const { adminRoleId } = await seedWorkspaceRoles(trx, workspace.id);

        // Create admin user
        const adminUser = await trx
          .insertInto('users')
          .values({
            workspace_id: workspace.id,
            name: admin.name,
            email: admin.email,
            password_hash: passwordHash,
          })
          .returning(['id'])
          .executeTakeFirstOrThrow();

        await assignRole(trx, workspace.id, adminUser.id, adminRoleId);

        // Encrypt SMTP password if provided
        let smtpToStore = smtp ? { ...smtp } as Record<string, unknown> : null;
        if (smtpToStore && typeof smtpToStore['password'] === 'string') {
          const { encrypted, iv } = encryptSmtpPassword(smtpToStore['password'] as string);
          smtpToStore = { ...smtpToStore, password: encrypted, password_iv: iv };
        }

        // Save config row
        const configValue = {
          app: {
            name: branding.name,
            logoUrl: branding.logoUrl,
            domain: branding.domain,
            faviconUrl: branding.faviconUrl,
            tagline: branding.tagline,
            primaryColor: branding.primaryColor,
          },
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

      res.cookie('vencore_setup_done', '1', {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production' && process.env['COOKIE_SECURE'] !== 'false',
        sameSite: 'lax',
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
