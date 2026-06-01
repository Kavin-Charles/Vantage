import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

// ── Zod schemas ────────────────────────────────────────────────────────────────

const createPipelineSchema = z.object({
  name: z.string().min(1),
  record_type_id: z.string().uuid().optional(),
});
const updatePipelineSchema = z.object({
  name: z.string().min(1).optional(),
  is_default: z.boolean().optional(),
  view: z.enum(['table', 'list']).optional(),
  table_columns: z.array(z.string()).nullable().optional(),
  record_type_id: z.string().uuid().nullable().optional(),
});

const createStageSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  position: z.number().int().min(0),
});
const updateStageSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  position: z.number().int().min(0).optional(),
});

const reorderSchema = z.object({ ids: z.array(z.string().uuid()) });

const createFieldSchema = z.object({
  name: z.string().min(1),
  field_type: z.enum(['text', 'number', 'date', 'select', 'boolean']),
  is_required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  position: z.number().int().min(0),
});
const updateFieldSchema = z.object({
  name: z.string().min(1).optional(),
  field_type: z.enum(['text', 'number', 'date', 'select', 'boolean']).optional(),
  is_required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  position: z.number().int().min(0).optional(),
});

// ── Pipelines router ───────────────────────────────────────────────────────────

export function createPipelinesRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router();

  // GET / — list all pipelines with stage_count
  router.get('/', requirePermission('pipelines:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const pipelines = await db
        .selectFrom('pipelines')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('position', 'asc')
        .execute();

      // Attach stage_count to each pipeline
      const counts = await db
        .selectFrom('pipeline_stages')
        .select(['pipeline_id', db.fn.count<number>('id').as('stage_count')])
        .where(
          'pipeline_id',
          'in',
          pipelines.length > 0 ? pipelines.map(p => p.id) : ['__none__'],
        )
        .groupBy('pipeline_id')
        .execute();

      const countMap = new Map(counts.map(c => [c.pipeline_id, Number(c.stage_count)]));
      const data = pipelines.map(p => ({ ...p, stage_count: countMap.get(p.id) ?? 0 }));

      res.json({ data, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST / — create pipeline (auto-creates Won + Lost stages)
  router.post('/', requirePermission('pipelines:create'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createPipelineSchema.parse(req.body);

      const pipeline = await db
        .insertInto('pipelines')
        .values({ workspace_id: workspace.id, name: parsed.name, ...(parsed.record_type_id ? { record_type_id: parsed.record_type_id } : {}) } as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      await db
        .insertInto('pipeline_stages')
        .values([
          { pipeline_id: pipeline.id, name: 'Won', color: '#22c55e', position: 0, is_won: true },
          { pipeline_id: pipeline.id, name: 'Lost', color: '#ef4444', position: 1, is_lost: true },
        ])
        .execute();

      res.status(201).json({ data: pipeline, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id — update name / is_default
  router.patch('/:id', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = updatePipelineSchema.parse(req.body);

      const exists = await db
        .selectFrom('pipelines')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();

      if (!exists) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Pipeline not found' } });
        return;
      }

      // If setting is_default=true, clear all others first
      if (parsed.is_default === true) {
        await db
          .updateTable('pipelines')
          .set({ is_default: false, updated_at: new Date() })
          .where('workspace_id', '=', workspace.id)
          .where('id', '!=', req.params['id']!)
          .execute();
      }

      // Build update payload; jsonb columns must be explicitly cast because
      // pg sends plain JS arrays as Postgres array literals ({a,b}), not JSON ([a,b])
      const { table_columns, ...rest } = parsed;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateSet: any = { ...rest, updated_at: new Date() };
      if (table_columns !== undefined) {
        updateSet.table_columns = table_columns === null
          ? null
          : sql`${JSON.stringify(table_columns)}::jsonb`;
      }

      const pipeline = await db
        .updateTable('pipelines')
        .set(updateSet)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.json({ data: pipeline, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:id — blocks if pipeline has active deals or records
  router.delete('/:id', requirePermission('pipelines:delete'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const id = req.params['id']!;

      const pipeline = await db
        .selectFrom('pipelines')
        .where('id', '=', id)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();

      if (!pipeline) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Pipeline not found' } });
        return;
      }

      // Delete in FK dependency order (no cascades on these)
      const recordIds = (
        await db.selectFrom('pipeline_records').where('pipeline_id', '=', id).select('id').execute()
      ).map(r => r.id);

      if (recordIds.length > 0) {
        await db.deleteFrom('record_conversions')
          .where(eb => eb.or([
            eb('source_record_id', 'in', recordIds),
            eb('target_record_id', 'in', recordIds),
          ]))
          .execute();
      }

      const templateIds = (
        await db.selectFrom('conversion_templates').where('target_pipeline_id', '=', id).select('id').execute()
      ).map(t => t.id);

      if (templateIds.length > 0) {
        await db.deleteFrom('conversion_field_mappings').where('template_id', 'in', templateIds).execute();
      }

      await db.deleteFrom('pipeline_records').where('pipeline_id', '=', id).execute();
      await db.updateTable('deals').set({ pipeline_id: null, stage_id: null }).where('pipeline_id', '=', id).execute();
      await db.deleteFrom('conversion_templates').where('target_pipeline_id', '=', id).execute();
      await db.deleteFrom('pipelines').where('id', '=', id).where('workspace_id', '=', workspace.id).execute();

      res.json({ data: { id }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /:id — get single pipeline with stages + fields
  router.get('/:id', requirePermission('pipelines:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const pipeline = await db
        .selectFrom('pipelines')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .executeTakeFirst();

      if (!pipeline) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Pipeline not found' } });
        return;
      }

      const stages = await db
        .selectFrom('pipeline_stages')
        .where('pipeline_id', '=', req.params['id']!)
        .selectAll()
        .orderBy('position', 'asc')
        .execute();

      const fields = stages.length > 0
        ? await db
            .selectFrom('stage_fields')
            .where('stage_id', 'in', stages.map(s => s.id))
            .selectAll()
            .orderBy('position', 'asc')
            .execute()
        : [];

      const fieldsByStage = new Map<string, typeof fields>();
      for (const f of fields) {
        const arr = fieldsByStage.get(f.stage_id) ?? [];
        arr.push(f);
        fieldsByStage.set(f.stage_id, arr);
      }

      const stagesWithFields = stages.map(s => ({ ...s, fields: fieldsByStage.get(s.id) ?? [] }));
      res.json({ data: { ...pipeline, stages: stagesWithFields }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /:id/stages — list stages with fields attached
  router.get('/:id/stages', requirePermission('pipelines:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const pipeline = await db
        .selectFrom('pipelines')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();

      if (!pipeline) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Pipeline not found' } });
        return;
      }

      const stages = await db
        .selectFrom('pipeline_stages')
        .where('pipeline_id', '=', req.params['id']!)
        .selectAll()
        .orderBy('position', 'asc')
        .execute();

      // Attach fields to each stage
      const fields = stages.length > 0
        ? await db
            .selectFrom('stage_fields')
            .where('stage_id', 'in', stages.map(s => s.id))
            .selectAll()
            .orderBy('position', 'asc')
            .execute()
        : [];

      const fieldsByStage = new Map<string, typeof fields>();
      for (const f of fields) {
        const arr = fieldsByStage.get(f.stage_id) ?? [];
        arr.push(f);
        fieldsByStage.set(f.stage_id, arr);
      }

      const data = stages.map(s => ({ ...s, fields: fieldsByStage.get(s.id) ?? [] }));
      res.json({ data, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /:id/stages — create stage (not is_won/is_lost)
  router.post('/:id/stages', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createStageSchema.parse(req.body);

      const pipeline = await db
        .selectFrom('pipelines')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();

      if (!pipeline) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Pipeline not found' } });
        return;
      }

      const stage = await db
        .insertInto('pipeline_stages')
        .values({ pipeline_id: req.params['id']!, ...parsed })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: stage, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id/stages/:stageId — update name/color/position (rename of won/lost allowed)
  router.patch('/:id/stages/:stageId', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = updateStageSchema.parse(req.body);

      const pipeline = await db
        .selectFrom('pipelines')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();

      if (!pipeline) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Pipeline not found' } });
        return;
      }

      const existing = await db
        .selectFrom('pipeline_stages')
        .where('id', '=', req.params['stageId']!)
        .where('pipeline_id', '=', req.params['id']!)
        .select('id')
        .executeTakeFirst();

      if (!existing) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Stage not found' } });
        return;
      }

      const stage = await db
        .updateTable('pipeline_stages')
        .set({ ...parsed, updated_at: new Date() })
        .where('id', '=', req.params['stageId']!)
        .where('pipeline_id', '=', req.params['id']!)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.json({ data: stage, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:id/stages/:stageId
  router.delete('/:id/stages/:stageId', requirePermission('pipelines:delete'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const pipeline = await db
        .selectFrom('pipelines')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();

      if (!pipeline) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Pipeline not found' } });
        return;
      }

      const stage = await db
        .selectFrom('pipeline_stages')
        .where('id', '=', req.params['stageId']!)
        .where('pipeline_id', '=', req.params['id']!)
        .select(['id', 'is_won', 'is_lost'])
        .executeTakeFirst();

      if (!stage) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Stage not found' } });
        return;
      }

      if (stage.is_won || stage.is_lost) {
        res.status(400).json({
          data: null,
          error: { code: 'TERMINAL_STAGE', message: 'Cannot delete terminal stages' },
        });
        return;
      }

      const dealCount = await db
        .selectFrom('deals')
        .where('stage_id', '=', req.params['stageId']!)
        .where('deleted_at', 'is', null)
        .select(db.fn.count<number>('id').as('cnt'))
        .executeTakeFirstOrThrow();

      const n = Number(dealCount.cnt);
      if (n > 0) {
        res.status(400).json({
          data: null,
          error: {
            code: 'STAGE_HAS_DEALS',
            message: `Move or reassign ${n} deals before deleting this stage`,
          },
        });
        return;
      }

      await db
        .deleteFrom('pipeline_stages')
        .where('id', '=', req.params['stageId']!)
        .execute();

      res.json({ data: { id: req.params['stageId'] }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /:id/stages/reorder — { ids: string[] } sets position by index
  router.post('/:id/stages/reorder', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = reorderSchema.parse(req.body);

      const pipeline = await db
        .selectFrom('pipelines')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();

      if (!pipeline) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Pipeline not found' } });
        return;
      }

      await Promise.all(
        parsed.ids.map((stageId, idx) =>
          db
            .updateTable('pipeline_stages')
            .set({ position: idx, updated_at: new Date() })
            .where('id', '=', stageId)
            .where('pipeline_id', '=', req.params['id']!)
            .execute(),
        ),
      );

      res.json({ data: { reordered: parsed.ids.length }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PUT /:id/stages/:stageId/required-fields — set which fields are required to enter this stage
  router.put('/:id/stages/:stageId/required-fields', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { field_ids } = z.object({ field_ids: z.array(z.string().uuid()) }).parse(req.body);

      // Verify pipeline belongs to workspace
      const pipeline = await db
        .selectFrom('pipelines')
        .select(['id'])
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!pipeline) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Pipeline not found' } });
        return;
      }

      // Replace required fields for this stage (full replace semantics)
      await db.deleteFrom('stage_required_fields').where('stage_id', '=', req.params['stageId']!).execute();
      if (field_ids.length > 0) {
        await db
          .insertInto('stage_required_fields')
          .values(field_ids.map(field_id => ({ stage_id: req.params['stageId']!, field_id })))
          .execute();
      }
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}

// ── Stage fields router ────────────────────────────────────────────────────────

export function createStageFieldsRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router({ mergeParams: true });

  // GET /:stageId/fields
  router.get('/:stageId/fields', requirePermission('pipelines:view'), async (req, res, next) => {
    try {
      const fields = await db
        .selectFrom('stage_fields')
        .where('stage_id', '=', req.params['stageId']!)
        .selectAll()
        .orderBy('position', 'asc')
        .execute();

      res.json({ data: fields, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /:stageId/fields
  router.post('/:stageId/fields', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const parsed = createFieldSchema.parse(req.body);

      const stage = await db
        .selectFrom('pipeline_stages')
        .where('id', '=', req.params['stageId']!)
        .select('id')
        .executeTakeFirst();

      if (!stage) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Stage not found' } });
        return;
      }

      const field = await db
        .insertInto('stage_fields')
        .values({
          stage_id: req.params['stageId']!,
          name: parsed.name,
          field_type: parsed.field_type,
          is_required: parsed.is_required,
          options: parsed.options ? (JSON.stringify(parsed.options) as never) : null,
          position: parsed.position,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: field, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:stageId/fields/:fieldId
  router.patch('/:stageId/fields/:fieldId', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const parsed = updateFieldSchema.parse(req.body);

      const existing = await db
        .selectFrom('stage_fields')
        .where('id', '=', req.params['fieldId']!)
        .where('stage_id', '=', req.params['stageId']!)
        .select('id')
        .executeTakeFirst();

      if (!existing) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Field not found' } });
        return;
      }

      const updateValues: Record<string, unknown> = { updated_at: new Date() };
      if (parsed.name !== undefined) updateValues['name'] = parsed.name;
      if (parsed.field_type !== undefined) updateValues['field_type'] = parsed.field_type;
      if (parsed.is_required !== undefined) updateValues['is_required'] = parsed.is_required;
      if (parsed.position !== undefined) updateValues['position'] = parsed.position;
      if (parsed.options !== undefined) updateValues['options'] = JSON.stringify(parsed.options) as never;

      const field = await db
        .updateTable('stage_fields')
        .set(updateValues as never)
        .where('id', '=', req.params['fieldId']!)
        .where('stage_id', '=', req.params['stageId']!)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.json({ data: field, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:stageId/fields/:fieldId
  router.delete('/:stageId/fields/:fieldId', requirePermission('pipelines:delete'), async (req, res, next) => {
    try {
      const existing = await db
        .selectFrom('stage_fields')
        .where('id', '=', req.params['fieldId']!)
        .where('stage_id', '=', req.params['stageId']!)
        .select('id')
        .executeTakeFirst();

      if (!existing) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Field not found' } });
        return;
      }

      await db
        .deleteFrom('stage_fields')
        .where('id', '=', req.params['fieldId']!)
        .execute();

      res.json({ data: { id: req.params['fieldId'] }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /:stageId/fields/reorder
  router.post('/:stageId/fields/reorder', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const parsed = reorderSchema.parse(req.body);

      const stage = await db
        .selectFrom('pipeline_stages')
        .where('id', '=', req.params['stageId']!)
        .select('id')
        .executeTakeFirst();

      if (!stage) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Stage not found' } });
        return;
      }

      await Promise.all(
        parsed.ids.map((fieldId, idx) =>
          db
            .updateTable('stage_fields')
            .set({ position: idx, updated_at: new Date() })
            .where('id', '=', fieldId)
            .where('stage_id', '=', req.params['stageId']!)
            .execute(),
        ),
      );

      res.json({ data: { reordered: parsed.ids.length }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
