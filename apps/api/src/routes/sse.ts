import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { sseRegistry } from '../lib/sse-registry';
import type { AuthenticatedRequest } from '../middleware/auth';

export function createSseRouter(_db: Kysely<Database>): Router {
  const router = Router();

  // GET /api/sse/servers — holds connection open, pushes metric + alert events
  router.get('/servers', (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest;
    // subscribe() sets headers and holds the connection via heartbeat + close listener
    sseRegistry.subscribe(workspace.id, res);
  });

  return router;
}
