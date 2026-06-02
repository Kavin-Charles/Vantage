import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createPipelineSchema = z.object({
  name: z.string().min(1),
  record_type_id: z.string().uuid(),
  view: z.enum(['kanban', 'table', 'list']).default('kanban'),
  position: z.number().int().default(0),
});
const updatePipelineSchema = z.object({
  name: z.string().min(1).optional(),
  view: z.enum(['kanban', 'table', 'list']).optional(),
  table_columns: z.array(z.string()).nullable().optional(),
  is_default: z.boolean().optional(),
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

function ws(req: any) { return (req as AuthenticatedRequest).workspace.id; }
function fail(res: any, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createPipelinesRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('pipelines:view');
  const create = requirePermission('pipelines:create');
  const edit = requirePermission('pipelines:edit');
  const del = requirePermission('pipelines:delete');

  // List with stages + record_type
  router.get('/', view, async (req, res, next) => {
    try {
      const pipelines = await db.selectFrom('pipelines').selectAll()
        .where('workspace_id', '=', ws(req)).orderBy('position', 'asc').execute();
      const data = await Promise.all(pipelines.map(async p => {
        const stages = await db.selectFrom('pipeline_stages').selectAll()
          .where('pipeline_id', '=', p.id).orderBy('position', 'asc').execute();
        const rt = p.record_type_id
          ? await db.selectFrom('record_types').selectAll()
              .where('id', '=', p.record_type_id).executeTakeFirst()
          : null;
        return { ...p, stages, record_type: rt };
      }));
      res.json({ data, error: null });
    } catch (e) { next(e); }
  });

  // Get one with stages + record_type + fields
  router.get('/:id', view, async (req, res, next) => {
    try {
      const p = await db.selectFrom('pipelines').selectAll()
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req)).executeTakeFirst();
      if (!p) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');
      const stages = await db.selectFrom('pipeline_stages').selectAll()
        .where('pipeline_id', '=', p.id).orderBy('position', 'asc').execute();
      const rt = p.record_type_id
        ? await db.selectFrom('record_types').selectAll()
            .where('id', '=', p.record_type_id).executeTakeFirst()
        : null;
      const fields = rt
        ? await db.selectFrom('record_type_fields').selectAll()
            .where('record_type_id', '=', rt.id).orderBy('position', 'asc').execute()
        : [];
      res.json({ data: { ...p, stages, record_type: rt ? { ...rt, fields } : null }, error: null });
    } catch (e) { next(e); }
  });

  // Create
  router.post('/', create, async (req, res, next) => {
    try {
      const p = createPipelineSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const rt = await db.selectFrom('record_types').select('id')
        .where('id', '=', p.data.record_type_id).where('workspace_id', '=', ws(req)).executeTakeFirst();
      if (!rt) return fail(res, 404, 'NOT_FOUND', 'Record type not found');
      const pipeline = await db.insertInto('pipelines')
        .values({ workspace_id: ws(req), is_default: false, table_columns: null, ...p.data } as never)
        .returningAll().executeTakeFirstOrThrow();
      res.json({ data: pipeline, error: null });
    } catch (e) { next(e); }
  });

  // Update
  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const p = updatePipelineSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const updated = await db.updateTable('pipelines')
        .set({ ...p.data, updated_at: new Date().toISOString() } as never)
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req))
        .returningAll().executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');
      res.json({ data: updated, error: null });
    } catch (e) { next(e); }
  });

  // Delete — blocks if pipeline has active records
  router.delete('/:id', del, async (req, res, next) => {
    try {
      const c = await db.selectFrom('pipeline_records').select(db.fn.countAll<number>().as('n'))
        .where('pipeline_id', '=', req.params['id']!).where('deleted_at', 'is', null)
        .executeTakeFirstOrThrow();
      if (Number(c.n) > 0) return fail(res, 409, 'CONFLICT', 'Pipeline has active records');
      await db.deleteFrom('pipelines')
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req)).execute();
      res.json({ data: { id: req.params['id'] }, error: null });
    } catch (e) { next(e); }
  });

  // Stages: add
  router.post('/:id/stages', edit, async (req, res, next) => {
    try {
      const p = createStageSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const pipeline = await db.selectFrom('pipelines').select('id')
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req)).executeTakeFirst();
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');
      const stage = await db.insertInto('pipeline_stages')
        .values({ pipeline_id: req.params['id']!, ...p.data } as never).returningAll().executeTakeFirstOrThrow();
      res.json({ data: stage, error: null });
    } catch (e) { next(e); }
  });

  // Stages: reorder (must come before /:id/stages/:sid to avoid conflict)
  router.patch('/:id/stages/reorder', edit, async (req, res, next) => {
    try {
      const p = reorderSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      await Promise.all(p.data.ids.map((sid, i) =>
        db.updateTable('pipeline_stages').set({ position: i } as never)
          .where('id', '=', sid).where('pipeline_id', '=', req.params['id']!).execute()
      ));
      res.json({ data: { ids: p.data.ids }, error: null });
    } catch (e) { next(e); }
  });

  // Stages: update
  router.patch('/:id/stages/:sid', edit, async (req, res, next) => {
    try {
      const p = updateStageSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const updated = await db.updateTable('pipeline_stages')
        .set({ ...p.data, updated_at: new Date().toISOString() } as never)
        .where('id', '=', req.params['sid']!).where('pipeline_id', '=', req.params['id']!)
        .returningAll().executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Stage not found');
      res.json({ data: updated, error: null });
    } catch (e) { next(e); }
  });

  // Stages: delete — blocks if stage has active records
  router.delete('/:id/stages/:sid', del, async (req, res, next) => {
    try {
      const c = await db.selectFrom('pipeline_records').select(db.fn.countAll<number>().as('n'))
        .where('stage_id', '=', req.params['sid']!).where('deleted_at', 'is', null)
        .executeTakeFirstOrThrow();
      if (Number(c.n) > 0) return fail(res, 409, 'CONFLICT', 'Stage has active records');
      await db.deleteFrom('pipeline_stages')
        .where('id', '=', req.params['sid']!).where('pipeline_id', '=', req.params['id']!).execute();
      res.json({ data: { id: req.params['sid'] }, error: null });
    } catch (e) { next(e); }
  });

  return router;
}

