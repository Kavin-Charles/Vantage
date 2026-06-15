import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { logItemCreated, logStageChanged, logFieldChanged } from '../lib/pipeline-activity';

const createItemSchema = z.object({
  stage_id: z.string().uuid(),
  field_values: z.record(z.unknown()).default({}),
  position: z.number().int().default(0),
});

const updateItemSchema = z.object({
  stage_id: z.string().uuid().optional(),
  field_values: z.record(z.unknown()).optional(),
});

const moveItemSchema = z.object({
  stage_id: z.string().uuid(),
  position: z.number().int(),
});

const listSchema = z.object({
  stage_id: z.string().uuid().optional(),
  page: z.coerce.number().int().default(1),
  limit: z.coerce.number().int().max(200).default(100),
});

function ws(req: AuthenticatedRequest) { return req.workspace.id; }
function uid(req: AuthenticatedRequest) { return req.user.id; }
function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createPipelineItemsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router({ mergeParams: true });
  const view   = requirePermission('pipelines:view');
  const create = requirePermission('pipelines:create');

  // List items for a pipeline
  router.get('/', view, async (req, res, next) => {
    try {
      const q = listSchema.parse(req.query);
      let query = db.selectFrom('pipeline_items').selectAll()
        .where('pipeline_id', '=', req.params['pipelineId']!)
        .where('workspace_id', '=', ws(req as AuthenticatedRequest))
        .where('deleted_at', 'is', null)
        .orderBy('position', 'asc');

      if (q.stage_id) query = query.where('stage_id', '=', q.stage_id);

      const offset = (q.page - 1) * q.limit;
      const items = await query.limit(q.limit).offset(offset).execute();
      res.json({ data: items, error: null });
    } catch (e) { next(e); }
  });

  // Create item
  router.post('/', create, async (req, res, next) => {
    try {
      const body = createItemSchema.parse(req.body);
      const item = await db.insertInto('pipeline_items').values({
        pipeline_id: req.params['pipelineId']!,
        workspace_id: ws(req as AuthenticatedRequest),
        stage_id: body.stage_id,
        field_values: body.field_values as any,
        position: body.position,
      }).returningAll().executeTakeFirstOrThrow();

      await logItemCreated({
        db, itemId: item.id,
        pipelineId: item.pipeline_id,
        workspaceId: item.workspace_id,
        userId: uid(req as AuthenticatedRequest),
      });

      res.status(201).json({ data: item, error: null });
    } catch (e) { next(e); }
  });

  return router;
}

const activityQuerySchema = z.object({
  page: z.coerce.number().int().default(1),
  limit: z.coerce.number().int().max(100).default(50),
});

export function createItemRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('pipelines:view');
  const edit = requirePermission('pipelines:edit');
  const del  = requirePermission('pipelines:delete');

  // Get single item
  router.get('/:id', view, async (req, res, next) => {
    try {
      const item = await db.selectFrom('pipeline_items').selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', (req as AuthenticatedRequest).workspace.id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!item) return fail(res, 404, 'NOT_FOUND', 'Item not found');
      res.json({ data: item, error: null });
    } catch (e) { next(e); }
  });

  // Update item (stage + field_values)
  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const body = updateItemSchema.parse(req.body);
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;

      const current = await db.selectFrom('pipeline_items').selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!current) return fail(res, 404, 'NOT_FOUND', 'Item not found');

      const updated = await db.updateTable('pipeline_items')
        .set({
          ...(body.stage_id ? { stage_id: body.stage_id } : {}),
          ...(body.field_values ? { field_values: body.field_values as any } : {}),
          updated_at: new Date(),
        })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .returningAll().executeTakeFirstOrThrow();

      if (body.stage_id && body.stage_id !== current.stage_id) {
        await logStageChanged({
          db, itemId: current.id, pipelineId: current.pipeline_id,
          workspaceId, userId,
          fromStageId: current.stage_id, toStageId: body.stage_id,
        });
      }

      if (body.field_values) {
        const oldVals = current.field_values as Record<string, unknown>;
        for (const [key, newValue] of Object.entries(body.field_values)) {
          const oldValue = oldVals[key];
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            await logFieldChanged({
              db, itemId: current.id, pipelineId: current.pipeline_id,
              workspaceId, userId, fieldKey: key, oldValue, newValue,
            });
          }
        }
      }

      res.json({ data: updated, error: null });
    } catch (e) { next(e); }
  });

  // Move item (stage + position)
  router.patch('/:id/move', edit, async (req, res, next) => {
    try {
      const { stage_id, position } = moveItemSchema.parse(req.body);
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;

      const current = await db.selectFrom('pipeline_items').select(['id', 'stage_id', 'pipeline_id'])
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!current) return fail(res, 404, 'NOT_FOUND', 'Item not found');

      await db.updateTable('pipeline_items')
        .set({ stage_id, position, updated_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .execute();

      if (stage_id !== current.stage_id) {
        await logStageChanged({
          db, itemId: current.id, pipelineId: current.pipeline_id,
          workspaceId, userId,
          fromStageId: current.stage_id, toStageId: stage_id,
        });
      }

      res.json({ data: { id: current.id, stage_id, position }, error: null });
    } catch (e) { next(e); }
  });

  // Soft delete
  router.delete('/:id', del, async (req, res, next) => {
    try {
      const item = await db.updateTable('pipeline_items')
        .set({ deleted_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', (req as AuthenticatedRequest).workspace.id)
        .where('deleted_at', 'is', null)
        .returningAll().executeTakeFirst();
      if (!item) return fail(res, 404, 'NOT_FOUND', 'Item not found');
      res.json({ data: { id: item.id }, error: null });
    } catch (e) { next(e); }
  });

  // Activity feed for item
  router.get('/:id/activity', view, async (req, res, next) => {
    try {
      const q = activityQuerySchema.parse(req.query);
      const activity = await db.selectFrom('pipeline_activity').selectAll()
        .where('item_id', '=', req.params['id']!)
        .where('workspace_id', '=', (req as AuthenticatedRequest).workspace.id)
        .orderBy('created_at', 'desc')
        .limit(q.limit)
        .offset((q.page - 1) * q.limit)
        .execute();
      res.json({ data: activity, error: null });
    } catch (e) { next(e); }
  });

  return router;
}
