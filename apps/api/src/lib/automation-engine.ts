import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { pmEvents, type PMEvent } from './pm-events'
import { logger } from './logger'
import { triggerSchema, actionSchema } from '../routes/automation'

type ParsedTrigger = z.infer<typeof triggerSchema>
type ParsedAction = z.infer<typeof actionSchema>

export async function executeActions(
  db: Kysely<Database>,
  ruleId: string,
  projectId: string,
  actions: ParsedAction[],
  event: PMEvent,
  createdBy: string,
): Promise<void> {
  for (const act of actions) {
    try {
      if (act.type === 'send_notification') {
        const workspace = await db
          .selectFrom('projects')
          .select('workspace_id')
          .where('id', '=', projectId)
          .executeTakeFirst()
        if (workspace) {
          for (const userId of act.user_ids) {
            await db.insertInto('activities').values({
              workspace_id: workspace.workspace_id,
              user_id: userId,
              type: 'note',
              body: act.message,
              meta: { source: 'automation', rule_id: ruleId, event_type: event.type },
            }).execute()
          }
        }
      } else if (act.type === 'change_task_status') {
        if ('taskId' in event) {
          await db.updateTable('project_tasks')
            .set({ status_id: act.status_id, updated_at: new Date() })
            .where('id', '=', (event as { taskId: string }).taskId)
            .where('project_id', '=', projectId)
            .execute()
        }
      } else if (act.type === 'assign_task') {
        if ('taskId' in event) {
          const taskId = (event as { taskId: string }).taskId
          const existing = await db
            .selectFrom('project_task_assignees')
            .select('user_id')
            .where('task_id', '=', taskId)
            .where('user_id', '=', act.user_id)
            .executeTakeFirst()
          if (!existing) {
            await db.insertInto('project_task_assignees')
              .values({ task_id: taskId, user_id: act.user_id })
              .execute()
          }
        }
      } else if (act.type === 'mark_milestone_complete') {
        await db.updateTable('milestones')
          .set({ status: 'COMPLETED' as 'COMPLETED' })
          .where('id', '=', act.milestone_id)
          .where('project_id', '=', projectId)
          .execute()
      } else if (act.type === 'send_webhook') {
        const payload = act.payload ?? {}
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 5000)
        try {
          await fetch(act.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, ...payload }),
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timer)
        }
      } else if (act.type === 'create_task') {
        let statusId = act.status_id
        if (!statusId) {
          const defaultStatus = await db.selectFrom('project_task_statuses')
            .select('id')
            .where('project_id', '=', projectId)
            .orderBy('position', 'asc')
            .executeTakeFirst()
          if (!defaultStatus) continue
          statusId = defaultStatus.id
        }

        const created = await db.insertInto('project_tasks').values({
          project_id: projectId,
          status_id: statusId,
          title: act.title,
          created_by: createdBy,
        }).returningAll().executeTakeFirstOrThrow()

        if (act.assignee_ids) {
          for (const userId of act.assignee_ids) {
            await db.insertInto('project_task_assignees')
              .values({ task_id: created.id, user_id: userId })
              .execute()
          }
        }

        const workspaceRow = await db.selectFrom('projects').select('workspace_id')
          .where('id', '=', projectId).executeTakeFirst()
        if (workspaceRow) {
          await db.insertInto('activities').values({
            workspace_id: workspaceRow.workspace_id,
            user_id: createdBy,
            type: 'pm_task_created',
            body: `Created task "${act.title}" via automation`,
            meta: { source: 'automation', rule_id: ruleId },
          }).execute()
        }
      } else if (act.type === 'set_custom_field') {
        if ('taskId' in event) {
          const taskId = (event as { taskId: string }).taskId
          await db.insertInto('custom_field_values')
            .values({ task_id: taskId, custom_field_id: act.custom_field_id, value: act.value })
            .onConflict(oc => oc.columns(['task_id', 'custom_field_id']).doUpdateSet({ value: act.value }))
            .execute()
        }
      }
    } catch (err) {
      logger.error({ err, ruleId, action: act.type }, 'automation action error')
      throw err
    }
  }
}

function triggerMatches(trigger: ParsedTrigger, event: PMEvent): boolean {
  if (trigger.type !== event.type) return false
  if (event.type === 'task_status_changed' && trigger.type === 'task_status_changed' && trigger.to_status_id) {
    return trigger.to_status_id === event.to_status_id
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
        const triggerParsed = triggerSchema.safeParse(
          typeof rule.trigger === 'string' ? JSON.parse(rule.trigger) : rule.trigger,
        )
        const actionsParsed = z.array(actionSchema).safeParse(
          typeof rule.actions === 'string' ? JSON.parse(rule.actions as string) : rule.actions,
        )
        if (!triggerParsed.success || !actionsParsed.success) {
          logger.warn({ ruleId: rule.id }, 'automation rule has invalid trigger/actions — skipping')
          continue
        }

        if (!triggerMatches(triggerParsed.data, event)) continue

        let success = true
        let detail: string | null = null

        try {
          await executeActions(db, rule.id, rule.project_id, actionsParsed.data, event, rule.created_by)
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
