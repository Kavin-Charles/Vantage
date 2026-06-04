import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
const createDeploymentSchema = z.object({
  name: z.string().optional(),
  environment: z.string().optional(),
  status: z.enum(['pending', 'running', 'success', 'failed', 'cancelled']),
  source: z.enum(['webhook', 'agent', 'manual']),
  server_id: z.string().uuid().optional(),
  started_at: z.string().datetime().optional(),
  git_commit: z.string().max(40).optional(),
  git_branch: z.string().max(255).optional(),
  git_tag: z.string().max(255).optional(),
  git_message: z.string().optional(),
  git_author: z.string().max(255).optional(),
  meta: z.record(z.unknown()).optional(),
});

const updateDeploymentSchema = z.object({
  status: z.enum(['pending', 'running', 'success', 'failed', 'cancelled']).optional(),
  finished_at: z.string().datetime().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});

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
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page } = parsed.data;

      const servers = await db
        .selectFrom('servers')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'asc')
        .limit(per_page)
        .offset((page - 1) * per_page)
        .execute();

      const { count } = await db
        .selectFrom('servers')
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

      res.json({ data: servers, total: Number(count), page, per_page, error: null });
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
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page } = parsed.data;

      const websites = await db
        .selectFrom('websites')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'asc')
        .limit(per_page)
        .offset((page - 1) * per_page)
        .execute();

      const { count } = await db
        .selectFrom('websites')
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

      res.json({ data: websites, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /v1/deployments — CI/webhook callers create a deployment
  router.post('/deployments', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsedBody = createDeploymentSchema.safeParse(req.body);
      if (!parsedBody.success) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: parsedBody.error.message } });
        return;
      }
      const body = parsedBody.data;

      const deployment = await db
        .insertInto('deployments')
        .values({
          workspace_id: workspace.id,
          server_id: body.server_id ?? null,
          name: body.name ?? null,
          environment: body.environment ?? null,
          status: body.status,
          source: body.source,
          started_at: body.started_at ? new Date(body.started_at) : new Date(),
          git_commit: body.git_commit ?? null,
          git_branch: body.git_branch ?? null,
          git_tag: body.git_tag ?? null,
          git_message: body.git_message ?? null,
          git_author: body.git_author ?? null,
          meta: body.meta ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: deployment, error: null });
    } catch (err) { next(err); }
  });

  // PATCH /v1/deployments/:id — CI updates deploy status on finish (two-phase)
  router.patch('/deployments/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsedUpdate = updateDeploymentSchema.safeParse(req.body);
      if (!parsedUpdate.success) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: parsedUpdate.error.message } });
        return;
      }
      const body = parsedUpdate.data;

      const existing = await db
        .selectFrom('deployments')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'started_at'])
        .executeTakeFirst();

      if (!existing) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deployment not found' } });
        return;
      }

      const update: Record<string, unknown> = {};
      if (body.status) update['status'] = body.status;
      if (body.finished_at) {
        const finished = new Date(body.finished_at);
        const started = new Date(existing.started_at);
        update['finished_at'] = finished;
        update['duration_s'] = Math.max(0, Math.round((finished.getTime() - started.getTime()) / 1000));
      }

      if (Object.keys(update).length === 0) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } });
        return;
      }

      const deployment = await db
        .updateTable('deployments')
        .set(update)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      res.json({ data: deployment, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
