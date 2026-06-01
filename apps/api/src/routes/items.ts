// apps/api/src/routes/items.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { queueWebhook } from '../lib/queue-webhook';

const createItemSchema = z.object({
  group_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  title: z.string().min(1),
  value: z.number().min(0).optional(),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  field_values: z.record(z.string()).optional(),
});

const updateItemSchema = z.object({
  title: z.string().min(1).optional(),
  stage_id: z.string().uuid().optional(),
  value: z.number().min(0).nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  field_values: z.record(z.string()).optional(),
});

const convertSchema = z.object({
  target_group_id: z.string().uuid(),
});

export function createItemsRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router();

  // GET / — list items for a group with field_values
  router.get('/', requirePermission('pipelines:view'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      const groupId = req.query['group_id'] as string | undefined;
      if (!groupId) {
        res.status(400).json({ data: null, error: { code: 'MISSING_PARAM', message: 'group_id required' } });
        return;
      }

      // Verify group belongs to workspace
      const group = await db
        .selectFrom('item_groups')
        .where('id', '=', groupId)
        .where('workspace_id', '=', auth.workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!group) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Item group not found' } });
        return;
      }

      const items = await db
        .selectFrom('items')
        .where('group_id', '=', groupId)
        .where('deleted_at', 'is', null)
        .selectAll()
        .orderBy('created_at', 'asc')
        .execute();

      if (items.length === 0) {
        res.json({ data: [], error: null });
        return;
      }

      const fieldValues = await db
        .selectFrom('item_field_values')
        .where('item_id', 'in', items.map(i => i.id))
        .select(['item_id', 'field_id', 'value'])
        .execute();

      const fvByItem = new Map<string, Record<string, string>>();
      for (const fv of fieldValues) {
        const map = fvByItem.get(fv.item_id) ?? {};
        map[fv.field_id] = fv.value;
        fvByItem.set(fv.item_id, map);
      }

      const data = items.map(i => ({ ...i, field_values: fvByItem.get(i.id) ?? {} }));
      res.json({ data, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST / — create item
  router.post('/', requirePermission('pipelines:create'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      const parsed = createItemSchema.parse(req.body);

      // Verify group belongs to workspace
      const group = await db
        .selectFrom('item_groups')
        .where('id', '=', parsed.group_id)
        .where('workspace_id', '=', auth.workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!group) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Item group not found' } });
        return;
      }

      // Verify stage belongs to group
      const stage = await db
        .selectFrom('group_stages')
        .where('id', '=', parsed.stage_id)
        .where('group_id', '=', parsed.group_id)
        .select('id')
        .executeTakeFirst();
      if (!stage) {
        res.status(400).json({ data: null, error: { code: 'INVALID_STAGE', message: 'Stage not in group' } });
        return;
      }

      const item = await db
        .insertInto('items')
        .values({
          workspace_id: auth.workspace.id,
          group_id: parsed.group_id,
          stage_id: parsed.stage_id,
          title: parsed.title,
          value: parsed.value ?? null,
          owner_id: auth.user.id,
          contact_id: parsed.contact_id ?? null,
          company_id: parsed.company_id ?? null,
          converted_from_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Save field values if provided
      if (parsed.field_values) {
        for (const [fieldId, value] of Object.entries(parsed.field_values)) {
          await db
            .insertInto('item_field_values')
            .values({ item_id: item.id, field_id: fieldId, value })
            .onConflict(oc =>
              oc.columns(['item_id', 'field_id']).doUpdateSet({ value, updated_at: new Date() }),
            )
            .execute();
        }
      }

      res.status(201).json({ data: item, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id — update item
  router.patch('/:id', requirePermission('pipelines:edit'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      const parsed = updateItemSchema.parse(req.body);

      const existing = await db
        .selectFrom('items')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .where('deleted_at', 'is', null)
        .select(['id', 'group_id'])
        .executeTakeFirst();
      if (!existing) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Item not found' } });
        return;
      }

      if (parsed.stage_id) {
        const stage = await db
          .selectFrom('group_stages')
          .where('id', '=', parsed.stage_id)
          .where('group_id', '=', existing.group_id)
          .select('id')
          .executeTakeFirst();
        if (!stage) {
          res.status(400).json({ data: null, error: { code: 'INVALID_STAGE', message: 'Stage not in group' } });
          return;
        }
      }

      const updateVals: Record<string, unknown> = { updated_at: new Date() };
      if (parsed.title !== undefined) updateVals['title'] = parsed.title;
      if (parsed.stage_id !== undefined) updateVals['stage_id'] = parsed.stage_id;
      if (parsed.value !== undefined) updateVals['value'] = parsed.value;
      if (parsed.contact_id !== undefined) updateVals['contact_id'] = parsed.contact_id;
      if (parsed.company_id !== undefined) updateVals['company_id'] = parsed.company_id;

      const item = await db
        .updateTable('items')
        .set(updateVals as never)
        .where('id', '=', req.params['id']!)
        .returningAll()
        .executeTakeFirstOrThrow();

      // Upsert field values
      if (parsed.field_values) {
        for (const [fieldId, value] of Object.entries(parsed.field_values)) {
          await db
            .insertInto('item_field_values')
            .values({ item_id: item.id, field_id: fieldId, value })
            .onConflict(oc =>
              oc.columns(['item_id', 'field_id']).doUpdateSet({ value, updated_at: new Date() }),
            )
            .execute();
        }
      }

      res.json({ data: item, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:id — soft delete
  router.delete('/:id', requirePermission('pipelines:delete'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;

      const existing = await db
        .selectFrom('items')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .where('deleted_at', 'is', null)
        .select('id')
        .executeTakeFirst();
      if (!existing) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Item not found' } });
        return;
      }

      await db
        .updateTable('items')
        .set({ deleted_at: new Date(), updated_at: new Date() })
        .where('id', '=', req.params['id']!)
        .execute();

      res.json({ data: { id: req.params['id'] }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /:id/convert — convert item to another group
  router.post('/:id/convert', requirePermission('pipelines:create'), async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      const parsed = convertSchema.parse(req.body);

      const source = await db
        .selectFrom('items')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .executeTakeFirst();
      if (!source) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Item not found' } });
        return;
      }

      // Target group must be in the same pipeline
      const sourceGroup = await db
        .selectFrom('item_groups')
        .where('id', '=', source.group_id)
        .select(['pipeline_id'])
        .executeTakeFirstOrThrow();

      const targetGroup = await db
        .selectFrom('item_groups')
        .where('id', '=', parsed.target_group_id)
        .where('workspace_id', '=', auth.workspace.id)
        .where('pipeline_id', '=', sourceGroup.pipeline_id)
        .select(['id', 'name'])
        .executeTakeFirst();
      if (!targetGroup) {
        res.status(400).json({ data: null, error: { code: 'INVALID_GROUP', message: 'Target group not in same pipeline' } });
        return;
      }

      // First stage of target group
      const firstStage = await db
        .selectFrom('group_stages')
        .where('group_id', '=', parsed.target_group_id)
        .orderBy('position', 'asc')
        .select('id')
        .executeTakeFirst();
      if (!firstStage) {
        res.status(400).json({ data: null, error: { code: 'NO_STAGES', message: 'Target group has no stages' } });
        return;
      }

      const newItem = await db
        .insertInto('items')
        .values({
          workspace_id: auth.workspace.id,
          group_id: parsed.target_group_id,
          stage_id: firstStage.id,
          title: source.title,
          value: source.value,
          owner_id: source.owner_id,
          contact_id: source.contact_id,
          company_id: source.company_id,
          converted_from_id: source.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: newItem, error: null });

      queueWebhook(db, auth.workspace.id, 'item.moved', {
        item_id: newItem.id,
        item_name: source.title,
        old_group_id: source.group_id,
        new_group_id: parsed.target_group_id,
        new_group_name: targetGroup.name,
        workspace_id: auth.workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
