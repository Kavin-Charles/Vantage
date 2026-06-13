import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { logger } from '../../lib/logger'

export async function runHealthRecalc(db: Kysely<Database>): Promise<void> {
  const now = new Date()

  const projects = await db
    .selectFrom('projects')
    .select('id')
    .where('status', '=', 'ACTIVE' as any)
    .execute()

  let updated = 0

  for (const project of projects) {
    const totalResult = await db
      .selectFrom('project_tasks as t')
      .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
      .select(db.fn.countAll<number>().as('count'))
      .where('t.project_id', '=', project.id)
      .where('s.is_done', '=', false)
      .where('t.due_date', 'is not', null)
      .executeTakeFirst()

    const total = Number(totalResult?.count ?? 0)
    if (total === 0) continue

    const overdueResult = await db
      .selectFrom('project_tasks as t')
      .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
      .select(db.fn.countAll<number>().as('count'))
      .where('t.project_id', '=', project.id)
      .where('s.is_done', '=', false)
      .where('t.due_date', '<', now)
      .executeTakeFirst()

    const overdue = Number(overdueResult?.count ?? 0)
    const rate = overdue / total

    let health: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'
    if (rate === 0) {
      health = 'ON_TRACK'
    } else if (rate <= 0.25) {
      health = 'AT_RISK'
    } else {
      health = 'OFF_TRACK'
    }

    await db
      .updateTable('projects')
      .set({ health })
      .where('id', '=', project.id)
      .execute()

    updated++
  }

  logger.info({ updated }, 'health-recalc: projects updated')
}
