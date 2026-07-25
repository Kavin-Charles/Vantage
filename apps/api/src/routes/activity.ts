import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createActivitySchema = z.object({
  type: z.enum(['email', 'call', 'note', 'meeting', 'deal_change', 'infra_alert']),
  body: z.string().optional(),
  contact_id: z.string().uuid().optional(),
  record_id: z.string().uuid().nullable().optional(),
  // deal_id is the CRM-facing alias for the generic record_id linkage column
  // (deals are pipeline records under the hood); accept either.
  deal_id: z.string().uuid().nullable().optional(),
  meta: z.record(z.unknown()).optional(),
});

export function createActivityRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router();

  router.get('/', requirePermission('activity:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const page = Number(req.query['page'] ?? 1);
      const per_page = Math.min(Number(req.query['per_page'] ?? 25), 100);
      const contact_id = req.query['contact_id'] as string | undefined;
      // record_id is the generic linkage column (deals/pipeline records); accept deal_id as an alias.
      const record_id = (req.query['record_id'] ?? req.query['deal_id']) as string | undefined;
      const type = req.query['type'] as string | undefined;
      const user_id = req.query['user_id'] as string | undefined;
      const limit = req.query['limit'] ? Math.min(Number(req.query['limit']), 100) : per_page;

      let query = db
        .selectFrom('activities')
        .where('workspace_id', '=', workspace.id)
        .selectAll();
      let countQuery = db
        .selectFrom('activities')
        .where('workspace_id', '=', workspace.id);

      if (contact_id) {
        query = query.where('contact_id', '=', contact_id);
        countQuery = countQuery.where('contact_id', '=', contact_id);
      }
      if (record_id) {
        query = query.where('record_id', '=', record_id);
        countQuery = countQuery.where('record_id', '=', record_id);
      }
      if (type) {
        query = query.where('type', '=', type as 'email' | 'call' | 'note' | 'meeting' | 'deal_change' | 'infra_alert');
        countQuery = countQuery.where('type', '=', type as 'email' | 'call' | 'note' | 'meeting' | 'deal_change' | 'infra_alert');
      }
      if (user_id) {
        query = query.where('user_id', '=', user_id);
        countQuery = countQuery.where('user_id', '=', user_id);
      }

      const activities = await query
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset((page - 1) * limit)
        .execute();

      const { count } = await countQuery
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

      res.json({ data: activities, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requirePermission('activity:create'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const body = createActivitySchema.parse(req.body);

      const activity = await db
        .insertInto('activities')
        .values({
          workspace_id: workspace.id,
          user_id: user.id,
          type: body.type,
          body: body.body ?? null,
          contact_id: body.contact_id ?? null,
          record_id: body.record_id ?? body.deal_id ?? null,
          meta: body.meta ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Keep last_contacted_at in sync whenever an activity is logged for a contact
      if (body.contact_id) {
        await db
          .updateTable('contacts')
          .set({ last_contacted_at: new Date(), updated_at: new Date() })
          .where('id', '=', body.contact_id)
          .where('workspace_id', '=', workspace.id)
          .where('deleted_at', 'is', null)
          .execute();
      }

      res.status(201).json({ data: activity, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

import { bridgeRegistry } from '@vencore/plugin-runtime';

export function registerActivityBridgeMethods(): void {
  bridgeRegistry
    .register('activity.list', 'activity:read', async (ctx, p, db) => {
      const filter = (p.filter ?? {}) as Record<string, unknown>;
      let q = db.selectFrom('activities').selectAll().where('workspace_id', '=', ctx.workspaceId);
      if (filter.contact_id) q = q.where('contact_id', '=', filter.contact_id as string);
      if (filter.deal_id) q = q.where('deal_id', '=', filter.deal_id as string);
      if (filter.type) q = q.where('type', '=', filter.type as string);
      if (filter.limit) q = q.limit(Number(filter.limit));
      return q.orderBy('created_at', 'desc').execute();
    })
    .register('activity.create', 'activity:write', async (ctx, p, db) => {
      const data = p.data as Record<string, unknown>;
      const [row] = await db.insertInto('activities')
        .values({ ...data, workspace_id: ctx.workspaceId } as any)
        .returningAll().execute();
      return row;
    });
}
