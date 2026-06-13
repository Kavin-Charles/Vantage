import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { logger } from '../../lib/logger'

export async function runSprintRollover(db: Kysely<Database>): Promise<void> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const yesterdayEnd = new Date(yesterday)
  yesterdayEnd.setHours(23, 59, 59, 999)

  const sprints = await db
    .selectFrom('sprints')
    .selectAll()
    .where('status', '=', 'ACTIVE' as any)
    .where('end_date', '>=', yesterday)
    .where('end_date', '<=', yesterdayEnd)
    .execute()

  let processed = 0

  for (const sprint of sprints) {
    const sprintTasks = await db
      .selectFrom('sprint_tasks as st')
      .innerJoin('project_tasks as t', 't.id', 'st.task_id')
      .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
      .select(['st.task_id', 'st.points', 's.is_done'])
      .where('st.sprint_id', '=', sprint.id)
      .execute()

    const velocity = sprintTasks
      .filter(t => t.is_done)
      .reduce((sum, t) => sum + (t.points ?? 0), 0)

    await db
      .updateTable('sprints')
      .set({ status: 'COMPLETED', velocity })
      .where('id', '=', sprint.id)
      .execute()

    const incompleteTasks = sprintTasks.filter(t => !t.is_done).map(t => t.task_id)
    if (incompleteTasks.length) {
      await db
        .deleteFrom('sprint_tasks')
        .where('sprint_id', '=', sprint.id)
        .where('task_id', 'in', incompleteTasks)
        .execute()
    }

    processed++
  }

  logger.info({ processed }, 'sprint-rollover: sprints completed')
}
