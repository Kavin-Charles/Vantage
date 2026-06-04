import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { generateRecordNumber } from '../lib/auto-number';

const createSchema = z.object({
  record_type_id: z.string().uuid(),
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  name: z.string().min(1),
  owner_id: z.string().uuid(),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  field_values: z.record(z.unknown()).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  stage_id: z.string().uuid().optional(),
  owner_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  field_values: z.record(z.unknown()).optional(),
});

const listSchema = z.object({
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  record_type_id: z.string().uuid().optional(),
  owner_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});

const convertSchema = z.object({
  template_id: z.string().uuid(),
  field_overrides: z.record(z.unknown()).default({}),
});

function ws(req: any) { return (req as AuthenticatedRequest).workspace.id; }
function uid(req: any) { return (req as AuthenticatedRequest).user.id; }
function fail(res: any, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

async function attachFvs(db: Kysely<Database>, records: any[]) {
  if (!records.length) return records;
  const fvs = await db.selectFrom('record_field_values').selectAll()
    .where('record_id', 'in', records.map(r => r.id)).execute();
  const map = new Map<string, typeof fvs>();
  for (const fv of fvs) {
    const arr = map.get(fv.record_id) ?? [];
    arr.push(fv);
    map.set(fv.record_id, arr);
  }
  return records.map(r => ({ ...r, field_values: map.get(r.id) ?? [] }));
}

async function upsertFvs(db: Kysely<Database>, recordId: string, fv: Record<string, unknown>) {
  for (const [fieldId, value] of Object.entries(fv)) {
    await db.insertInto('record_field_values')
      .values({ record_id: recordId, field_id: fieldId, value: JSON.stringify(value) as never })
      .onConflict(oc => oc.columns(['record_id', 'field_id'])
        .doUpdateSet({ value: JSON.stringify(value) as never }))
      .execute();
  }
}

export function createRecordsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('pipelines:view');
  const create = requirePermission('pipelines:create');
  const edit = requirePermission('pipelines:edit');
  const del = requirePermission('pipelines:delete');

  router.get('/', view, async (req, res, next) => {
    try {
      const p = listSchema.safeParse(req.query);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const { page, per_page, pipeline_id, stage_id, record_type_id, owner_id, contact_id, company_id, q } = p.data;
      let query = db.selectFrom('pipeline_records').selectAll()
        .where('workspace_id', '=', ws(req)).where('deleted_at', 'is', null);
      if (pipeline_id) query = query.where('pipeline_id', '=', pipeline_id);
      if (stage_id) query = query.where('stage_id', '=', stage_id);
      if (record_type_id) query = query.where('record_type_id', '=', record_type_id);
      if (owner_id) query = query.where('owner_id', '=', owner_id);
      if (contact_id) query = query.where('contact_id', '=', contact_id);
      if (company_id) query = query.where('company_id', '=', company_id);
      if (q) query = query.where('name', 'like', `%${q}%`);
      const records = await query.orderBy('created_at', 'desc').limit(per_page).offset((page - 1) * per_page).execute();
      res.json({ data: await attachFvs(db, records), page, per_page, error: null });
    } catch (e) { next(e); }
  });

  router.get('/:id', view, async (req, res, next) => {
    try {
      const r = await db.selectFrom('pipeline_records').selectAll()
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req))
        .where('deleted_at', 'is', null).executeTakeFirst();
      if (!r) return fail(res, 404, 'NOT_FOUND', 'Record not found');
      const fvs = await db.selectFrom('record_field_values').selectAll()
        .where('record_id', '=', r.id).execute();
      res.json({ data: { ...r, field_values: fvs }, error: null });
    } catch (e) { next(e); }
  });

  router.post('/', create, async (req, res, next) => {
    try {
      const p = createSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const { field_values, ...data } = p.data;
      const rt = await db.selectFrom('record_types').select('id')
        .where('id', '=', data.record_type_id).where('workspace_id', '=', ws(req)).executeTakeFirst();
      if (!rt) return fail(res, 404, 'NOT_FOUND', 'Record type not found');
      const record_number = await generateRecordNumber(db, data.record_type_id).catch(() => null);
      const record = await db.insertInto('pipeline_records').values({
        workspace_id: ws(req),
        record_number: record_number ?? null,
        contact_id: data.contact_id ?? null,
        company_id: data.company_id ?? null,
        ...data,
      }).returningAll().executeTakeFirstOrThrow();
      if (field_values) await upsertFvs(db, record.id, field_values);
      const fvs = await db.selectFrom('record_field_values').selectAll()
        .where('record_id', '=', record.id).execute();
      res.json({ data: { ...record, field_values: fvs }, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const p = updateSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const { field_values, stage_id, ...rest } = p.data;
      if (stage_id) {
        const required = await db.selectFrom('stage_required_fields as srf')
          .innerJoin('record_type_fields as rtf', 'rtf.id', 'srf.field_id')
          .select(['rtf.id', 'rtf.label']).where('srf.stage_id', '=', stage_id).execute();
        if (required.length > 0) {
          const existing = await db.selectFrom('record_field_values').select('field_id')
            .where('record_id', '=', req.params['id']!).execute();
          const existingIds = new Set(existing.map((e: any) => e.field_id));
          const incomingIds = new Set(Object.keys(field_values ?? {}));
          const missing = required.filter((r: any) => !existingIds.has(r.id) && !incomingIds.has(r.id));
          if (missing.length > 0) {
            return fail(res, 422, 'REQUIRED_FIELDS',
              `Missing required fields: ${missing.map((f: any) => f.label).join(', ')}`);
          }
        }
      }
      const update: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };
      if (stage_id) update['stage_id'] = stage_id;
      const updated = await db.updateTable('pipeline_records').set(update as never)
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req))
        .returningAll().executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Record not found');
      if (field_values) await upsertFvs(db, updated.id, field_values);
      const fvs = await db.selectFrom('record_field_values').selectAll()
        .where('record_id', '=', updated.id).execute();
      res.json({ data: { ...updated, field_values: fvs }, error: null });
    } catch (e) { next(e); }
  });

  router.delete('/:id', del, async (req, res, next) => {
    try {
      const updated = await db.updateTable('pipeline_records')
        .set({ deleted_at: new Date().toISOString() })
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req))
        .where('deleted_at', 'is', null).returningAll().executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Record not found');
      res.json({ data: { id: updated.id }, error: null });
    } catch (e) { next(e); }
  });

  router.post('/:id/convert', create, async (req, res, next) => {
    try {
      const p = convertSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const { template_id, field_overrides } = p.data;
      const source = await db.selectFrom('pipeline_records').selectAll()
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req))
        .where('deleted_at', 'is', null).executeTakeFirst();
      if (!source) return fail(res, 404, 'NOT_FOUND', 'Record not found');
      const template = await db.selectFrom('conversion_templates').selectAll()
        .where('id', '=', template_id).where('workspace_id', '=', ws(req)).executeTakeFirst();
      if (!template) return fail(res, 404, 'NOT_FOUND', 'Conversion template not found');
      const mappings = await db.selectFrom('conversion_field_mappings').selectAll()
        .where('template_id', '=', template_id).execute();
      const sourceFvs = await db.selectFrom('record_field_values').selectAll()
        .where('record_id', '=', source.id).execute();
      const fvMap = new Map(sourceFvs.map((f: any) => [f.field_id, f.value]));
      const builtinMap: Record<string, unknown> = {};
      for (const m of mappings.filter((m: any) => m.source_builtin && m.target_builtin)) {
        builtinMap[(m as any).target_builtin!] = (source as any)[(m as any).source_builtin!];
      }
      const record_number = await generateRecordNumber(db, template.target_type_id).catch(() => null);
      const target = await db.transaction().execute(async (trx: any) => {
        const created = await trx.insertInto('pipeline_records').values({
          workspace_id: ws(req),
          record_type_id: template.target_type_id,
          pipeline_id: template.target_pipeline_id,
          stage_id: template.target_stage_id,
          record_number: record_number ?? null,
          name: String(field_overrides['name'] ?? builtinMap['name'] ?? source.name),
          contact_id: (field_overrides['contact_id'] ?? builtinMap['contact_id'] ?? source.contact_id) as string | null,
          company_id: (field_overrides['company_id'] ?? builtinMap['company_id'] ?? source.company_id) as string | null,
          owner_id: String(field_overrides['owner_id'] ?? builtinMap['owner_id'] ?? source.owner_id),
        }).returningAll().executeTakeFirstOrThrow();
        await trx.insertInto('record_conversions').values({
          source_record_id: source.id,
          target_record_id: created.id,
          template_id,
          converted_by: uid(req),
        }).execute();
        const fvInserts = (mappings as any[])
          .filter(m => m.source_field_id && m.target_field_id)
          .flatMap(m => {
            const val = field_overrides[m.target_field_id] !== undefined
              ? JSON.stringify(field_overrides[m.target_field_id])
              : (fvMap.get(m.source_field_id) as any) ?? null;
            if (val === null) return [];
            return [{ record_id: created.id, field_id: m.target_field_id, value: val as never }];
          });
        if (fvInserts.length > 0) {
          await trx.insertInto('record_field_values').values(fvInserts).execute();
        }
        return created;
      });
      const targetFvs = await db.selectFrom('record_field_values').selectAll()
        .where('record_id', '=', (target as any).id).execute();
      res.json({ data: { source, target: { ...target, field_values: targetFvs } }, error: null });
    } catch (e) { next(e); }
  });

  return router;
}
