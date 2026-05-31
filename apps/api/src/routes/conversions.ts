import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { generateRecordNumber } from '../lib/auto-number';
import { logger } from '../lib/logger';

const BUILTIN_KEYS = new Set(['name', 'contact_id', 'company_id', 'owner_id']);

const fieldMappingSchema = z.object({
  source_field_id: z.string().uuid().optional(),
  source_builtin: z.string().optional(),
  target_field_id: z.string().uuid().optional(),
  target_builtin: z.string().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1),
  source_type_id: z.string().uuid(),
  target_type_id: z.string().uuid(),
  target_pipeline_id: z.string().uuid(),
  target_stage_id: z.string().uuid(),
  position: z.number().int().default(0),
  field_mappings: z.array(fieldMappingSchema).default([]),
});

export function createConversionsRouter(
  db: Kysely<Database>,
  pipelinesGuard?: RequestHandler,
): ExpressRouter {
  const router = Router();

  // List templates
  router.get('/templates', ...(pipelinesGuard ? [pipelinesGuard] : []), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      let q = db
        .selectFrom('conversion_templates')
        .selectAll()
        .where('workspace_id', '=', workspace.id);
      if (req.query['source_type_id']) {
        q = q.where('source_type_id', '=', req.query['source_type_id'] as string);
      }
      const templates = await q.orderBy('position', 'asc').execute();
      res.json({ data: templates, error: null });
    } catch (err) { next(err); }
  });

  // Get single template with enriched field_mappings
  router.get('/templates/:id', ...(pipelinesGuard ? [pipelinesGuard] : []), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const template = await db
        .selectFrom('conversion_templates')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!template) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Template not found' } });
        return;
      }
      const mappings = await db
        .selectFrom('conversion_field_mappings')
        .selectAll()
        .where('template_id', '=', req.params['id']!)
        .execute();

      const fieldIds = [
        ...mappings.map(m => m.source_field_id),
        ...mappings.map(m => m.target_field_id),
      ].filter((id): id is string => id !== null);

      const fields = fieldIds.length > 0
        ? await db
          .selectFrom('record_type_fields')
          .select(['id', 'label', 'field_type', 'options', 'is_required'])
          .where('id', 'in', fieldIds)
          .execute()
        : [];
      const fieldMap = new Map(fields.map(f => [f.id, f]));

      const enrichedMappings = mappings.map(m => ({
        ...m,
        source_field_label: m.source_field_id ? (fieldMap.get(m.source_field_id)?.label ?? null) : null,
        target_field_label: m.target_field_id ? (fieldMap.get(m.target_field_id)?.label ?? null) : null,
        target_field_type: m.target_field_id ? (fieldMap.get(m.target_field_id)?.field_type ?? null) : null,
        target_field_options: m.target_field_id ? (fieldMap.get(m.target_field_id)?.options ?? null) : null,
        target_field_required: m.target_field_id ? (fieldMap.get(m.target_field_id)?.is_required ?? false) : false,
      }));

      res.json({ data: { ...template, field_mappings: enrichedMappings }, error: null });
    } catch (err) { next(err); }
  });

  // Create template
  router.post('/templates', ...(pipelinesGuard ? [pipelinesGuard] : []), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
        return;
      }
      const { field_mappings, ...templateData } = parsed.data;

      const template = await db
        .insertInto('conversion_templates')
        .values({ workspace_id: workspace.id, ...templateData })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (field_mappings.length > 0) {
        await db
          .insertInto('conversion_field_mappings')
          .values(
            field_mappings.map(m => ({
              template_id: template.id,
              source_field_id: m.source_field_id ?? null,
              source_builtin: m.source_builtin ?? null,
              target_field_id: m.target_field_id ?? null,
              target_builtin: m.target_builtin ?? null,
            })),
          )
          .execute();
      }

      res.json({ data: template, error: null });
    } catch (err) { next(err); }
  });

  // Update template
  router.patch('/templates/:id', ...(pipelinesGuard ? [pipelinesGuard] : []), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createTemplateSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
        return;
      }
      const { field_mappings, ...templateData } = parsed.data;

      const updated = await db
        .updateTable('conversion_templates')
        .set(templateData as never)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!updated) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Template not found' } });
        return;
      }

      if (field_mappings !== undefined) {
        await db
          .deleteFrom('conversion_field_mappings')
          .where('template_id', '=', req.params['id']!)
          .execute();
        if (field_mappings.length > 0) {
          await db
            .insertInto('conversion_field_mappings')
            .values(
              field_mappings.map(m => ({
                template_id: req.params['id']!,
                source_field_id: m.source_field_id ?? null,
                source_builtin: m.source_builtin ?? null,
                target_field_id: m.target_field_id ?? null,
                target_builtin: m.target_builtin ?? null,
              })),
            )
            .execute();
        }
      }
      res.json({ data: updated, error: null });
    } catch (err) { next(err); }
  });

  // Delete template
  router.delete('/templates/:id', ...(pipelinesGuard ? [pipelinesGuard] : []), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const result = await db
        .deleteFrom('conversion_templates')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!result || result.numDeletedRows === 0n) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Template not found' } });
        return;
      }
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  // Execute conversion
  router.post('/records/:id/convert', ...(pipelinesGuard ? [pipelinesGuard] : []), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const bodyParsed = z.object({
        template_id: z.string().uuid(),
        field_overrides: z.record(
          z.union([z.enum(['name', 'contact_id', 'company_id', 'owner_id']), z.string().uuid()]),
          z.unknown(),
        ).optional(),
      }).safeParse(req.body);
      if (!bodyParsed.success) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: bodyParsed.error.message } });
        return;
      }
      const { template_id, field_overrides = {} } = bodyParsed.data;

      // Load source record
      const sourceRecord = await db
        .selectFrom('pipeline_records')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!sourceRecord) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Record not found' } });
        return;
      }

      // Load template (workspace scoped)
      const template = await db
        .selectFrom('conversion_templates')
        .selectAll()
        .where('id', '=', template_id)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!template) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Template not found' } });
        return;
      }

      // Load field mappings
      const mappings = await db
        .selectFrom('conversion_field_mappings')
        .selectAll()
        .where('template_id', '=', template_id)
        .execute();

      // Load source field values
      const sourceValues = await db
        .selectFrom('record_field_values')
        .selectAll()
        .where('record_id', '=', sourceRecord.id)
        .execute();
      const sourceValueMap = new Map(sourceValues.map(v => [v.field_id, v.value]));

      // Apply builtin mappings
      const builtins: Record<string, unknown> = {};
      for (const m of mappings) {
        if (!m.source_builtin) continue;
        const sourceVal = (sourceRecord as Record<string, unknown>)[m.source_builtin];
        if (m.target_builtin) builtins[m.target_builtin] = sourceVal;
      }

      // Auto-number for target type
      const record_number = await generateRecordNumber(db, template.target_type_id).catch((err: unknown) => {
        logger.error({ err }, '[conversions] auto-number generation failed');
        return null;
      });

      // Build field value inserts shape (record_id filled after target created)
      const fieldMappingsToCopy = mappings.filter(m => m.source_field_id && m.target_field_id);

      // Wrap writes in a transaction for atomicity
      const targetRecord = await db.transaction().execute(async (trx) => {
        const created = await trx
          .insertInto('pipeline_records')
          .values({
            workspace_id: workspace.id,
            record_type_id: template.target_type_id,
            pipeline_id: template.target_pipeline_id,
            stage_id: template.target_stage_id,
            record_number: record_number ?? null,
            name: (field_overrides['name'] as string | undefined) ?? (builtins['name'] as string | undefined) ?? sourceRecord.name,
            contact_id: (field_overrides['contact_id'] as string | undefined) ?? (builtins['contact_id'] as string | undefined) ?? sourceRecord.contact_id ?? null,
            company_id: (field_overrides['company_id'] as string | undefined) ?? (builtins['company_id'] as string | undefined) ?? sourceRecord.company_id ?? null,
            owner_id: (field_overrides['owner_id'] as string | undefined) ?? (builtins['owner_id'] as string | undefined) ?? sourceRecord.owner_id,
          } as never)
          .returningAll()
          .executeTakeFirstOrThrow();

        const fieldValueInserts: { record_id: string; field_id: string; value: unknown }[] = [];
        for (const m of fieldMappingsToCopy) {
          const val = sourceValueMap.get(m.source_field_id!);
          if (val !== undefined) {
            fieldValueInserts.push({ record_id: created.id, field_id: m.target_field_id!, value: val });
          }
        }
        // Apply custom field_overrides (user-edited values take precedence over template mappings)
        for (const [key, val] of Object.entries(field_overrides)) {
          if (!BUILTIN_KEYS.has(key) && val !== undefined && val !== null) {
            const idx = fieldValueInserts.findIndex(i => i.field_id === key);
            const serialised = typeof val === 'string' ? val : JSON.stringify(val);
            if (idx >= 0) {
              fieldValueInserts[idx] = { record_id: created.id, field_id: key, value: serialised };
            } else {
              fieldValueInserts.push({ record_id: created.id, field_id: key, value: serialised });
            }
          }
        }
        if (fieldValueInserts.length > 0) {
          await trx.insertInto('record_field_values').values(fieldValueInserts as never).execute();
        }

        await trx
          .insertInto('record_conversions')
          .values({
            source_record_id: sourceRecord.id,
            target_record_id: created.id,
            template_id,
            converted_by: user.id,
          } as never)
          .execute();

        return created;
      });

      res.json({ data: { record_id: targetRecord.id }, error: null });
    } catch (err) { next(err); }
  });

  // Conversion audit for a record
  router.get('/records/:id/conversions', ...(pipelinesGuard ? [pipelinesGuard] : []), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const record = await db
        .selectFrom('pipeline_records')
        .select(['id'])
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!record) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Record not found' } });
        return;
      }
      const conversions = await db
        .selectFrom('record_conversions')
        .selectAll()
        .where(eb => eb.or([
          eb('source_record_id', '=', req.params['id']!),
          eb('target_record_id', '=', req.params['id']!),
        ]))
        .orderBy('converted_at', 'desc')
        .execute();

      const allIds = [
        ...conversions.map(c => c.source_record_id),
        ...conversions.map(c => c.target_record_id),
      ].filter((id, idx, arr) => arr.indexOf(id) === idx);

      const relatedRecords = allIds.length > 0
        ? await db
          .selectFrom('pipeline_records')
          .select(['id', 'name', 'record_number'])
          .where('id', 'in', allIds)
          .execute()
        : [];
      const recordMap = new Map(relatedRecords.map(r => [r.id, r]));

      const enriched = conversions.map(c => ({
        ...c,
        source_record_name: recordMap.get(c.source_record_id)?.name ?? null,
        source_record_number: recordMap.get(c.source_record_id)?.record_number ?? null,
        target_record_name: recordMap.get(c.target_record_id)?.name ?? null,
        target_record_number: recordMap.get(c.target_record_id)?.record_number ?? null,
      }));

      res.json({ data: enriched, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
