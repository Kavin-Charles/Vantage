import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { logItemCreated, logStageChanged, logFieldChanged } from '../lib/pipeline-activity';
import { resolveHook } from '../lib/hooks-runtime';
import { emitCrmEvent } from '../lib/crm-events';
import { maybeSpawnProjectOnDealWon } from '../lib/deal-close-hooks';

async function seedDefaultStatuses(db: Kysely<Database>, projectId: string) {
  const statuses = [
    { name: 'Backlog',     color: '#9e998f', position: 0, is_done: false },
    { name: 'In Progress', color: '#1e3a8a', position: 1, is_done: false },
    { name: 'In Review',   color: '#92400e', position: 2, is_done: false },
    { name: 'Done',        color: '#2d6a4f', position: 3, is_done: true  },
  ]
  await db.insertInto('project_task_statuses')
    .values(statuses.map(s => ({ ...s, project_id: projectId })))
    .execute()
}

async function maybeAutoCreateProject(
  db: Kysely<Database>,
  workspaceId: string,
  itemId: string,
  newStageId: string,
  createdByUserId: string,
) {
  const hook = await resolveHook(db, workspaceId, 'projects', 'auto_project_from_deal')
  if (!hook) return

  const stage = await db.selectFrom('pipeline_stages')
    .select(['is_won'])
    .where('id', '=', newStageId)
    .executeTakeFirst()
  if (!stage?.is_won) return

  // idempotent — only create once per item
  const existing = await db.selectFrom('projects')
    .select('id')
    .where('source_item_id', '=', itemId)
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst()
  if (existing) return

  const item = await db.selectFrom('pipeline_items')
    .select(['field_values'])
    .where('id', '=', itemId)
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst()
  if (!item) return

  const fieldValues = item.field_values as Record<string, unknown>
  const projectName = (fieldValues['name'] as string | undefined)
    ?? (fieldValues['title'] as string | undefined)
    ?? 'New Project'

  const project = await db.insertInto('projects')
    .values({
      workspace_id: workspaceId,
      created_by: createdByUserId,
      name: String(projectName),
      source_item_id: itemId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  await seedDefaultStatuses(db, project.id)
}

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

      emitCrmEvent(db, item.workspace_id, 'crm.deal@v1', 'created', item.id);

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

  // Search items across all pipelines — used by CRM link combobox
  router.get('/', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const search = (req.query['search'] as string | undefined)?.trim();
      const limit = Math.min(20, Math.max(1, Number(req.query['limit'] ?? 10)));
      if (!search) return res.json({ data: [], error: null });

      const pattern = `%${search}%`;
      const items = await db.selectFrom('pipeline_items as i')
        .innerJoin('pipeline_stages as s', 's.id', 'i.stage_id')
        .innerJoin('pipelines as p', 'p.id', 'i.pipeline_id')
        .select(['i.id', 'i.field_values', 'i.stage_id', 'i.pipeline_id', 'p.name as pipeline_name', 's.name as stage_name'])
        .where('i.workspace_id', '=', workspaceId)
        .where('i.deleted_at', 'is', null)
        .where(sql<boolean>`i.field_values->>'name' ilike ${pattern}`)
        .limit(limit)
        .execute();

      res.json({ data: items, error: null });
    } catch (e) { next(e); }
  });

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
        await maybeAutoCreateProject(db, workspaceId, current.id, body.stage_id, userId);
        emitCrmEvent(db, workspaceId, 'crm.deal@v1', 'stage_changed', current.id, { stage_id: body.stage_id });

        const newStage = await db.selectFrom('pipeline_stages')
          .select('is_won')
          .where('id', '=', body.stage_id)
          .executeTakeFirst();
        if (newStage?.is_won) {
          void maybeSpawnProjectOnDealWon({ db, workspaceId, userId, dealId: current.id });
        }
      }
      emitCrmEvent(db, workspaceId, 'crm.deal@v1', 'updated', current.id);

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

      const current = await db.selectFrom('pipeline_items').select(['id', 'stage_id', 'pipeline_id', 'field_values'])
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
        await maybeAutoCreateProject(db, workspaceId, current.id, stage_id, userId);
        emitCrmEvent(db, workspaceId, 'crm.deal@v1', 'stage_changed', current.id, { stage_id });

        const newStage = await db.selectFrom('pipeline_stages')
          .select('is_won')
          .where('id', '=', stage_id)
          .executeTakeFirst();
        if (newStage?.is_won) {
          void maybeSpawnProjectOnDealWon({ db, workspaceId, userId, dealId: current.id });
        }
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
