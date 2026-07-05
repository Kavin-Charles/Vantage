import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createAlert } from '../lib/alert-service';
import { logger } from '../lib/logger';

export async function runPmDueAlerts(db: Kysely<Database>): Promise<void> {
  const now = new Date();
  const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const threeDaysOut = new Date(startOfTodayUtc.getTime() + 3 * 24 * 60 * 60 * 1000);

  const overdueTasks = await db
    .selectFrom('project_tasks')
    .innerJoin('projects', 'projects.id', 'project_tasks.project_id')
    .innerJoin('project_task_statuses', 'project_task_statuses.id', 'project_tasks.status_id')
    .where('project_tasks.due_date', '<', startOfTodayUtc)
    .where('project_task_statuses.is_done', '=', false)
    .select(['project_tasks.id', 'project_tasks.title', 'project_tasks.project_id', 'projects.workspace_id'])
    .execute();

  for (const task of overdueTasks) {
    await createAlert(db, {
      workspaceId: task.workspace_id,
      severity: 'warning',
      resourceType: 'projects',
      resourceId: task.id,
      message: `Task overdue: "${task.title}"`,
      messagePrefix: 'Task overdue:',
      sourceModuleId: 'projects',
    }).catch((err: unknown) => logger.error({ err }, '[pm-due-alert] createAlert failed for task'));
  }

  const atRiskMilestones = await db
    .selectFrom('milestones')
    .innerJoin('projects', 'projects.id', 'milestones.project_id')
    .where('milestones.due_date', '<=', threeDaysOut)
    .where('milestones.status', '!=', 'COMPLETED')
    .select(['milestones.id', 'milestones.name', 'milestones.project_id', 'projects.workspace_id'])
    .execute();

  for (const milestone of atRiskMilestones) {
    await createAlert(db, {
      workspaceId: milestone.workspace_id,
      severity: 'warning',
      resourceType: 'projects',
      resourceId: milestone.id,
      message: `Milestone at risk: "${milestone.name}"`,
      messagePrefix: 'Milestone at risk:',
      sourceModuleId: 'projects',
    }).catch((err: unknown) => logger.error({ err }, '[pm-due-alert] createAlert failed for milestone'));
  }

  if (overdueTasks.length > 0 || atRiskMilestones.length > 0) {
    logger.info(
      { overdueTasks: overdueTasks.length, atRiskMilestones: atRiskMilestones.length },
      '[pm-due-alert] created alerts',
    );
  }
}

function msUntilNextMidnightUtc(): number {
  const now = new Date();
  const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return nextMidnight.getTime() - now.getTime();
}

export function startPmDueAlertWorker(db: Kysely<Database>): void {
  const scheduleNext = () => {
    const delay = msUntilNextMidnightUtc();
    setTimeout(() => {
      void runPmDueAlerts(db).catch(err => logger.error({ err }, '[pm-due-alert] run failed'));
      setInterval(() => {
        void runPmDueAlerts(db).catch(err => logger.error({ err }, '[pm-due-alert] run failed'));
      }, 24 * 60 * 60 * 1000);
    }, delay);
  };

  scheduleNext();
  logger.info('[pm-due-alert] started — fires at midnight UTC daily');
}
