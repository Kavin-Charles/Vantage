import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

export function createInternalRouter(db: Kysely<Database>, cronSecret: string) {
  const router = Router();

  // Verify cron secret on all internal routes
  router.use((req, res, next) => {
    if (req.headers['x-cron-secret'] !== cronSecret) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }
    next();
  });

  // Internal health check
  router.get('/health', (_req, res) => {
    res.json({ data: { ok: true }, error: null });
  });

  return router;
}
