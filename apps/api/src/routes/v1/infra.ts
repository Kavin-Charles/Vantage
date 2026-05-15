import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';

const alertListSchema = z.object({
  resolved: z.coerce.boolean().optional(),
  severity: z.enum(['critical', 'warning', 'info']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});

export function createV1InfraRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /v1/servers
  router.get('/servers', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const servers = await db
        .selectFrom('servers')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'asc')
        .execute();
      res.json({ data: servers, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/servers/:id
  router.get('/servers/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const server = await db
        .selectFrom('servers')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .executeTakeFirst();

      if (!server) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Server not found' } });
        return;
      }
      res.json({ data: server, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/alerts
  router.get('/alerts', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = alertListSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { resolved, severity, page, per_page } = parsed.data;

      let query = db
        .selectFrom('alerts')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (resolved !== undefined) query = query.where('resolved', '=', resolved);
      if (severity) query = query.where('severity', '=', severity);

      const alerts = await query.execute();

      let countQuery = db
        .selectFrom('alerts')
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.countAll<number>().as('count'));

      if (resolved !== undefined) countQuery = countQuery.where('resolved', '=', resolved);
      if (severity) countQuery = countQuery.where('severity', '=', severity);

      const { count } = await countQuery.executeTakeFirstOrThrow();
      res.json({ data: alerts, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/websites
  router.get('/websites', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const websites = await db
        .selectFrom('websites')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'asc')
        .execute();
      res.json({ data: websites, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
