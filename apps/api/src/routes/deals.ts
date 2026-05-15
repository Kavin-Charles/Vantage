import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { toCSV } from '../lib/csv';
import { logger } from '../lib/logger';
import { queueWebhook } from '../lib/queue-webhook';
import { logActivity } from '../lib/log-activity';
const DEAL_HEADERS = ['name', 'value', 'probability', 'close_date'];

const importDealSchema = z.object({
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  rows: z.array(z.object({
    name: z.string().min(1),
    value: z.coerce.number().min(0).default(0),
    probability: z.coerce.number().int().min(0).max(100).default(0),
    close_date: z.string().optional(),
  })).min(1),
});

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

  // GET /export?pipeline_id=<id>
  router.get('/export', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const pipeline_id = req.query['pipeline_id'] as string | undefined;
      if (!pipeline_id) {
        res.status(400).json({ data: null, error: { code: 'PIPELINE_REQUIRED', message: 'pipeline_id required' } });
        return;
      }
      const deals = await db
        .selectFrom('deals')
        .where('workspace_id', '=', workspace.id)
        .where('pipeline_id', '=', pipeline_id)
        .where('deleted_at', 'is', null)
        .select(['name', 'value', 'probability', 'close_date'])
        .orderBy('created_at', 'desc')
        .execute();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="items.csv"');
      res.send(toCSV(DEAL_HEADERS, deals));
    } catch (err) { next(err); }
  });

  // POST /import
  router.post('/import', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;

      const outerParsed = z.object({
        pipeline_id: z.string().min(1),
        stage_id: z.string().min(1),
        rows: z.array(z.unknown()).min(1),
      }).safeParse(req.body);

      if (!outerParsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: outerParsed.error.message } });
        return;
      }

      const { pipeline_id, stage_id } = outerParsed.data;

      // Verify pipeline belongs to workspace
      const pipeline = await db.selectFrom('pipelines')
        .where('id', '=', pipeline_id).where('workspace_id', '=', workspace.id)
        .select('id').executeTakeFirst();
      if (!pipeline) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Pipeline not found' } });
        return;
      }

      const rowSchema = z.object({
        name: z.string().min(1),
        value: z.coerce.number().min(0).default(0),
        probability: z.coerce.number().int().min(0).max(100).default(0),
        close_date: z.string().optional(),
      });

      type ValidRow = { name: string; value: number; probability: number; close_date?: string };
      const validRows: ValidRow[] = [];
      const errors: string[] = [];

      for (const raw of outerParsed.data.rows) {
        const parsed = rowSchema.safeParse(raw);
        if (parsed.success) {
          validRows.push(parsed.data);
        } else {
          const name = (raw as { name?: string }).name ?? '(unknown)';
          errors.push(`${name}: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
        }
      }

      let created = 0;
      if (validRows.length > 0) {
        const result = await db.insertInto('deals').values(
          validRows.map(row => ({
            workspace_id: workspace.id,
            owner_id: user.id,
            pipeline_id,
            stage_id,
            name: row.name,
            value: row.value,
            probability: row.probability,
            close_date: row.close_date ? new Date(row.close_date) : null,
            contact_id: null,
            company_id: null,
          })),
        ).execute();
        created = result.numInsertedOrUpdatedRows ? Number(result.numInsertedOrUpdatedRows) : validRows.length;
      }

      res.json({ data: { created, errors }, error: null });
    } catch (err) { next(err); }
  });

const dealsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
  stage_id: z.string().uuid().optional(),
  owner_id: z.string().uuid().optional(),
  q: z.string().optional(),
});

  // GET /api/deals?pipeline_id=<id>
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const pipeline_id = req.query['pipeline_id'] as string | undefined;

      if (!pipeline_id) {
        res.status(400).json({ data: null, error: { code: 'PIPELINE_REQUIRED', message: 'pipeline_id is required' } });
        return;
      }

      const parsed = dealsListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, stage_id, owner_id, q } = parsed.data;

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
      if (q) query = query.where('name', 'ilike', `%${q}%`);

      const deals = await query.execute();

      let countQuery = db
        .selectFrom('deals')
        .where('workspace_id', '=', workspace.id)
        .where('pipeline_id', '=', pipeline_id)
        .where('deleted_at', 'is', null)
        .select(db.fn.countAll<number>().as('count'));

      if (stage_id) countQuery = countQuery.where('stage_id', '=', stage_id);
      if (owner_id) countQuery = countQuery.where('owner_id', '=', owner_id);
      if (q) countQuery = countQuery.where('name', 'ilike', `%${q}%`);

      const { count } = await countQuery.executeTakeFirstOrThrow();

      res.json({ data: deals, total: Number(count), page, per_page, error: null });
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

      // Read current deal to detect stage change for webhooks
      const currentDeal = await db
        .selectFrom('deals')
        .select(['stage_id', 'name', 'value', 'owner_id'])
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

      // If moving to a new stage, check required fields on won/lost stages
      let targetStage: { id: string; name: string; color: string; position: number; is_won: boolean; is_lost: boolean; pipeline_id: string } | undefined;
      if (parsed.data.stage_id) {
        targetStage = await db
          .selectFrom('pipeline_stages')
          .innerJoin('pipelines', 'pipelines.id', 'pipeline_stages.pipeline_id')
          .where('pipeline_stages.id', '=', parsed.data.stage_id)
          .where('pipelines.workspace_id', '=', workspace.id)
          .selectAll('pipeline_stages')
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

      // Fire webhook if stage changed
      if (
        parsed.data.stage_id &&
        currentDeal &&
        parsed.data.stage_id !== currentDeal.stage_id
      ) {
        queueWebhook(db, workspace.id, 'deal.stage_changed', {
          deal_id: req.params['id']!,
          deal_name: parsed.data.name ?? currentDeal.name,
          old_stage_id: currentDeal.stage_id,
          new_stage_id: parsed.data.stage_id,
          new_stage_name: targetStage?.name ?? null,
          value: parsed.data.value ?? currentDeal.value,
          owner_id: currentDeal.owner_id,
          workspace_id: workspace.id,
          timestamp: new Date().toISOString(),
        }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

        void logActivity(db, {
          workspace_id: workspace.id,
          user_id: currentDeal.owner_id,
          type: 'deal_change',
          body: targetStage
            ? `Deal moved to ${targetStage.name}`
            : 'Deal stage changed',
          deal_id: req.params['id']!,
          meta: {
            old_stage_id: currentDeal.stage_id,
            new_stage_id: parsed.data.stage_id,
            new_stage_name: targetStage?.name ?? null,
          },
        });
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
