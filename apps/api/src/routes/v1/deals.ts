import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { requireScope } from '../../middleware/api-key-auth';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  value: z.number().min(0).default(0),
  probability: z.number().int().min(0).max(100).default(0),
  close_date: z.string().optional(),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  stage_id: z.string().uuid().optional(),
  value: z.number().min(0).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  close_date: z.string().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
});

export function createV1DealsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /v1/deals
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, pipeline_id, stage_id } = parsed.data;

      let query = db
        .selectFrom('deals')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (pipeline_id) query = query.where('pipeline_id', '=', pipeline_id);
      if (stage_id) query = query.where('stage_id', '=', stage_id);

      const deals = await query.execute();

      let countQuery = db
        .selectFrom('deals')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .select(db.fn.countAll<number>().as('count'));

      if (pipeline_id) countQuery = countQuery.where('pipeline_id', '=', pipeline_id);
      if (stage_id) countQuery = countQuery.where('stage_id', '=', stage_id);

      const { count } = await countQuery.executeTakeFirstOrThrow();
      res.json({ data: deals, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/deals/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const deal = await db
        .selectFrom('deals')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .executeTakeFirst();

      if (!deal) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deal not found' } });
        return;
      }
      res.json({ data: deal, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /v1/deals [read_write]
  router.post('/', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      // Validate owner_id belongs to workspace
      const owner = await db
        .selectFrom('users')
        .where('id', '=', parsed.data.owner_id)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!owner) {
        res.status(400).json({ data: null, error: { code: 'INVALID_OWNER', message: 'owner_id not found in workspace' } });
        return;
      }

      // Validate pipeline belongs to workspace
      const pipeline = await db
        .selectFrom('pipelines')
        .where('id', '=', parsed.data.pipeline_id)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!pipeline) {
        res.status(400).json({ data: null, error: { code: 'INVALID_PIPELINE', message: 'pipeline_id not found in workspace' } });
        return;
      }

      const deal = await db
        .insertInto('deals')
        .values({
          workspace_id: workspace.id,
          name: parsed.data.name,
          pipeline_id: parsed.data.pipeline_id,
          stage_id: parsed.data.stage_id,
          owner_id: parsed.data.owner_id,
          value: parsed.data.value,
          probability: parsed.data.probability,
          close_date: parsed.data.close_date ? new Date(parsed.data.close_date) : null,
          contact_id: parsed.data.contact_id ?? null,
          company_id: parsed.data.company_id ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: deal, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /v1/deals/:id [read_write]
  router.patch('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      const updateVals: Record<string, unknown> = { updated_at: new Date() };
      for (const [k, v] of Object.entries(parsed.data)) {
        if (v !== undefined) updateVals[k] = k === 'close_date' && v ? new Date(v as string) : v;
      }

      const deal = await db
        .updateTable('deals')
        .set(updateVals as never)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      if (!deal) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deal not found' } });
        return;
      }
      res.json({ data: deal, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
