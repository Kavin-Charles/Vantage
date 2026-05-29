import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { VantageConfig } from '@vantage/config';
import { readConfigFromDb } from '@vantage/config';

export function createConfigRouter(config: VantageConfig, db: Kysely<Database>): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    // Try DB config first (set during installer); fall back to file config
    const dbConfig = await readConfigFromDb(db).catch(() => null);
    const effective = dbConfig ?? config;

    res.json({
      data: {
        app: { name: effective.app.name, logoUrl: effective.app.logoUrl },
        features: effective.features,
      },
      error: null,
    });
  });

  return router;
}
