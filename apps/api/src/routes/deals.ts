import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createDealSchema = z.object({
  name: z.string().min(1),
  value: z.number().min(0).default(0),
  stage: z.enum(['lead', 'qualifying', 'proposal', 'closing', 'won', 'lost']).default('lead'),
  probability: z.number().int().min(0).max(100).default(0),
  close_date: z.string().optional(),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
});

const updateDealSchema = createDealSchema.partial();

export function createDealsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const stage = req.query['stage'] as string | undefined;
      const owner_id = req.query['owner_id'] as string | undefined;
      const page = Number(req.query['page'] ?? 1);
      const per_page = Math.min(Number(req.query['per_page'] ?? 50), 100);

      let query = db
        .selectFrom('deals')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (stage) query = query.where('stage', '=', stage as never);
      if (owner_id) query = query.where('owner_id', '=', owner_id);

      const deals = await query.execute();
      res.json({ data: deals, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
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

  router.post('/', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const body = createDealSchema.parse(req.body);

      const deal = await db
        .insertInto('deals')
        .values({
          ...body,
          workspace_id: workspace.id,
          owner_id: user.id,
          close_date: body.close_date ? new Date(body.close_date) : null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: deal, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const body = updateDealSchema.parse(req.body);

      // Get current stage to detect stage change
      const current = await db
        .selectFrom('deals')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .select(['stage', 'id'])
        .executeTakeFirst();

      if (!current) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deal not found' } });
        return;
      }

      const deal = await db
        .updateTable('deals')
        .set({
          ...body,
          updated_at: new Date(),
          close_date: body.close_date ? new Date(body.close_date) : undefined,
        })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      // Log activity on stage change
      if (body.stage && body.stage !== current.stage) {
        await db.insertInto('activities').values({
          workspace_id: workspace.id,
          user_id: user.id,
          deal_id: deal.id,
          type: 'deal_change',
          body: `Stage changed from ${current.stage} to ${body.stage}`,
          meta: { from: current.stage, to: body.stage },
        }).execute();
      }

      res.json({ data: deal, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
