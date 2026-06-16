import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const fieldTypeEnum = z.enum(['text','number','date','select','multiselect','user','checkbox','url']);

const createFieldSchema = z.object({
  label: z.string().min(1),
  key: z.string().min(1).regex(/^[a-z_][a-z0-9_]*$/, 'key must be snake_case'),
  type: fieldTypeEnum,
  options: z.array(z.object({ label: z.string(), value: z.string() })).nullish(),
  position: z.number().int().default(0),
  required: z.boolean().default(false),
});

const updateFieldSchema = z.object({
  label: z.string().min(1).optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  position: z.number().int().optional(),
  required: z.boolean().optional(),
});

const reorderSchema = z.object({ ids: z.array(z.string().uuid()) });

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

async function getPipeline(db: Kysely<Database>, pipelineId: string, workspaceId: string) {
  return db.selectFrom('pipelines').select('id')
    .where('id', '=', pipelineId)
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
}

export function createPipelineFieldsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router({ mergeParams: true });
  const view = requirePermission('pipelines:view');
  const edit = requirePermission('pipelines:edit');

  // List fields
  router.get('/', view, async (req, res, next) => {
    try {
      const pipeline = await getPipeline(db, req.params['pipelineId']!, (req as AuthenticatedRequest).workspace.id);
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');
      const fields = await db.selectFrom('pipeline_fields').selectAll()
        .where('pipeline_id', '=', pipeline.id)
        .orderBy('position', 'asc').execute();
      res.json({ data: fields, error: null });
    } catch (e) { next(e); }
  });

  // Create field
  router.post('/', edit, async (req, res, next) => {
    try {
      const pipeline = await getPipeline(db, req.params['pipelineId']!, (req as AuthenticatedRequest).workspace.id);
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');

      const body = createFieldSchema.parse(req.body);
      const field = await db.insertInto('pipeline_fields')
        .values({ ...body, options: body.options != null ? JSON.stringify(body.options) : null, pipeline_id: pipeline.id })
        .returningAll().executeTakeFirstOrThrow();
      res.status(201).json({ data: field, error: null });
    } catch (e) { next(e); }
  });

  // Update field
  router.patch('/:fieldId', edit, async (req, res, next) => {
    try {
      const pipeline = await getPipeline(db, req.params['pipelineId']!, (req as AuthenticatedRequest).workspace.id);
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');

      const body = updateFieldSchema.parse(req.body);
      const field = await db.updateTable('pipeline_fields').set({
        ...(body.label !== undefined && { label: body.label }),
        ...(body.options !== undefined && { options: body.options != null ? JSON.stringify(body.options) : null }),
        ...(body.position !== undefined && { position: body.position }),
        ...(body.required !== undefined && { required: body.required }),
      })
        .where('id', '=', req.params['fieldId']!)
        .where('pipeline_id', '=', pipeline.id)
        .returningAll().executeTakeFirst();
      if (!field) return fail(res, 404, 'NOT_FOUND', 'Field not found');
      res.json({ data: field, error: null });
    } catch (e) { next(e); }
  });

  // Delete field
  router.delete('/:fieldId', edit, async (req, res, next) => {
    try {
      const pipeline = await getPipeline(db, req.params['pipelineId']!, (req as AuthenticatedRequest).workspace.id);
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');

      const field = await db.deleteFrom('pipeline_fields')
        .where('id', '=', req.params['fieldId']!)
        .where('pipeline_id', '=', pipeline.id)
        .returningAll().executeTakeFirst();
      if (!field) return fail(res, 404, 'NOT_FOUND', 'Field not found');
      res.json({ data: { id: field.id }, error: null });
    } catch (e) { next(e); }
  });

  // Reorder fields
  router.post('/reorder', edit, async (req, res, next) => {
    try {
      const pipeline = await getPipeline(db, req.params['pipelineId']!, (req as AuthenticatedRequest).workspace.id);
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');

      const { ids } = reorderSchema.parse(req.body);
      await Promise.all(ids.map((fieldId, i) =>
        db.updateTable('pipeline_fields').set({ position: i })
          .where('id', '=', fieldId)
          .where('pipeline_id', '=', pipeline.id)
          .execute()
      ));
      res.json({ data: { reordered: ids.length }, error: null });
    } catch (e) { next(e); }
  });

  return router;
}
