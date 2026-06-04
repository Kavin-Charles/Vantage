// apps/api/src/routes/item-groups.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const FORBIDDEN = { data: null, error: { code: 'FORBIDDEN', message: 'Admin only' } };
const NOT_FOUND = (msg: string) => ({ data: null, error: { code: 'NOT_FOUND', message: msg } });

function isAdmin(req: AuthenticatedRequest): boolean {
  return req.user.role === 'admin';
}

const createGroupSchema = z.object({
  pipeline_id: z.string().uuid(),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  position: z.number().int().min(0).optional(),
});

const createStageSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
});

const updateStageSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const reorderSchema = z.object({ ids: z.array(z.string().uuid()) });

const createFieldSchema = z.object({
  label: z.string().min(1),
  field_type: z.enum(['text', 'number', 'date', 'select', 'boolean']),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
});

const updateFieldSchema = z.object({
  label: z.string().min(1).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

export function createItemGroupsRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router();

  // ── Groups ──────────────────────────────────────────────────────────────────

  // GET / — list groups for a pipeline with stages + fields (all authenticated)
  router.get('/', requirePermission('pipelines:view'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      const pipelineId = req.query['pipeline_id'] as string | undefined;
      if (!pipelineId) {
        res.status(400).json({ data: null, error: { code: 'MISSING_PARAM', message: 'pipeline_id required' } });
        return;
      }

      const groups = await db
        .selectFrom('item_groups')
        .where('workspace_id', '=', auth.workspace.id)
        .where('pipeline_id', '=', pipelineId)
        .selectAll()
        .orderBy('position', 'asc')
        .execute();

      if (groups.length === 0) {
        res.json({ data: [], error: null });
        return;
      }

      const stages = await db
        .selectFrom('group_stages')
        .where('group_id', 'in', groups.map(g => g.id))
        .selectAll()
        .orderBy('position', 'asc')
        .execute();

      const fields = stages.length > 0
        ? await db
            .selectFrom('item_fields')
            .where('group_id', 'in', groups.map(g => g.id))
            .selectAll()
            .orderBy('position', 'asc')
            .execute()
        : [];

      const fieldsByGroup = new Map<string, typeof fields>();
      for (const f of fields) {
        const arr = fieldsByGroup.get(f.group_id) ?? [];
        arr.push(f);
        fieldsByGroup.set(f.group_id, arr);
      }

      const stagesByGroup = new Map<string, typeof stages>();
      for (const s of stages) {
        const arr = stagesByGroup.get(s.group_id) ?? [];
        arr.push(s);
        stagesByGroup.set(s.group_id, arr);
      }

      const data = groups.map(g => ({
        ...g,
        stages: (stagesByGroup.get(g.id) ?? []).map(s => ({ ...s, fields: [] as typeof fields })),
        fields: fieldsByGroup.get(g.id) ?? [],
      }));

      res.json({ data, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /:id — single group with stages + fields
  router.get('/:id', requirePermission('pipelines:view'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;

      const group = await db
        .selectFrom('item_groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .selectAll()
        .executeTakeFirst();

      if (!group) {
        res.status(404).json(NOT_FOUND('Item group not found'));
        return;
      }

      const stages = await db
        .selectFrom('group_stages')
        .where('group_id', '=', group.id)
        .selectAll()
        .orderBy('position', 'asc')
        .execute();

      const fields = await db
        .selectFrom('item_fields')
        .where('group_id', '=', group.id)
        .selectAll()
        .orderBy('position', 'asc')
        .execute();

      res.json({ data: { ...group, stages, fields }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST / — create group (admin)
  router.post('/', requirePermission('pipelines:create'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      if (!isAdmin(auth)) { res.status(403).json(FORBIDDEN); return; }

      const parsed = createGroupSchema.parse(req.body);

      // Verify pipeline belongs to workspace
      const pipeline = await db
        .selectFrom('pipelines')
        .where('id', '=', parsed.pipeline_id)
        .where('workspace_id', '=', auth.workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!pipeline) { res.status(404).json(NOT_FOUND('Pipeline not found')); return; }

      // Position = count of existing groups in pipeline
      const countRow = await db
        .selectFrom('item_groups')
        .where('pipeline_id', '=', parsed.pipeline_id)
        .select(db.fn.count<number>('id').as('cnt'))
        .executeTakeFirstOrThrow();
      const position = Number(countRow.cnt);

      const group = await db
        .insertInto('item_groups')
        .values({
          pipeline_id: parsed.pipeline_id,
          workspace_id: auth.workspace.id,
          name: parsed.name,
          color: parsed.color ?? null,
          position,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Auto-create Won + Lost stages
      await db
        .insertInto('group_stages')
        .values([
          { group_id: group.id, name: 'Won', color: '#22c55e', position: 0, is_won: true },
          { group_id: group.id, name: 'Lost', color: '#ef4444', position: 1, is_lost: true },
        ])
        .execute();

      res.status(201).json({ data: group, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id — update group (admin)
  router.patch('/:id', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      if (!isAdmin(auth)) { res.status(403).json(FORBIDDEN); return; }

      const parsed = updateGroupSchema.parse(req.body);

      const existing = await db
        .selectFrom('item_groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!existing) { res.status(404).json(NOT_FOUND('Item group not found')); return; }

      const group = await db
        .updateTable('item_groups')
        .set({ ...parsed, updated_at: new Date() })
        .where('id', '=', req.params['id']!)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.json({ data: group, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:id — delete group (admin, blocks if items exist)
  router.delete('/:id', requirePermission('pipelines:delete'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      if (!isAdmin(auth)) { res.status(403).json(FORBIDDEN); return; }

      const existing = await db
        .selectFrom('item_groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!existing) { res.status(404).json(NOT_FOUND('Item group not found')); return; }

      const countRow = await db
        .selectFrom('items')
        .where('group_id', '=', req.params['id']!)
        .where('deleted_at', 'is', null)
        .select(db.fn.count<number>('id').as('cnt'))
        .executeTakeFirstOrThrow();
      const n = Number(countRow.cnt);
      if (n > 0) {
        res.status(400).json({ data: null, error: { code: 'GROUP_HAS_ITEMS', message: `Group has ${n} items. Delete or move them first.` } });
        return;
      }

      await db.deleteFrom('item_groups').where('id', '=', req.params['id']!).execute();
      res.json({ data: { id: req.params['id'] }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // ── Stages ──────────────────────────────────────────────────────────────────

  // POST /:id/stages — add stage (admin)
  router.post('/:id/stages', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      if (!isAdmin(auth)) { res.status(403).json(FORBIDDEN); return; }

      const parsed = createStageSchema.parse(req.body);

      const group = await db
        .selectFrom('item_groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!group) { res.status(404).json(NOT_FOUND('Item group not found')); return; }

      const countRow = await db
        .selectFrom('group_stages')
        .where('group_id', '=', req.params['id']!)
        .select(db.fn.count<number>('id').as('cnt'))
        .executeTakeFirstOrThrow();
      const position = Number(countRow.cnt);

      const stage = await db
        .insertInto('group_stages')
        .values({ group_id: req.params['id']!, name: parsed.name, color: parsed.color, position })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: stage, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id/stages/:stageId — rename/recolor stage (admin, terminal stages allowed)
  router.patch('/:id/stages/:stageId', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      if (!isAdmin(auth)) { res.status(403).json(FORBIDDEN); return; }

      const parsed = updateStageSchema.parse(req.body);

      const group = await db
        .selectFrom('item_groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!group) { res.status(404).json(NOT_FOUND('Item group not found')); return; }

      const existing = await db
        .selectFrom('group_stages')
        .where('id', '=', req.params['stageId']!)
        .where('group_id', '=', req.params['id']!)
        .select('id')
        .executeTakeFirst();
      if (!existing) { res.status(404).json(NOT_FOUND('Stage not found')); return; }

      const stage = await db
        .updateTable('group_stages')
        .set({ ...parsed, updated_at: new Date() })
        .where('id', '=', req.params['stageId']!)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.json({ data: stage, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:id/stages/:stageId — delete stage (admin, blocks if items in stage, blocks terminal)
  router.delete('/:id/stages/:stageId', requirePermission('pipelines:delete'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      if (!isAdmin(auth)) { res.status(403).json(FORBIDDEN); return; }

      const group = await db
        .selectFrom('item_groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!group) { res.status(404).json(NOT_FOUND('Item group not found')); return; }

      const stage = await db
        .selectFrom('group_stages')
        .where('id', '=', req.params['stageId']!)
        .where('group_id', '=', req.params['id']!)
        .select(['id', 'is_won', 'is_lost'])
        .executeTakeFirst();
      if (!stage) { res.status(404).json(NOT_FOUND('Stage not found')); return; }

      if (stage.is_won || stage.is_lost) {
        res.status(400).json({ data: null, error: { code: 'TERMINAL_STAGE', message: 'Cannot delete terminal stages' } });
        return;
      }

      const countRow = await db
        .selectFrom('items')
        .where('stage_id', '=', req.params['stageId']!)
        .where('deleted_at', 'is', null)
        .select(db.fn.count<number>('id').as('cnt'))
        .executeTakeFirstOrThrow();
      const n = Number(countRow.cnt);
      if (n > 0) {
        res.status(400).json({ data: null, error: { code: 'STAGE_HAS_ITEMS', message: `Move ${n} items before deleting this stage` } });
        return;
      }

      await db.deleteFrom('group_stages').where('id', '=', req.params['stageId']!).execute();
      res.json({ data: { id: req.params['stageId'] }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /:id/stages/reorder — { ids: string[] } (admin)
  router.post('/:id/stages/reorder', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      if (!isAdmin(auth)) { res.status(403).json(FORBIDDEN); return; }

      const parsed = reorderSchema.parse(req.body);
      await Promise.all(
        parsed.ids.map((stageId, idx) =>
          db.updateTable('group_stages')
            .set({ position: idx, updated_at: new Date() })
            .where('id', '=', stageId)
            .where('group_id', '=', req.params['id']!)
            .execute(),
        ),
      );
      res.json({ data: { reordered: parsed.ids.length }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // ── Fields ──────────────────────────────────────────────────────────────────

  // POST /:id/fields — add custom field (admin)
  router.post('/:id/fields', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      if (!isAdmin(auth)) { res.status(403).json(FORBIDDEN); return; }

      const parsed = createFieldSchema.parse(req.body);

      const group = await db
        .selectFrom('item_groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!group) { res.status(404).json(NOT_FOUND('Item group not found')); return; }

      const countRow = await db
        .selectFrom('item_fields')
        .where('group_id', '=', req.params['id']!)
        .select(db.fn.count<number>('id').as('cnt'))
        .executeTakeFirstOrThrow();
      const position = Number(countRow.cnt);

      const field = await db
        .insertInto('item_fields')
        .values({
          group_id: req.params['id']!,
          label: parsed.label,
          field_type: parsed.field_type,
          required: parsed.required,
          options: parsed.options ? (JSON.stringify(parsed.options) as never) : null,
          position,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: field, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id/fields/:fieldId — update field (admin)
  router.patch('/:id/fields/:fieldId', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      if (!isAdmin(auth)) { res.status(403).json(FORBIDDEN); return; }

      const parsed = updateFieldSchema.parse(req.body);

      const existing = await db
        .selectFrom('item_fields')
        .where('id', '=', req.params['fieldId']!)
        .where('group_id', '=', req.params['id']!)
        .select('id')
        .executeTakeFirst();
      if (!existing) { res.status(404).json(NOT_FOUND('Field not found')); return; }

      const updateVals: Record<string, unknown> = { updated_at: new Date() };
      if (parsed.label !== undefined) updateVals['label'] = parsed.label;
      if (parsed.required !== undefined) updateVals['required'] = parsed.required;
      if (parsed.options !== undefined) updateVals['options'] = JSON.stringify(parsed.options) as never;

      const field = await db
        .updateTable('item_fields')
        .set(updateVals as never)
        .where('id', '=', req.params['fieldId']!)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.json({ data: field, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:id/fields/:fieldId — delete field (admin)
  router.delete('/:id/fields/:fieldId', requirePermission('pipelines:delete'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      if (!isAdmin(auth)) { res.status(403).json(FORBIDDEN); return; }

      const existing = await db
        .selectFrom('item_fields')
        .where('id', '=', req.params['fieldId']!)
        .where('group_id', '=', req.params['id']!)
        .select('id')
        .executeTakeFirst();
      if (!existing) { res.status(404).json(NOT_FOUND('Field not found')); return; }

      await db.deleteFrom('item_fields').where('id', '=', req.params['fieldId']!).execute();
      res.json({ data: { id: req.params['fieldId'] }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
