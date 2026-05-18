import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { generateRecordNumber } from '../lib/auto-number';

const createRecordSchema = z.object({
  record_type_id: z.string().uuid(),
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  name: z.string().min(1),
  owner_id: z.string().uuid(),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  field_values: z.record(z.unknown()).optional(),
});

const listQuerySchema = z.object({
  record_type_id: z.string().uuid().optional(),
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  owner_id: z.string().uuid().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});

export function createRecordsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // List
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const query = listQuerySchema.parse(req.query);
      const offset = (query.page - 1) * query.per_page;

      let q = db
        .selectFrom('pipeline_records')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null);

      if (query.record_type_id) q = q.where('record_type_id', '=', query.record_type_id);
      if (query.pipeline_id) q = q.where('pipeline_id', '=', query.pipeline_id);
      if (query.stage_id) q = q.where('stage_id', '=', query.stage_id);
      if (query.owner_id) q = q.where('owner_id', '=', query.owner_id);
      if (query.q) q = q.where('name', 'like', `%${query.q}%`);

      const records = await q.orderBy('created_at', 'desc').limit(query.per_page).offset(offset).execute();
      res.json({ data: records, page: query.page, per_page: query.per_page, error: null });
    } catch (err) { next(err); }
  });

  // Get one
  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const record = await db
        .selectFrom('pipeline_records')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!record) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Record not found' } });
        return;
      }

      const fieldValues = await db
        .selectFrom('record_field_values')
        .selectAll()
        .where('record_id', '=', record.id)
        .execute();

      res.json({ data: { ...record, field_values: fieldValues }, error: null });
    } catch (err) { next(err); }
  });

  // Create
  router.post('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createRecordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
        return;
      }
      const { field_values, ...recordData } = parsed.data;

      // Verify record_type belongs to workspace
      const recordType = await db
        .selectFrom('record_types')
        .select(['id'])
        .where('id', '=', recordData.record_type_id)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!recordType) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Record type not found' } });
        return;
      }

      // Auto-number (returns null if disabled)
      const record_number = await generateRecordNumber(db, recordData.record_type_id).catch(() => null);

      const record = await db
        .insertInto('pipeline_records')
        .values({
          workspace_id: workspace.id,
          ...recordData,
          contact_id: recordData.contact_id ?? null,
          company_id: recordData.company_id ?? null,
          record_number: record_number ?? null,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      // Insert field values
      if (field_values && Object.keys(field_values).length > 0) {
        await db.insertInto('record_field_values').values(
          Object.entries(field_values).map(([field_id, value]) => ({
            record_id: (record as Record<string, unknown>)['id'] as string,
            field_id,
            value: JSON.stringify(value),
          }))
        ).execute();
      }

      res.json({ data: record, error: null });
    } catch (err) { next(err); }
  });

  const updateRecordSchema = z.object({
    name: z.string().min(1).optional(),
    stage_id: z.string().uuid().optional(),
    pipeline_id: z.string().uuid().optional(),
    owner_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().nullable().optional(),
    company_id: z.string().uuid().nullable().optional(),
    field_values: z.record(z.unknown()).optional(),
  });

  // Update
  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = updateRecordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
        return;
      }

      const { field_values, stage_id, ...rest } = parsed.data;

      // Stage enforcement: if moving to a new stage, check required fields
      if (stage_id) {
        const requiredFields = await db
          .selectFrom('stage_required_fields as srf' as 'stage_required_fields')
          .innerJoin('record_type_fields as rtf' as 'record_type_fields', 'record_type_fields.id' as never, 'stage_required_fields.field_id' as never)
          .select(['stage_required_fields.field_id' as never, 'record_type_fields.label' as never])
          .where('stage_required_fields.stage_id' as never, '=', stage_id)
          .execute() as { field_id: string; label: string }[];

        if (requiredFields.length > 0) {
          const existingValues = await db
            .selectFrom('record_field_values')
            .select(['field_id', 'value'])
            .where('record_id', '=', req.params['id']!)
            .execute();

          const filledFieldIds = new Set(existingValues.map(v => v.field_id));
          // Also count incoming field_values
          if (field_values) {
            for (const k of Object.keys(field_values)) filledFieldIds.add(k);
          }

          const missing = requiredFields.filter(f => !filledFieldIds.has(f.field_id));
          if (missing.length > 0) {
            res.status(422).json({
              data: null,
              error: {
                code: 'REQUIRED_FIELDS_MISSING',
                message: 'Required fields missing for this stage',
                fields: missing.map(f => ({ field_id: f.field_id, label: f.label })),
              },
            });
            return;
          }
        }
      }

      const record = await db
        .updateTable('pipeline_records')
        .set({ ...rest, ...(stage_id ? { stage_id } : {}), updated_at: new Date().toISOString() } as never)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      if (!record) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Record not found' } });
        return;
      }

      // Upsert field values
      if (field_values && Object.keys(field_values).length > 0) {
        await Promise.all(
          Object.entries(field_values).map(([field_id, value]) =>
            db
              .insertInto('record_field_values')
              .values({ record_id: (record as Record<string, unknown>)['id'] as string, field_id, value: JSON.stringify(value) } as never)
              .onConflict(oc => oc.columns(['record_id', 'field_id'] as never).doUpdateSet({ value: JSON.stringify(value) } as never))
              .execute()
          )
        );
      }

      res.json({ data: record, error: null });
    } catch (err) { next(err); }
  });

  // Delete (soft)
  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const deleted = await db
        .updateTable('pipeline_records')
        .set({ deleted_at: new Date().toISOString() } as never)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .returning(['id'])
        .executeTakeFirst();
      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Record not found' } });
        return;
      }
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
