import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { VencoreConfig } from '@vencore/config';
import { readConfigFromDb } from '@vencore/config';

export function createConfigRouter(config: VencoreConfig, db: Kysely<Database>): Router {
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
        },
        features: effective.features,
      },
      error: null,
    });
  });

  return router;
}
