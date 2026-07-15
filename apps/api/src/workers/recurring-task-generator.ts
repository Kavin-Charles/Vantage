import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { logger } from '../lib/logger'
import { logActivity } from '../lib/log-activity'
import { computeNextRun } from '../routes/recurring-rules'

async function getDefaultStatusId(db: Kysely<Database>, projectId: string): Promise<string | null> {
  const first = await db.selectFrom('project_task_statuses')
    .select('id')
    .where('project_id', '=', projectId)
    .where('is_done', '=', false)
    .orderBy('position', 'asc')
    .executeTakeFirst()
  return first?.id ?? null
}

export async function runRecurringTaskGeneration(db: Kysely<Database>): Promise<void> {
  const dueRules = await db.selectFrom('recurring_task_rules')
    .selectAll()
    .where('is_active', '=', true)
    .where('next_run_at', '<=', new Date())
    .execute()

  for (const rule of dueRules) {
    try {
      await db.transaction().execute(async (trx) => {
        const project = await trx.selectFrom('projects').select('workspace_id')
          .where('id', '=', rule.project_id)
          .where('status', '!=', 'DELETED')
          .executeTakeFirst()
        if (!project) return

        const statusId = rule.status_id ?? await getDefaultStatusId(trx, rule.project_id)
        if (!statusId) {
          logger.warn({ ruleId: rule.id }, '[recurring-task-generator] no status available — skipping')
          return
        }

        const task = await trx.insertInto('project_tasks')
          .values({
            project_id: rule.project_id,
            created_by: rule.created_by,
            status_id: statusId,
            title: rule.title,
            description: rule.description,
            priority: rule.priority as 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE',
            position: Date.now(),
          })
          .returningAll()
          .executeTakeFirstOrThrow()

        const assigneeIds: string[] = rule.assignee_ids
          ? (typeof rule.assignee_ids === 'string' ? JSON.parse(rule.assignee_ids) : rule.assignee_ids)
          : []
        if (assigneeIds.length > 0) {
          await trx.insertInto('project_task_assignees')
            .values(assigneeIds.map(uid => ({ task_id: task.id, user_id: uid })))
            .onConflict(oc => oc.columns(['task_id', 'user_id']).doNothing())
            .execute()
        }

        await trx.updateTable('recurring_task_rules')
          .set({ next_run_at: computeNextRun(rule.next_run_at, rule.frequency as 'DAILY' | 'WEEKLY' | 'MONTHLY', rule.interval) })
          .where('id', '=', rule.id)
          .execute()

        if (project) {
          void logActivity(db, {
            workspace_id: project.workspace_id,
            user_id: rule.created_by,
            type: 'pm_task_created',
            source_module_id: 'projects',
            body: `Recurring task "${task.title}" generated`,
            meta: { task_id: task.id, project_id: rule.project_id, rule_id: rule.id },
          })
        }
      })
    } catch (err) {
      logger.error({ err, ruleId: rule.id }, '[recurring-task-generator] failed to generate task')
    }
  }

  if (dueRules.length > 0) {
    logger.info({ count: dueRules.length }, '[recurring-task-generator] generated tasks from due rules')
  }
}

export function startRecurringTaskGenerator(db: Kysely<Database>): void {
  void runRecurringTaskGeneration(db).catch(err =>
    logger.error({ err }, '[recurring-task-generator] initial run failed'),
  )
  setInterval(() => {
    void runRecurringTaskGeneration(db).catch(err =>
      logger.error({ err }, '[recurring-task-generator] run failed'),
    )
  }, 60 * 60 * 1000)
  logger.info('[recurring-task-generator] started — polls hourly')
}
