import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { OverviewDeal } from '@vencore/types';
import type { AuthenticatedRequest } from '../middleware/auth';

/**
 * GET /:id/overview — aggregate view of a company: the company row itself,
 * its contacts, the deals attached to the company, recent activity and
 * tasks across those contacts, plus rolled-up metrics (total deal value,
 * open deal count, contact count, last activity time). Mounted at the same
 * base path as the main companies router (`/api/companies`) and guarded by
 * the same `companies:view` permission used by `GET /api/companies/:id`.
 */
export function createCompaniesOverviewRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
): ExpressRouter {
  const router = Router();

  router.get('/:id/overview', requirePermission('companies:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const id = req.params['id']!;

      const company = await db
        .selectFrom('companies')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

      if (!company) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Company not found.' } });
        return;
      }

      const contacts = await db
        .selectFrom('contacts')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('company_id', '=', id)
        .where('deleted_at', 'is', null)
        .execute();

      const pipelineItems = await db
        .selectFrom('pipeline_items')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('company_id', '=', id)
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

      const contactIds = contacts.map((contact) => contact.id);

      const activities = contactIds.length > 0
        ? await db
          .selectFrom('activities')
          .selectAll()
          .where('workspace_id', '=', workspace.id)
          .where('contact_id', 'in', contactIds)
          .orderBy('created_at', 'desc')
          .limit(50)
          .execute()
        : [];

      const tasks = contactIds.length > 0
        ? await db
          .selectFrom('tasks')
          .selectAll()
          .where('workspace_id', '=', workspace.id)
          .where('contact_id', 'in', contactIds)
          .orderBy('created_at', 'desc')
          .limit(50)
          .execute()
        : [];

      const totalDealValue = deals.reduce((sum, d) => sum + d.value, 0);

      res.json({
        data: {
          company,
          contacts,
          deals,
          activities,
          tasks,
          metrics: {
            total_deal_value: totalDealValue,
            open_deal_count: deals.length,
            contact_count: contacts.length,
            last_activity_at: activities[0]?.created_at
              ? new Date(activities[0].created_at).toISOString()
              : null,
          },
        },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
