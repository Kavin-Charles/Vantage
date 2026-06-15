import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { logger } from '../lib/logger'

export interface AutomationEvent {
  event_type: 'stage_changed' | 'field_changed' | 'item_created'
  item_id: string
  pipeline_id: string
  workspace_id: string
  payload: Record<string, unknown>
}

async function executeAction(
  db: Kysely<Database>,
  automationId: string,
  actionType: string,
  actionParams: Record<string, unknown>,
  item: { id: string; pipeline_id: string; workspace_id: string; field_values: Record<string, unknown> },
): Promise<void> {
  switch (actionType) {
    case 'move_stage': {
      const { stage_id } = actionParams as { stage_id: string }
      await db.updateTable('pipeline_items')
        .set({ stage_id, updated_at: new Date() })
        .where('id', '=', item.id)
        .execute()
      break
    }
    case 'assign_user': {
      const { field_key, user_id } = actionParams as { field_key: string; user_id: string }
      const newValues = { ...item.field_values, [field_key]: user_id }
      await db.updateTable('pipeline_items')
        .set({ field_values: newValues as never, updated_at: new Date() })
        .where('id', '=', item.id)
        .execute()
      break
    }
    case 'notify_assignee': {
      // Notification delivery is out of scope for v1 — log only
      logger.info({ automationId, item_id: item.id }, 'notify_assignee automation triggered')
      break
    }
    default:
      logger.warn({ automationId, actionType }, 'Unknown automation action type')
  }
}

function matchesTrigger(
  automation: { trigger_type: string; trigger_conditions: Record<string, unknown> },
  event: AutomationEvent,
): boolean {
  if (automation.trigger_type !== event.event_type) return false
  const cond = automation.trigger_conditions
  if (event.event_type === 'stage_changed' && cond['stage_id']) {
    return event.payload['to_stage_id'] === cond['stage_id']
  }
  if (event.event_type === 'field_changed' && cond['field_key']) {
    return event.payload['field_key'] === cond['field_key']
  }
  return true
}

export async function processAutomationEvent(db: Kysely<Database>, event: AutomationEvent): Promise<void> {
  const automations = await db
    .selectFrom('pipeline_automations')
    .selectAll()
    .where('pipeline_id', '=', event.pipeline_id)
    .where('enabled', '=', true)
    .execute()

  const item = await db
    .selectFrom('pipeline_items')
    .selectAll()
    .where('id', '=', event.item_id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()

  if (!item) return

  for (const automation of automations) {
    if (!matchesTrigger(automation, event)) continue

    let attempts = 0
    while (attempts < 3) {
      try {
        await executeAction(
          db,
          automation.id,
          automation.action_type,
          automation.action_params as Record<string, unknown>,
          { ...item, field_values: item.field_values as Record<string, unknown> },
        )
        await db.updateTable('pipeline_automations')
          .set({ last_fired_at: new Date() })
          .where('id', '=', automation.id)
          .execute()
        break
      } catch (err) {
        attempts++
        logger.error({ automationId: automation.id, attempt: attempts, err }, 'Automation action failed')
        if (attempts >= 3) {
          await db.updateTable('pipeline_automations')
            .set({ enabled: false })
            .where('id', '=', automation.id)
            .execute()
          logger.error({ automationId: automation.id }, 'Automation disabled after 3 failures')
        }
      }
    }
  }
}
