import { Router, type RequestHandler } from 'express';
import { sql, type Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '@vencore/db';
import type { Appearance, VencoreConfig } from '@vencore/config';
import { appearanceSchema, readConfigFromDb } from '@vencore/config';
import { requireAdmin } from '../middleware/auth';

const patchSchema = z.object({ appearance: appearanceSchema.partial() });

/**
 * Pure merge + re-validation of the appearance sub-config.
 * Throws (via appearanceSchema.parse) when the merged result is invalid.
 */
export function applyAppearancePatch(
  current: VencoreConfig,
  patch: Partial<Appearance>,
): { config: VencoreConfig; appearance: Appearance } {
  const nextAppearance = appearanceSchema.parse({ ...current.app.appearance, ...patch });
  const nextConfig: VencoreConfig = {
    ...current,
    app: { ...current.app, appearance: nextAppearance },
  };
  return { config: nextConfig, appearance: nextAppearance };
}

export function createConfigRouter(
  config: VencoreConfig,
  db: Kysely<Database>,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    // Try DB config first (set during installer); fall back to file config
    const dbConfig = await readConfigFromDb(db).catch(() => null);
    const effective = dbConfig ?? config;

    res.json({
      data: {
        app: {
          name: effective.app.name,
          logoUrl: effective.app.logoUrl,
          faviconUrl: effective.app.faviconUrl ?? null,
          tagline: effective.app.tagline ?? null,
          primaryColor: effective.app.primaryColor ?? null,
          appearance: effective.app.appearance,
        },
        features: effective.features,
      },
      error: null,
    });
  });

  router.patch('/', requireAuth, requireAdmin, async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID', message: 'Bad appearance' } });
      return;
    }

    let current: VencoreConfig;
    try {
      current = (await readConfigFromDb(db)) ?? config;
    } catch {
      current = config;
    }

    let appearance: Appearance;
    let nextConfig: VencoreConfig;
    try {
      ({ config: nextConfig, appearance } = applyAppearancePatch(current, parsed.data.appearance));
    } catch {
      res.status(400).json({ data: null, error: { code: 'INVALID', message: 'Bad appearance' } });
      return;
    }

    await db
      .insertInto('system_settings')
      .values({ key: 'config', value: nextConfig })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({ value: nextConfig, updated_at: sql`now()` }),
      )
      .execute();

    res.json({ data: { appearance }, error: null });
  });

  return router;
}