// Stage fields router (retained for backwards compatibility)
export function createStageFieldsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router({ mergeParams: true });
  const view = requirePermission('pipelines:view');
  const edit = requirePermission('pipelines:edit');
  const del = requirePermission('pipelines:delete');

  router.get('/:stageId/fields', view, async (req, res, next) => {
    try {
      const fields = await db.selectFrom('stage_fields').selectAll()
        .where('stage_id', '=', req.params['stageId']!).orderBy('position', 'asc').execute();
      res.json({ data: fields, error: null });
    } catch (e) { next(e); }
  });

  router.post('/:stageId/fields', edit, async (req, res, next) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        field_type: z.enum(['text', 'number', 'date', 'select', 'boolean']),
        is_required: z.boolean().default(false),
        options: z.array(z.string()).optional(),
        position: z.number().int().min(0),
      });
      const p = schema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const stage = await db.selectFrom('pipeline_stages').select('id')
        .where('id', '=', req.params['stageId']!).executeTakeFirst();
      if (!stage) return fail(res, 404, 'NOT_FOUND', 'Stage not found');
      const field = await db.insertInto('stage_fields')
        .values({
          stage_id: req.params['stageId']!,
          name: p.data.name,
          field_type: p.data.field_type,
          is_required: p.data.is_required,
          options: p.data.options ? (JSON.stringify(p.data.options) as never) : null,
          position: p.data.position,
        } as never)
        .returningAll().executeTakeFirstOrThrow();
      res.status(201).json({ data: field, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:stageId/fields/:fieldId', edit, async (req, res, next) => {
    try {
      const schema = z.object({
        name: z.string().min(1).optional(),
        field_type: z.enum(['text', 'number', 'date', 'select', 'boolean']).optional(),
        is_required: z.boolean().optional(),
        options: z.array(z.string()).optional(),
        position: z.number().int().min(0).optional(),
      });
      const p = schema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const existing = await db.selectFrom('stage_fields').select('id')
        .where('id', '=', req.params['fieldId']!).where('stage_id', '=', req.params['stageId']!).executeTakeFirst();
      if (!existing) return fail(res, 404, 'NOT_FOUND', 'Field not found');
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (p.data.name !== undefined) update['name'] = p.data.name;
      if (p.data.field_type !== undefined) update['field_type'] = p.data.field_type;
      if (p.data.is_required !== undefined) update['is_required'] = p.data.is_required;
      if (p.data.position !== undefined) update['position'] = p.data.position;
      if (p.data.options !== undefined) update['options'] = JSON.stringify(p.data.options) as never;
      const field = await db.updateTable('stage_fields').set(update as never)
        .where('id', '=', req.params['fieldId']!).where('stage_id', '=', req.params['stageId']!)
        .returningAll().executeTakeFirstOrThrow();
      res.json({ data: field, error: null });
    } catch (e) { next(e); }
  });

  router.delete('/:stageId/fields/:fieldId', del, async (req, res, next) => {
    try {
      const existing = await db.selectFrom('stage_fields').select('id')
        .where('id', '=', req.params['fieldId']!).where('stage_id', '=', req.params['stageId']!).executeTakeFirst();
      if (!existing) return fail(res, 404, 'NOT_FOUND', 'Field not found');
      await db.deleteFrom('stage_fields').where('id', '=', req.params['fieldId']!).execute();
      res.json({ data: { id: req.params['fieldId'] }, error: null });
    } catch (e) { next(e); }
  });

  return router;
}
