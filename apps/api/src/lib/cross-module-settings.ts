import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'

export type CrossModuleSettingKey =
  | 'pm.deal_link_enabled'
  | 'pm.deal_close_auto_spawn'
  | 'pm.project_complete_deal_stage'
  | 'crm.project_health_on_record'

export const DEFAULT_CROSS_MODULE_SETTINGS: Record<CrossModuleSettingKey, boolean> = {
  'pm.deal_link_enabled': true,
  'pm.deal_close_auto_spawn': false,
  'pm.project_complete_deal_stage': false,
  'crm.project_health_on_record': false,
}

export async function getCrossModuleSetting(
  db: Kysely<Database>,
  workspaceId: string,
  key: CrossModuleSettingKey,
): Promise<boolean> {
  const row = await db.selectFrom('cross_module_settings')
    .select('enabled')
    .where('workspace_id', '=', workspaceId)
    .where('setting_key', '=', key)
    .executeTakeFirst()
  return row?.enabled ?? DEFAULT_CROSS_MODULE_SETTINGS[key]
}

export async function setCrossModuleSetting(
  db: Kysely<Database>,
  workspaceId: string,
  key: CrossModuleSettingKey,
  enabled: boolean,
  config?: Record<string, unknown> | null,
): Promise<void> {
  await db.insertInto('cross_module_settings')
    .values({
      workspace_id: workspaceId,
      setting_key: key,
      enabled,
      config: config ?? null,
    })
    .onConflict(oc => oc
      .columns(['workspace_id', 'setting_key'])
      .doUpdateSet({ enabled, config: config ?? null, updated_at: new Date() }))
    .execute()
}

export async function listCrossModuleSettings(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<Record<CrossModuleSettingKey, boolean>> {
  const rows = await db.selectFrom('cross_module_settings')
    .select(['setting_key', 'enabled'])
    .where('workspace_id', '=', workspaceId)
    .execute()

  const overrides = new Map(rows.map(r => [r.setting_key, r.enabled]))
  const result = { ...DEFAULT_CROSS_MODULE_SETTINGS }
  for (const key of Object.keys(result) as CrossModuleSettingKey[]) {
    const override = overrides.get(key)
    if (override !== undefined) result[key] = override
  }
  return result
}
