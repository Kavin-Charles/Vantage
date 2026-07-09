import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createPipelineSchema = z.object({
  name: z.string().min(1),
  is_default: z.boolean().default(false),
  position: z.number().int().default(0),
});

const updatePipelineSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  is_default: z.boolean().optional(),
  position: z.number().int().optional(),
  view: z.enum(['kanban', 'table', 'list']).optional(),
  table_columns: z.array(z.string()).nullable().optional(),
});

const createStageSchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#6366f1'),
  is_won: z.boolean().default(false),
  is_lost: z.boolean().default(false),
  position: z.number().int().default(0),
});

const updateStageSchema = createStageSchema.partial();
const reorderSchema = z.object({ ids: z.array(z.string().uuid()) });

function ws(req: AuthenticatedRequest) { return req.workspace.id; }
function fail(res: any, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createPipelinesRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view      = requirePermission('pipelines:view');
  const create    = requirePermission('pipelines:create');
  const edit      = requirePermission('pipelines:edit');
  const del       = requirePermission('pipelines:delete');
  const config    = requirePermission('pipelines:config');
  const stageEdit = requirePermission('pipelines:stage.edit');
  const stageDel  = requirePermission('pipelines:stage.delete');

  // List pipelines — include stages and fields
  router.get('/', view, async (req, res, next) => {
    try {
      const pipelines = await db.selectFrom('pipelines').selectAll()
        .where('workspace_id', '=', ws(req as AuthenticatedRequest))
        .orderBy('position', 'asc').execute();

      const data = await Promise.all(pipelines.map(async p => {
        const stages = await db.selectFrom('pipeline_stages').selectAll()
          .where('pipeline_id', '=', p.id).orderBy('position', 'asc').execute();
        const fields = await db.selectFrom('pipeline_fields').selectAll()
          .where('pipeline_id', '=', p.id).orderBy('position', 'asc').execute();
        return { ...p, stages, fields };
      }));

      res.json({ data, error: null });
    } catch (e) { next(e); }
  });

  // Get one pipeline
  router.get('/:id', view, async (req, res, next) => {
    try {
      const p = await db.selectFrom('pipelines').selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', ws(req as AuthenticatedRequest))
        .executeTakeFirst();
      if (!p) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');

      const stages = await db.selectFrom('pipeline_stages').selectAll()
        .where('pipeline_id', '=', p.id).orderBy('position', 'asc').execute();
      const fields = await db.selectFrom('pipeline_fields').selectAll()
        .where('pipeline_id', '=', p.id).orderBy('position', 'asc').execute();

      res.json({ data: { ...p, stages, fields }, error: null });
    } catch (e) { next(e); }
  });

  // Create pipeline
  router.post('/', create, async (req, res, next) => {
    try {
      const body = createPipelineSchema.parse(req.body);
      const p = await db.insertInto('pipelines')
        .values({ ...body, workspace_id: ws(req as AuthenticatedRequest) })
        .returningAll().executeTakeFirstOrThrow();
      res.status(201).json({ data: { ...p, stages: [], fields: [] }, error: null });
    } catch (e) { next(e); }
  });

  // Update pipeline
  router.patch('/:id', config, async (req, res, next) => {
    try {
      const body = updatePipelineSchema.parse(req.body);
      const p = await db.updateTable('pipelines').set({ ...body, updated_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', ws(req as AuthenticatedRequest))
        .returningAll().executeTakeFirst();
      if (!p) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');
      res.json({ data: p, error: null });
    } catch (e) { next(e); }
  });

  // Delete pipeline
  router.delete('/:id', del, async (req, res, next) => {
    try {
      const p = await db.deleteFrom('pipelines')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', ws(req as AuthenticatedRequest))
        .returningAll().executeTakeFirst();
      if (!p) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');
      res.json({ data: { id: p.id }, error: null });
    } catch (e) { next(e); }
  });

  // --- Stages ---

  router.post('/:id/stages', stageEdit, async (req, res, next) => {
    try {
      const pipeline = await db.selectFrom('pipelines').select('id')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', ws(req as AuthenticatedRequest))
        .executeTakeFirst();
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');

      const body = createStageSchema.parse(req.body);
      const stage = await db.insertInto('pipeline_stages')
        .values({ ...body, pipeline_id: pipeline.id })
        .returningAll().executeTakeFirstOrThrow();
      res.status(201).json({ data: stage, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:id/stages/:stageId', stageEdit, async (req, res, next) => {
    try {
      const pipeline = await db.selectFrom('pipelines').select('id')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', ws(req as AuthenticatedRequest))
        .executeTakeFirst();
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');

      const body = updateStageSchema.parse(req.body);
      const stage = await db.updateTable('pipeline_stages').set(body)
        .where('id', '=', req.params['stageId']!)
        .where('pipeline_id', '=', pipeline.id)
        .returningAll().executeTakeFirst();
      if (!stage) return fail(res, 404, 'NOT_FOUND', 'Stage not found');
      res.json({ data: stage, error: null });
    } catch (e) { next(e); }
  });

  router.delete('/:id/stages/:stageId', stageDel, async (req, res, next) => {
    try {
      const pipeline = await db.selectFrom('pipelines').select('id')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', ws(req as AuthenticatedRequest))
        .executeTakeFirst();
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');

      const stage = await db.deleteFrom('pipeline_stages')
        .where('id', '=', req.params['stageId']!)
        .where('pipeline_id', '=', pipeline.id)
        .returningAll().executeTakeFirst();
      if (!stage) return fail(res, 404, 'NOT_FOUND', 'Stage not found');
      res.json({ data: { id: stage.id }, error: null });
    } catch (e) { next(e); }
  });

  router.post('/:id/stages/reorder', stageEdit, async (req, res, next) => {
    try {
      const pipeline = await db.selectFrom('pipelines').select('id')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', ws(req as AuthenticatedRequest))
        .executeTakeFirst();
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');

      const { ids } = reorderSchema.parse(req.body);
      await Promise.all(ids.map((stageId, i) =>
        db.updateTable('pipeline_stages').set({ position: i })
          .where('id', '=', stageId)
          .where('pipeline_id', '=', pipeline.id)
          .execute()
      ));
      res.json({ data: { reordered: ids.length }, error: null });
    } catch (e) { next(e); }
  });

  return router;
}

import { bridgeRegistry } from '@vencore/plugin-runtime';

export function registerDealsBridgeMethods(): void {
  bridgeRegistry
    .register('deals.list', 'deals:read', async (ctx, p, db) => {
      const filter = (p.filter ?? {}) as Record<string, unknown>;
      let q = db.selectFrom('deals').selectAll()
        .where('workspace_id', '=', ctx.workspaceId)
        .where('deleted_at', 'is', null);
      if (filter.stage_id) q = q.where('stage_id', '=', filter.stage_id as string);
      if (filter.pipeline_id) q = q.where('pipeline_id', '=', filter.pipeline_id as string);
      if (filter.contact_id) q = q.where('contact_id', '=', filter.contact_id as string);
      if (filter.owner_id) q = q.where('owner_id', '=', filter.owner_id as string);
      if (filter.limit) q = q.limit(Number(filter.limit));
      if (filter.offset) q = q.offset(Number(filter.offset));
      return q.execute();
    })
    .register('deals.get', 'deals:read', async (ctx, p, db) => {
      const row = await db.selectFrom('deals').selectAll()
        .where('workspace_id', '=', ctx.workspaceId)
        .where('id', '=', p.id as string)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!row) throw { code: 'NOT_FOUND', message: 'Deal not found' };
      return row;
    })
    .register('deals.create', 'deals:write', async (ctx, p, db) => {
      const data = p.data as Record<string, unknown>;
      const [row] = await db.insertInto('deals')
        .values({ ...data, workspace_id: ctx.workspaceId } as any)
        .returningAll().execute();
      return row;
    })
    .register('deals.update', 'deals:write', async (ctx, p, db) => {
      const data = p.data as Record<string, unknown>;
      const [row] = await db.updateTable('deals')
        .set({ ...data, updated_at: new Date() } as any)
        .where('workspace_id', '=', ctx.workspaceId)
        .where('id', '=', p.id as string)
        .returningAll().execute();
      if (!row) throw { code: 'NOT_FOUND', message: 'Deal not found' };
      return row;
    })
    .register('deals.delete', 'deals:write', async (ctx, p, db) => {
      await db.updateTable('deals')
        .set({ deleted_at: new Date(), updated_at: new Date() })
        .where('workspace_id', '=', ctx.workspaceId)
        .where('id', '=', p.id as string)
        .where('deleted_at', 'is', null)
        .execute();
      return null;
    });
}
