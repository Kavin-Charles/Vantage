import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createDealSchema = z.object({
  name: z.string().min(1),
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  value: z.number().min(0).default(0),
  probability: z.number().int().min(0).max(100).default(0),
  close_date: z.string().optional(),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  field_values: z.record(z.string()).optional(),
});

const updateDealSchema = z.object({
  name: z.string().min(1).optional(),
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  value: z.number().min(0).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  close_date: z.string().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  // Custom field values: { [fieldId]: string }
  field_values: z.record(z.string().uuid(), z.string()).optional(),
});

async function getDealWithFields(db: Kysely<Database>, dealId: string, workspaceId: string) {
  const deal = await db
    .selectFrom('deals')
    .where('id', '=', dealId)
    .where('workspace_id', '=', workspaceId)
    .where('deleted_at', 'is', null)
    .selectAll()
    .executeTakeFirst();

  if (!deal) return null;

  const fieldValues = await db
    .selectFrom('deal_field_values as dfv')
    .innerJoin('stage_fields as sf', 'sf.id', 'dfv.field_id')
    .where('dfv.deal_id', '=', dealId)
    .select(['dfv.field_id', 'dfv.value', 'sf.name', 'sf.field_type'])
    .execute();

  return {
    ...deal,
    field_values: Object.fromEntries(
      fieldValues.map(fv => [fv.field_id, { name: fv.name, field_type: fv.field_type, value: fv.value }])
    ),
  };
}

export function createDealsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/deals?pipeline_id=<id>
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const pipeline_id = req.query['pipeline_id'] as string | undefined;
      const stage_id = req.query['stage_id'] as string | undefined;
      const owner_id = req.query['owner_id'] as string | undefined;
      const page = Number(req.query['page'] ?? 1);
      const per_page = Math.min(Number(req.query['per_page'] ?? 50), 100);

      if (!pipeline_id) {
        res.status(400).json({ data: null, error: { code: 'PIPELINE_REQUIRED', message: 'pipeline_id is required' } });
        return;
      }

      let query = db
        .selectFrom('deals')
        .where('workspace_id', '=', workspace.id)
        .where('pipeline_id', '=', pipeline_id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (stage_id) query = query.where('stage_id', '=', stage_id);
      if (owner_id) query = query.where('owner_id', '=', owner_id);

      const deals = await query.execute();
      res.json({ data: deals, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/deals/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const deal = await getDealWithFields(db, req.params['id']!, workspace.id);
      if (!deal) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      res.json({ data: deal, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/deals
  router.post('/', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const parsed = createDealSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
        return;
      }

      const deal = await db
        .insertInto('deals')
        .values({
          workspace_id: workspace.id,
          owner_id: user.id,
          pipeline_id: parsed.data.pipeline_id,
          stage_id: parsed.data.stage_id,
          name: parsed.data.name,
          value: parsed.data.value,
          probability: parsed.data.probability,
          close_date: parsed.data.close_date ? new Date(parsed.data.close_date) : null,
          contact_id: parsed.data.contact_id ?? null,
          company_id: parsed.data.company_id ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Save field values if provided
      if (parsed.data.field_values && Object.keys(parsed.data.field_values).length > 0) {
        await Promise.all(
          Object.entries(parsed.data.field_values).map(([fieldId, value]) =>
            db
              .insertInto('deal_field_values')
              .values({ deal_id: deal.id, field_id: fieldId, value })
              .onConflict(oc =>
                oc.columns(['deal_id', 'field_id']).doUpdateSet({ value, updated_at: new Date() })
              )
              .execute()
          )
        );
      }

      res.status(201).json({ data: deal, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/deals/:id
  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = updateDealSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }

      // If moving to a new stage, check required fields on won/lost stages
      if (parsed.data.stage_id) {
        const targetStage = await db
          .selectFrom('pipeline_stages')
          .where('id', '=', parsed.data.stage_id)
          .selectAll()
          .executeTakeFirst();

        if (targetStage && (targetStage.is_won || targetStage.is_lost)) {
          const requiredFields = await db
            .selectFrom('stage_fields')
            .where('stage_id', '=', parsed.data.stage_id)
            .where('is_required', '=', true)
            .select(['id', 'name'])
            .execute();

          if (requiredFields.length > 0) {
            const providedFieldIds = new Set(Object.keys(parsed.data.field_values ?? {}));
            // Also check existing field values in DB
            const existingValues = await db
              .selectFrom('deal_field_values')
              .where('deal_id', '=', req.params['id']!)
              .where('field_id', 'in', requiredFields.map(f => f.id))
              .select(['field_id'])
              .execute();
            const existingIds = new Set(existingValues.map(v => v.field_id));

            const missing = requiredFields.filter(
              f => !providedFieldIds.has(f.id) && !existingIds.has(f.id)
            );
            if (missing.length > 0) {
              res.status(400).json({
                data: null,
                error: {
                  code: 'REQUIRED_FIELDS_MISSING',
                  message: `Required fields missing: ${missing.map(f => f.name).join(', ')}`,
                },
              });
              return;
            }
          }
        }
      }

      const { field_values, ...dealData } = parsed.data;

      // Only pass defined deal fields to update
      const updatePayload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(dealData)) {
        if (v !== undefined) updatePayload[k] = v;
      }

      if (Object.keys(updatePayload).length > 0) {
        await db
          .updateTable('deals')
          .set(updatePayload as never)
          .where('id', '=', req.params['id']!)
          .where('workspace_id', '=', workspace.id)
          .execute();
      }

      // Upsert field values
      if (field_values && Object.keys(field_values).length > 0) {
        await Promise.all(
          Object.entries(field_values).map(([fieldId, value]) =>
            db
              .insertInto('deal_field_values')
              .values({ deal_id: req.params['id']!, field_id: fieldId, value })
              .onConflict(oc =>
                oc.columns(['deal_id', 'field_id']).doUpdateSet({ value, updated_at: new Date() })
              )
              .execute()
          )
        );
      }

      const deal = await getDealWithFields(db, req.params['id']!, workspace.id);
      res.json({ data: deal, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/deals/:id (soft delete)
  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      await db
        .updateTable('deals')
        .set({ deleted_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .execute();
      res.json({ data: null, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
