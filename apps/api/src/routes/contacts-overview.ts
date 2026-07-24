import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { OverviewDeal } from '@vencore/types';
import type { AuthenticatedRequest } from '../middleware/auth';

/**
 * GET /:id/overview — aggregate view of a contact: the contact row itself,
 * its open deals, its recent activity, and rolled-up metrics (total deal
 * value, interaction count, current stage, last contact time) plus a
 * per-stage value funnel. Mounted at the same base path as the main
 * contacts router (`/api/contacts`) and guarded by the same
 * `contacts:view` permission used by `GET /api/contacts/:id`.
 */
export function createContactsOverviewRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
): ExpressRouter {
  const router = Router();

  router.get('/:id/overview', requirePermission('contacts:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const id = req.params['id']!;

      const contact = await db
        .selectFrom('contacts')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found.' } });
        return;
      }

      const pipelineItems = await db
        .selectFrom('pipeline_items')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('contact_id', '=', id)
        .where('deleted_at', 'is', null)
        .execute();

      const stageIds = [...new Set(pipelineItems.map((item) => item.stage_id))];
      const stageNameById = new Map<string, string>();
      if (stageIds.length > 0) {
        const stages = await db
          .selectFrom('pipeline_stages')
          .select(['id', 'name'])
          .where('id', 'in', stageIds)
          .execute();
        for (const stage of stages) {
          stageNameById.set(stage.id, stage.name);
        }
      }

      const deals: OverviewDeal[] = pipelineItems.map((item) => {
        const fieldValues = (item.field_values ?? {}) as Record<string, unknown>;
        return {
          id: item.id,
          name: (fieldValues['name'] as string | undefined) ?? '',
          value: Number(fieldValues['value'] ?? 0),
          stage_id: item.stage_id,
          stage: stageNameById.get(item.stage_id) ?? null,
          contact_id: item.contact_id,
          company_id: item.company_id,
        };
      });

      const activities = await db
        .selectFrom('activities')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('contact_id', '=', id)
        .orderBy('created_at', 'desc')
        .limit(50)
        .execute();

      const tasks = await db
        .selectFrom('tasks')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('contact_id', '=', id)
        .orderBy('created_at', 'desc')
        .limit(50)
        .execute();

      const totalDealValue = deals.reduce((sum, d) => sum + d.value, 0);

      const funnel = new Map<string, number>();
      for (const d of deals) {
        const stage = d.stage ?? 'unstaged';
        funnel.set(stage, (funnel.get(stage) ?? 0) + d.value);
      }

      res.json({
        data: {
          contact,
          deals,
          activities,
          tasks,
          metrics: {
            total_deal_value: totalDealValue,
            interaction_count: activities.length,
            current_stage: deals[0]?.stage ?? null,
            last_contact_at: contact.last_contacted_at
              ? new Date(contact.last_contacted_at).toISOString()
              : null,
          },
          stage_funnel: [...funnel.entries()].map(([stage, total]) => ({ stage, total })),
        },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
