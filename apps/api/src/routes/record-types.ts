import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createTypeSchema = z.object({
  name: z.string().min(1),
  icon: z.string().default('📋'),
  color: z.string().default('#6b665c'),
  position: z.number().int().default(0),
  auto_number_enabled: z.boolean().default(false),
  auto_number_prefix: z.string().default(''),
  auto_number_format: z.string().default('PREFIX-YY-NNN'),
});

const updateTypeSchema = createTypeSchema.partial();

const createFieldSchema = z.object({
  label: z.string().min(1),
  field_type: z.enum(['text', 'number', 'date', 'select', 'boolean']),
  options: z.array(z.string()).optional(),
  is_required: z.boolean().default(false),
  position: z.number().int().default(0),
});

const permissionsSchema = z.object({
  admin: z.object({
    can_view: z.boolean(),
    can_create: z.boolean(),
    can_edit: z.boolean(),
    can_delete: z.boolean(),
  }),
  member: z.object({
    can_view: z.boolean(),
    can_create: z.boolean(),
    can_edit: z.boolean(),
    can_delete: z.boolean(),
  }),
});

export function createRecordTypesRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router();

  async function requireRecordTypeOwnership(recordTypeId: string, workspaceId: string): Promise<boolean> {
    const rt = await db
      .selectFrom('record_types')
      .select(['id'])
      .where('id', '=', recordTypeId)
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst();
    return !!rt;
  }

  // List
  router.get('/', requirePermission('pipelines:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const types = await db
        .selectFrom('record_types')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .orderBy('position', 'asc')
        .execute();
      res.json({ data: types, error: null });
    } catch (err) { next(err); }
  });

  // Create
  router.post('/', requirePermission('pipelines:create'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createTypeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
        return;
      }
      const { auto_number_enabled, auto_number_prefix } = parsed.data;
      if (auto_number_enabled && !auto_number_prefix) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'auto_number_prefix required when auto_number_enabled' } });
        return;
      }

      const recordType = await db
        .insertInto('record_types')
        .values({ workspace_id: workspace.id, ...parsed.data })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Insert default permissions
      await db
        .insertInto('record_type_permissions')
        .values([
          { record_type_id: recordType.id, role: 'admin', can_view: true, can_create: true, can_edit: true, can_delete: true },
          { record_type_id: recordType.id, role: 'member', can_view: true, can_create: true, can_edit: true, can_delete: false },
        ])
        .execute();

      res.json({ data: recordType, error: null });
    } catch (err) { next(err); }
  });

  // Update
  router.patch('/:id', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = updateTypeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
        return;
      }
      const updated = await db
        .updateTable('record_types')
        .set({ ...parsed.data, updated_at: new Date().toISOString() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!updated) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Record type not found' } });
        return;
      }
      res.json({ data: updated, error: null });
    } catch (err) { next(err); }
  });

  // Fields — Reorder (must be before /:id/fields/:fieldId to avoid Express treating "reorder" as :fieldId)
  router.patch('/:id/fields/reorder', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const owns = await requireRecordTypeOwnership(req.params['id']!, workspace.id);
      if (!owns) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Record type not found' } });
        return;
      }
      const parsed = z.object({ ids: z.array(z.string()) }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
        return;
      }
      await Promise.all(
        parsed.data.ids.map((fieldId, index) =>
          db
            .updateTable('record_type_fields')
            .set({ position: index })
            .where('id', '=', fieldId)
            .where('record_type_id', '=', req.params['id']!)
            .execute()
        )
      );
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  // Fields — Update
  router.patch('/:id/fields/:fieldId', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const owns = await requireRecordTypeOwnership(req.params['id']!, workspace.id);
      if (!owns) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Record type not found' } });
        return;
      }
      const parsed = createFieldSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
        return;
      }
      const updateData: Record<string, unknown> = { ...parsed.data };
      if (parsed.data.options !== undefined) {
        updateData['options'] = JSON.stringify(parsed.data.options);
      }
      const field = await db
        .updateTable('record_type_fields')
        .set(updateData as never)
        .where('id', '=', req.params['fieldId']!)
        .where('record_type_id', '=', req.params['id']!)
        .returningAll()
        .executeTakeFirst();
      if (!field) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Field not found' } });
        return;
      }
      res.json({ data: field, error: null });
    } catch (err) { next(err); }
  });

  // Delete
  router.delete('/:id', requirePermission('pipelines:delete'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      // Check for existing records
      const countRow = await db
        .selectFrom('pipeline_records')
        .select(db.fn.countAll().as('count'))
        .where('record_type_id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (Number((countRow as Record<string, unknown> | undefined)?.['count'] ?? 0) > 0) {
        res.status(409).json({ data: null, error: { code: 'CONFLICT', message: 'Cannot delete record type with existing records' } });
        return;
      }
      await db
        .deleteFrom('record_types')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .execute();
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  // Fields — List
  router.get('/:id/fields', requirePermission('pipelines:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const owns = await requireRecordTypeOwnership(req.params['id']!, workspace.id);
      if (!owns) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Record type not found' } });
        return;
      }
      const fields = await db
        .selectFrom('record_type_fields')
        .selectAll()
        .where('record_type_id', '=', req.params['id']!)
        .orderBy('position', 'asc')
        .execute();
      res.json({ data: fields, error: null });
    } catch (err) { next(err); }
  });

  // Fields — Create
  router.post('/:id/fields', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const owns = await requireRecordTypeOwnership(req.params['id']!, workspace.id);
      if (!owns) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Record type not found' } });
        return;
      }
      const parsed = createFieldSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
        return;
      }
      const field = await db
        .insertInto('record_type_fields')
        .values({
          record_type_id: req.params['id']!,
          ...parsed.data,
          options: parsed.data.options ? JSON.stringify(parsed.data.options) : null,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow();
      res.json({ data: field, error: null });
    } catch (err) { next(err); }
  });

  // Fields — Delete
  router.delete('/:id/fields/:fieldId', requirePermission('pipelines:delete'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const owns = await requireRecordTypeOwnership(req.params['id']!, workspace.id);
      if (!owns) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Record type not found' } });
        return;
      }
      await db
        .deleteFrom('record_type_fields')
        .where('id', '=', req.params['fieldId']!)
        .where('record_type_id', '=', req.params['id']!)
        .execute();
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  // Permissions — Get
  router.get('/:id/permissions', requirePermission('pipelines:view'), async (req, res, next) => {
    try {
      const perms = await db
        .selectFrom('record_type_permissions')
        .selectAll()
        .where('record_type_id', '=', req.params['id']!)
        .execute();
      res.json({ data: perms, error: null });
    } catch (err) { next(err); }
  });

  // Permissions — Bulk update
  router.put('/:id/permissions', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const parsed = permissionsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
        return;
      }
      for (const role of ['admin', 'member'] as const) {
        await db
          .updateTable('record_type_permissions')
          .set(parsed.data[role])
          .where('record_type_id', '=', req.params['id']!)
          .where('role', '=', role)
          .execute();
      }
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
