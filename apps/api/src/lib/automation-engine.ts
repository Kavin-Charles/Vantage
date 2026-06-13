import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { pmEvents, type PMEvent } from './pm-events'
import { logger } from './logger'

async function executeActions(
  db: Kysely<Database>,
  ruleId: string,
  projectId: string,
  actions: unknown[],
  event: PMEvent,
): Promise<void> {
  for (const action of actions) {
    const act = action as Record<string, unknown>
    try {
      if (act['type'] === 'send_notification') {
        const userIds = act['user_ids'] as string[]
        const message = act['message'] as string
        const workspace = await db
          .selectFrom('projects')
          .select('workspace_id')
          .where('id', '=', projectId)
          .executeTakeFirst()
        if (workspace) {
          for (const userId of userIds) {
            await db.insertInto('activities').values({
              workspace_id: workspace.workspace_id,
              user_id: userId,
              type: 'note',
              body: message,
              meta: { source: 'automation', rule_id: ruleId, event_type: event.type },
            }).execute()
          }
        }
      } else if (act['type'] === 'change_task_status') {
        const statusId = act['status_id'] as string
        if ('taskId' in event) {
          await db.updateTable('project_tasks')
            .set({ status_id: statusId, updated_at: new Date() })
            .where('id', '=', (event as { taskId: string }).taskId)
            .where('project_id', '=', projectId)
            .execute()
        }
      } else if (act['type'] === 'assign_task') {
        const userId = act['user_id'] as string
        if ('taskId' in event) {
          const taskId = (event as { taskId: string }).taskId
          const existing = await db
            .selectFrom('project_task_assignees')
            .select('user_id')
            .where('task_id', '=', taskId)
            .where('user_id', '=', userId)
            .executeTakeFirst()
          if (!existing) {
            await db.insertInto('project_task_assignees')
              .values({ task_id: taskId, user_id: userId })
              .execute()
          }
        }
      } else if (act['type'] === 'mark_milestone_complete') {
        const milestoneId = act['milestone_id'] as string
        await db.updateTable('milestones')
          .set({ status: 'COMPLETED' })
          .where('id', '=', milestoneId)
          .where('project_id', '=', projectId)
          .execute()
      } else if (act['type'] === 'send_webhook') {
        const url = act['url'] as string
        const payload = (act['payload'] as Record<string, unknown> | undefined) ?? {}
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 5000)
        try {
          await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, ...payload }),
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timer)
        }
      }
    } catch (err) {
      logger.error({ err, ruleId, action: act['type'] }, 'automation action error')
      throw err
    }
  }
}

function triggerMatches(trigger: Record<string, unknown>, event: PMEvent): boolean {
  if (trigger['type'] !== event.type) return false
  if (event.type === 'task_status_changed' && trigger['to_status_id']) {
    return trigger['to_status_id'] === event.to_status_id
  }
  return true
}

export function initAutomationEngine(db: Kysely<Database>): void {
  pmEvents.on('pm', async (event: PMEvent) => {
    try {
      const rules = await db
        .selectFrom('automation_rules')
        .selectAll()
        .where('project_id', '=', event.projectId)
        .where('is_active', '=', true)
        .execute()

      for (const rule of rules) {
        const trigger = (typeof rule.trigger === 'string'
          ? JSON.parse(rule.trigger)
          : rule.trigger) as Record<string, unknown>
        const actions = (typeof rule.actions === 'string'
          ? JSON.parse(rule.actions)
          : rule.actions) as unknown[]

        if (!triggerMatches(trigger, event)) continue

        let success = true
        let detail: string | null = null

        try {
          await executeActions(db, rule.id, rule.project_id, actions, event)
        } catch (err) {
          success = false
          detail = err instanceof Error ? err.message : String(err)
        }

        await db.insertInto('automation_logs').values({
          rule_id: rule.id,
          success,
          detail,
        }).execute()
      }
    } catch (err) {
      logger.error({ err }, 'automation engine error')
    }
  })
}
