import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { logger } from '../../lib/logger'

export async function runOverdueScan(db: Kysely<Database>): Promise<void> {
  const now = new Date()

  const result = await db
    .selectFrom('project_tasks as t')
    .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
    .innerJoin('projects as p', 'p.id', 't.project_id')
    .select(db.fn.countAll<number>().as('count'))
    .where('t.due_date', '<', now)
    .where('s.is_done', '=', false)
    .where('p.status', '=', 'ACTIVE' as any)
    .executeTakeFirst()

  const count = Number(result?.count ?? 0)
  logger.info({ count }, 'overdue-scan: overdue tasks')
}
