import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createTypeSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
  description: z.string().optional(),
  auto_number_enabled: z.boolean().default(false),
  auto_number_prefix: z.string().optional(),
  auto_number_format: z.string().default('PREFIX-YY-NNN'),
  position: z.number().int().default(0),
});
const updateTypeSchema = createTypeSchema.partial();

const createFieldSchema = z.object({
  label: z.string().min(1),
  field_type: z.enum(['text', 'number', 'date', 'select', 'boolean']),
  is_required: z.boolean().default(false),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  position: z.number().int().default(0),
});
const updateFieldSchema = createFieldSchema.omit({ field_type: true }).partial();
const reorderSchema = z.object({ ids: z.array(z.string().uuid()) });

const createConversionSchema = z.object({
  name: z.string().min(1),
  target_type_id: z.string().uuid(),
  target_pipeline_id: z.string().uuid(),
  target_stage_id: z.string().uuid(),
  position: z.number().int().default(0),
  field_mappings: z.array(z.object({
    source_field_id: z.string().uuid().optional(),
    source_builtin: z.enum(['name', 'contact_id', 'company_id', 'owner_id']).optional(),
    target_field_id: z.string().uuid().optional(),
    target_builtin: z.enum(['name', 'contact_id', 'company_id', 'owner_id']).optional(),
  })).default([]),
});

