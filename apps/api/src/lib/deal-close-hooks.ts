import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { getCrossModuleSetting } from './cross-module-settings'
import { logStageChanged } from './pipeline-activity'
import { logActivity } from './log-activity'
import { seedDefaultStatuses } from '../routes/projects'
import { logger } from './logger'

interface SpawnParams {
  db: Kysely<Database>
  workspaceId: string
  userId: string
  dealId: string
}

export async function maybeSpawnProjectOnDealWon(params: SpawnParams): Promise<void> {
  try {
    const enabled = await getCrossModuleSetting(params.db, params.workspaceId, 'pm.deal_close_auto_spawn')
    if (!enabled) return

    const existing = await params.db.selectFrom('projects')
      .select('id')
      .where('deal_id', '=', params.dealId)
      .where('workspace_id', '=', params.workspaceId)
      .where('status', '!=', 'DELETED')
      .executeTakeFirst()
    if (existing) return

    const deal = await params.db.selectFrom('pipeline_items')
      .select('field_values')
      .where('id', '=', params.dealId)
      .where('workspace_id', '=', params.workspaceId)
      .executeTakeFirst()
    const dealName = (deal?.field_values as Record<string, unknown> | undefined)?.['name']
    const projectName = typeof dealName === 'string' && dealName.length > 0 ? `${dealName} — Project` : 'New Project'

    const project = await params.db.insertInto('projects')
      .values({
        workspace_id: params.workspaceId,
        created_by: params.userId,
        name: projectName,
        deal_id: params.dealId,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    await seedDefaultStatuses(params.db, project.id)

    await logActivity(params.db, {
      workspace_id: params.workspaceId,
      user_id: params.userId,
      type: 'project_created',
      source_module_id: 'projects',
      record_id: project.id,
      body: `Auto-created project "${project.name}" from won deal`,
    })
  } catch (err) {
    logger.error({ err }, 'maybeSpawnProjectOnDealWon failed')
  }
}

interface CompleteParams {
  db: Kysely<Database>
  workspaceId: string
  userId: string
  dealId: string
}

export async function maybeUpdateDealStageOnProjectComplete(params: CompleteParams): Promise<void> {
  try {
    const enabled = await getCrossModuleSetting(params.db, params.workspaceId, 'pm.project_complete_deal_stage')
    if (!enabled) return

    const item = await params.db.selectFrom('pipeline_items')
      .select(['id', 'pipeline_id', 'stage_id'])
      .where('id', '=', params.dealId)
      .where('workspace_id', '=', params.workspaceId)
      .executeTakeFirst()
    if (!item) return

    const wonStage = await params.db.selectFrom('pipeline_stages')
      .select('id')
      .where('pipeline_id', '=', item.pipeline_id)
      .where('is_won', '=', true)
      .executeTakeFirst()
    if (!wonStage || wonStage.id === item.stage_id) return

    await params.db.updateTable('pipeline_items')
      .set({ stage_id: wonStage.id, updated_at: new Date() })
      .where('id', '=', item.id)
      .execute()

    await logStageChanged({
      db: params.db,
      itemId: item.id,
      pipelineId: item.pipeline_id,
      workspaceId: params.workspaceId,
      userId: params.userId,
      fromStageId: item.stage_id,
      toStageId: wonStage.id,
    })
  } catch (err) {
    logger.error({ err }, 'maybeUpdateDealStageOnProjectComplete failed')
  }
}
