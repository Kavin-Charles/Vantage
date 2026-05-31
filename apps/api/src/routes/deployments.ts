import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { ApiKeyRequest } from '../middleware/api-key-auth';

export const createDeploymentSchema = z.object({
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

export const updateDeploymentSchema = z.object({
  status: z.enum(['pending', 'running', 'success', 'failed', 'cancelled']).optional(),
  finished_at: z.string().datetime().optional(),
});

function getWorkspaceId(req: object): string {
  const r = req as AuthenticatedRequest & ApiKeyRequest;
  return r.workspace.id;
}

export function createDeploymentsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/deployments — list with filters
  router.get('/', async (req, res, next) => {
    try {
      const workspaceId = getWorkspaceId(req);
      const q = req.query as Record<string, string | undefined>;
      const limit = Math.min(Number(q['limit'] ?? 50), 200);

      let query = db
        .selectFrom('deployments')
        .where('workspace_id', '=', workspaceId)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(limit);

      if (q['name'])        query = query.where('name', '=', q['name']);
      if (q['environment']) query = query.where('environment', '=', q['environment']);
      if (q['server_id'])   query = query.where('server_id', '=', q['server_id']);
      if (q['source'])      query = query.where('source', '=', q['source'] as 'webhook' | 'agent' | 'manual');
      if (q['from']) {
        const fromDate = new Date(q['from']);
        if (isNaN(fromDate.getTime())) {
          res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid from date' } });
          return;
        }
        query = query.where('started_at', '>=', fromDate.toISOString() as unknown as Date);
      }
      if (q['to']) {
        const toDate = new Date(q['to']);
        if (isNaN(toDate.getTime())) {
          res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid to date' } });
          return;
        }
        query = query.where('started_at', '<=', toDate.toISOString() as unknown as Date);
      }
      if (q['status']) {
        const validStatuses = ['pending', 'running', 'success', 'failed', 'cancelled'] as const;
        const statuses = q['status'].split(',').filter((s): s is typeof validStatuses[number] =>
          (validStatuses as readonly string[]).includes(s),
        );
        if (statuses.length === 0) {
          res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid status value(s)' } });
          return;
        }
        query = query.where('status', 'in', statuses);
      }

      const deployments = await query.execute();
      res.json({ data: deployments, total: deployments.length, error: null });
    } catch (err) { next(err); }
  });

  // GET /api/deployments/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const workspaceId = getWorkspaceId(req);
      const deployment = await db
        .selectFrom('deployments')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .selectAll()
        .executeTakeFirst();

      if (!deployment) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deployment not found' } });
        return;
      }
      res.json({ data: deployment, error: null });
    } catch (err) { next(err); }
  });

  // POST /api/deployments
  router.post('/', async (req, res, next) => {
    try {
      const workspaceId = getWorkspaceId(req);
      const body = createDeploymentSchema.parse(req.body);

      const deployment = await db
        .insertInto('deployments')
        .values({
          workspace_id: workspaceId,
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

  // PATCH /api/deployments/:id — update status + compute duration
  router.patch('/:id', async (req, res, next) => {
    try {
      const workspaceId = getWorkspaceId(req);
      const body = updateDeploymentSchema.parse(req.body);

      const existing = await db
        .selectFrom('deployments')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .select(['deployments.id', 'deployments.started_at'])
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
        .where('workspace_id', '=', workspaceId)
        .returningAll()
        .executeTakeFirst();

      res.json({ data: deployment, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/deployments/:id
  router.delete('/:id', async (req, res, next) => {
    try {
      const workspaceId = getWorkspaceId(req);
      const deleted = await db
        .deleteFrom('deployments')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .returningAll()
        .executeTakeFirst();

      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deployment not found' } });
        return;
      }
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