function ws(req: any) { return (req as AuthenticatedRequest).workspace.id; }
function fail(res: any, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createRecordTypesRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('pipelines:view');
  const edit = requirePermission('pipelines:edit');
  const create = requirePermission('pipelines:create');
  const del = requirePermission('pipelines:delete');

  // List
  router.get('/', view, async (req, res, next) => {
    try {
      const data = await db.selectFrom('record_types').selectAll()
        .where('workspace_id', '=', ws(req)).orderBy('position', 'asc').execute();
      res.json({ data, error: null });
    } catch (e) { next(e); }
  });

  // Create
  router.post('/', create, async (req, res, next) => {
    try {
      const p = createTypeSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      if (p.data.auto_number_enabled && !p.data.auto_number_prefix)
        return fail(res, 400, 'VALIDATION_ERROR', 'auto_number_prefix required when auto_number_enabled');
      const rt = await db.insertInto('record_types')
        .values({ workspace_id: ws(req), ...p.data }).returningAll().executeTakeFirstOrThrow();
      await db.insertInto('record_type_permissions').values([
        { record_type_id: rt.id, role: 'admin', can_view: true, can_create: true, can_edit: true, can_delete: true },
        { record_type_id: rt.id, role: 'member', can_view: true, can_create: true, can_edit: true, can_delete: false },
      ]).execute();
      res.json({ data: rt, error: null });
    } catch (e) { next(e); }
  });

  // Update
  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const p = updateTypeSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const updated = await db.updateTable('record_types')
        .set({ ...p.data, updated_at: new Date().toISOString() })
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req))
        .returningAll().executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Record type not found');
      res.json({ data: updated, error: null });
    } catch (e) { next(e); }
  });

  // Delete
  router.delete('/:id', del, async (req, res, next) => {
    try {
      const c = await db.selectFrom('pipeline_records').select(db.fn.countAll<number>().as('n'))
        .where('record_type_id', '=', req.params['id']!).where('deleted_at', 'is', null)
        .executeTakeFirstOrThrow();
      if (Number(c.n) > 0) return fail(res, 409, 'CONFLICT', 'Record type has active records');
      await db.deleteFrom('record_types')
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req)).execute();
      res.json({ data: { id: req.params['id'] }, error: null });
    } catch (e) { next(e); }
  });

  // --- Fields ---

  router.get('/:id/fields', view, async (req, res, next) => {
    try {
      const data = await db.selectFrom('record_type_fields').selectAll()
        .where('record_type_id', '=', req.params['id']!).orderBy('position', 'asc').execute();
      res.json({ data, error: null });
    } catch (e) { next(e); }
  });

  router.post('/:id/fields', edit, async (req, res, next) => {
    try {
      const p = createFieldSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const rt = await db.selectFrom('record_types').select('id')
        .where('id', '=', req.params['id']!).where('workspace_id', '=', ws(req)).executeTakeFirst();
      if (!rt) return fail(res, 404, 'NOT_FOUND', 'Record type not found');
      const field = await db.insertInto('record_type_fields')
        .values({ record_type_id: req.params['id']!, ...p.data }).returningAll().executeTakeFirstOrThrow();
      res.json({ data: field, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:id/fields/reorder', edit, async (req, res, next) => {
    try {
      const p = reorderSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      await Promise.all(p.data.ids.map((fid, i) =>
        db.updateTable('record_type_fields').set({ position: i })
          .where('id', '=', fid).where('record_type_id', '=', req.params['id']!).execute()
      ));
      res.json({ data: { ids: p.data.ids }, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:id/fields/:fid', edit, async (req, res, next) => {
    try {
      const p = updateFieldSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const updated = await db.updateTable('record_type_fields').set(p.data as never)
        .where('id', '=', req.params['fid']!).where('record_type_id', '=', req.params['id']!)
        .returningAll().executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Field not found');
      res.json({ data: updated, error: null });
    } catch (e) { next(e); }
  });

  router.delete('/:id/fields/:fid', edit, async (req, res, next) => {
    try {
      await db.deleteFrom('record_field_values').where('field_id', '=', req.params['fid']!).execute();
      await db.deleteFrom('record_type_fields')
        .where('id', '=', req.params['fid']!).where('record_type_id', '=', req.params['id']!).execute();
      res.json({ data: { id: req.params['fid'] }, error: null });
    } catch (e) { next(e); }
  });

  // --- Conversions ---

  router.get('/:id/conversions', view, async (req, res, next) => {
    try {
      const templates = await db.selectFrom('conversion_templates').selectAll()
        .where('source_type_id', '=', req.params['id']!).where('workspace_id', '=', ws(req))
        .orderBy('position', 'asc').execute();
      const data = await Promise.all(templates.map(async t => {
        const field_mappings = await db.selectFrom('conversion_field_mappings').selectAll()
          .where('template_id', '=', t.id).execute();
        return { ...t, field_mappings };
      }));
      res.json({ data, error: null });
    } catch (e) { next(e); }
  });

  router.post('/:id/conversions', edit, async (req, res, next) => {
    try {
      const p = createConversionSchema.safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const { field_mappings, ...tData } = p.data;
      const tpl = await db.insertInto('conversion_templates')
        .values({ workspace_id: ws(req), source_type_id: req.params['id']!, ...tData })
        .returningAll().executeTakeFirstOrThrow();
      if (field_mappings.length > 0) {
        await db.insertInto('conversion_field_mappings').values(
          field_mappings.map(m => ({
            template_id: tpl.id,
            source_field_id: m.source_field_id ?? null,
            source_builtin: m.source_builtin ?? null,
            target_field_id: m.target_field_id ?? null,
            target_builtin: m.target_builtin ?? null,
          }))
        ).execute();
      }
      res.json({ data: { ...tpl, field_mappings }, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:id/conversions/:tid', edit, async (req, res, next) => {
    try {
      const p = createConversionSchema.partial().safeParse(req.body);
      if (!p.success) return fail(res, 400, 'VALIDATION_ERROR', p.error.message);
      const { field_mappings, ...tData } = p.data;
      const updated = await db.updateTable('conversion_templates').set(tData as never)
        .where('id', '=', req.params['tid']!).where('workspace_id', '=', ws(req))
        .returningAll().executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Template not found');
      if (field_mappings !== undefined) {
        await db.deleteFrom('conversion_field_mappings')
          .where('template_id', '=', req.params['tid']!).execute();
        if (field_mappings.length > 0) {
          await db.insertInto('conversion_field_mappings').values(
            field_mappings.map(m => ({
              template_id: req.params['tid']!,
              source_field_id: m.source_field_id ?? null,
              source_builtin: m.source_builtin ?? null,
              target_field_id: m.target_field_id ?? null,
              target_builtin: m.target_builtin ?? null,
            }))
          ).execute();
        }
      }
      res.json({ data: updated, error: null });
    } catch (e) { next(e); }
  });

  router.delete('/:id/conversions/:tid', edit, async (req, res, next) => {
    try {
      await db.deleteFrom('conversion_field_mappings')
        .where('template_id', '=', req.params['tid']!).execute();
      await db.deleteFrom('conversion_templates')
        .where('id', '=', req.params['tid']!).where('workspace_id', '=', ws(req)).execute();
      res.json({ data: { id: req.params['tid'] }, error: null });
    } catch (e) { next(e); }
  });

  return router;
}
