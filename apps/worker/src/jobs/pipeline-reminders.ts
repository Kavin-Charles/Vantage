import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { logger } from '../lib/logger'

export async function runPipelineReminders(db: Kysely<Database>): Promise<void> {
  const now = new Date()

  const automations = await db
    .selectFrom('pipeline_automations')
    .selectAll()
    .where('trigger_type', '=', 'date_approaching')
    .where('enabled', '=', true)
    .execute()

  for (const automation of automations) {
    // Dedup: skip if fired within last 23 hours
    if (automation.last_fired_at) {
      const hoursSinceFired = (now.getTime() - new Date(automation.last_fired_at).getTime()) / 3_600_000
      if (hoursSinceFired < 23) continue
    }

    const cond = automation.trigger_conditions as { field_key?: string; days_before?: number }
    if (!cond.field_key || cond.days_before === undefined) continue

    const thresholdDate = new Date(now.getTime() + cond.days_before * 86_400_000)

    const items = await db
      .selectFrom('pipeline_items')
      .selectAll()
      .where('pipeline_id', '=', automation.pipeline_id)
      .where('deleted_at', 'is', null)
      .execute()

    for (const item of items) {
      const fieldValues = item.field_values as Record<string, unknown>
      const dateVal = fieldValues[cond.field_key]
      if (!dateVal || typeof dateVal !== 'string') continue

      const itemDate = new Date(dateVal)
      if (isNaN(itemDate.getTime())) continue
      if (itemDate <= now || itemDate > thresholdDate) continue

      await db.insertInto('pipeline_activity').values({
        item_id: item.id,
        pipeline_id: item.pipeline_id,
        workspace_id: item.workspace_id,
        user_id: null,
        event_type: 'reminder_sent',
        payload: { field_key: cond.field_key, date: dateVal } as never,
      }).execute()

      logger.info({ automationId: automation.id, itemId: item.id }, 'Pipeline reminder fired')
    }

    await db.updateTable('pipeline_automations')
      .set({ last_fired_at: now })
      .where('id', '=', automation.id)
      .execute()
  }

  logger.info('pipeline reminder run complete')
}
