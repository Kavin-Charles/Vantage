import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { logger } from '../../lib/logger'

export async function runDueDateAlerts(db: Kysely<Database>): Promise<void> {
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const tasks = await db
    .selectFrom('project_tasks as t')
    .innerJoin('project_task_assignees as a', 'a.task_id', 't.id')
    .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
    .innerJoin('projects as p', 'p.id', 't.project_id')
    .select(['t.id', 't.title', 't.project_id', 't.due_date', 'a.user_id', 'p.workspace_id'])
    .where('t.due_date', '>=', now)
    .where('t.due_date', '<=', in24h)
    .where('s.is_done', '=', false)
    .where('p.status', '=', 'ACTIVE' as any)
    .execute()

  let sent = 0
  for (const task of tasks) {
    const todayStart = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z')
    const existing = await db
      .selectFrom('activities')
      .select('id')
      .where('workspace_id', '=', task.workspace_id)
      .where('user_id', '=', task.user_id)
      .where('type', '=', 'note')
      .where('body', '=', `Task "${task.title}" is due within 24 hours`)
      .where('created_at', '>=', todayStart)
      .executeTakeFirst()
      .catch(() => null)

    if (!existing) {
      await db.insertInto('activities').values({
        workspace_id: task.workspace_id,
        user_id: task.user_id,
        type: 'note',
        body: `Task "${task.title}" is due within 24 hours`,
        meta: { source: 'worker', event: 'due_date_alert', task_id: task.id },
      }).execute()
      sent++
    }
  }

  logger.info({ count: sent }, 'due-date-alerts: sent alerts')
}
