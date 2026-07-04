import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

export function createProjectWidgetStatsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const activeRow = await db
        .selectFrom('projects')
        .where('workspace_id', '=', workspace.id)
        .where('status', '=', 'ACTIVE')
        .select(db.fn.countAll().as('count'))
        .executeTakeFirst();

      const atRiskRow = await db
        .selectFrom('projects')
        .where('workspace_id', '=', workspace.id)
        .where('status', '=', 'ACTIVE')
        .where('health', 'in', ['AT_RISK', 'OFF_TRACK'])
        .select(db.fn.countAll().as('count'))
        .executeTakeFirst();

      const overdueRow = await db
        .selectFrom('project_tasks')
        .innerJoin('projects', 'projects.id', 'project_tasks.project_id')
        .innerJoin('project_task_statuses', 'project_task_statuses.id', 'project_tasks.status_id')
        .where('projects.workspace_id', '=', workspace.id)
        .where('project_tasks.due_date', '<', new Date())
        .where('project_task_statuses.is_done', '=', false)
        .select(db.fn.countAll().as('count'))
        .executeTakeFirst();

      const now = new Date();
      const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const upcomingMilestones = await db
        .selectFrom('milestones')
        .innerJoin('projects', 'projects.id', 'milestones.project_id')
        .where('projects.workspace_id', '=', workspace.id)
        .where('milestones.due_date', '>=', now)
        .where('milestones.due_date', '<=', weekOut)
        .where('milestones.status', '!=', 'COMPLETED')
        .select(['milestones.id', 'milestones.name', 'milestones.due_date', 'milestones.project_id'])
        .execute();

      res.json({
        data: {
          active_projects: Number(activeRow?.count ?? 0),
          at_risk_projects: Number(atRiskRow?.count ?? 0),
          overdue_tasks: Number(overdueRow?.count ?? 0),
          upcoming_milestones: upcomingMilestones,
        },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
