// apps/api/src/workers/task-due-notifier.ts
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { sendPush } from '../lib/push-notify';
import { logger } from '../lib/logger';
import { createAlert } from '../lib/alert-service';

async function runDueTaskNotifications(db: Kysely<Database>): Promise<void> {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const dueTasks = await db
    .selectFrom('tasks')
    .where('due_date', '=', today)
    .where('status', '=', 'todo')
    .select(['id', 'title', 'assignee_id', 'workspace_id'])
    .execute();

  if (dueTasks.length === 0) return;

  // Group by assignee
  const byAssignee = new Map<string, typeof dueTasks>();
  for (const task of dueTasks) {
    if (!task.assignee_id) continue;
    const existing = byAssignee.get(task.assignee_id) ?? [];
    existing.push(task);
    byAssignee.set(task.assignee_id, existing);
  }

  for (const [assigneeId, tasks] of byAssignee) {
    const tokenRows = await db
      .selectFrom('push_tokens')
      .where('user_id', '=', assigneeId)
      .select(['token', 'preferences'])
      .execute();

    const eligibleTokens = tokenRows
      .filter(row => {
        const prefs = (row.preferences ?? {}) as Record<string, boolean>;
        return prefs['tasks_due'] !== false; // default on
      })
      .map(row => row.token);

    if (eligibleTokens.length === 0) continue;

    for (const task of tasks) {
      await sendPush(eligibleTokens, '📋 Task due today', task.title);
    }
  }

  logger.info({ count: dueTasks.length }, '[task-due-notifier] sent push for due tasks');
}

async function createOverdueAlerts(db: Kysely<Database>): Promise<void> {
  const now = new Date()
  const startOfTodayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )

  const overdueTasks = await db
    .selectFrom('tasks')
    .where('due_date', '<', startOfTodayUtc)
    .where('status', '=', 'todo')
    .select(['id', 'title', 'workspace_id'])
    .execute()

  for (const task of overdueTasks) {
    await createAlert(db, {
      workspaceId: task.workspace_id,
      severity: 'warning',
      resourceType: 'crm',
      resourceId: task.id,
      message: `Task overdue: "${task.title}"`,
      messagePrefix: 'Task overdue:',
      sourceModuleId: 'tasks',
    }).catch((err: unknown) => logger.error({ err }, '[task-due-notifier] createAlert failed'))
  }

  if (overdueTasks.length > 0) {
    logger.info({ count: overdueTasks.length }, '[task-due-notifier] created overdue alerts')
  }
}

function msUntilNextMidnightUtc(): number {
  const now = new Date();
  const nextMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return nextMidnight.getTime() - now.getTime();
}

export function startTaskDueNotifier(db: Kysely<Database>): void {
  const scheduleNext = () => {
    const delay = msUntilNextMidnightUtc();
    setTimeout(() => {
      void runDueTaskNotifications(db).catch(err =>
        logger.error({ err }, '[task-due-notifier] run failed'),
      );
      void createOverdueAlerts(db).catch(err =>
        logger.error({ err }, '[task-due-notifier] overdue alerts failed'),
      );
      setInterval(() => {
        void runDueTaskNotifications(db).catch(err =>
          logger.error({ err }, '[task-due-notifier] run failed'),
        );
        void createOverdueAlerts(db).catch(err =>
          logger.error({ err }, '[task-due-notifier] overdue alerts failed'),
        );
      }, 24 * 60 * 60 * 1000);
    }, delay);
  };

  scheduleNext();
  logger.info('[task-due-notifier] started — fires at midnight UTC daily');
}
