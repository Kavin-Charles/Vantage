import { describe, it, expect, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'

vi.mock('./cross-module-settings', () => ({
  getCrossModuleSetting: vi.fn(),
}))
vi.mock('./pipeline-activity', () => ({
  logStageChanged: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./log-activity', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { getCrossModuleSetting } from './cross-module-settings'
import { logStageChanged } from './pipeline-activity'
import { logActivity } from './log-activity'
import { maybeSpawnProjectOnDealWon, maybeUpdateDealStageOnProjectComplete } from './deal-close-hooks'

const WORKSPACE_ID = 'ws-1'
const USER_ID = 'user-1'
const DEAL_ID = 'deal-1'

describe('maybeSpawnProjectOnDealWon', () => {
  it('does nothing when the setting is disabled', async () => {
    vi.mocked(getCrossModuleSetting).mockResolvedValue(false)
    const db = { selectFrom: vi.fn(), insertInto: vi.fn() } as unknown as Kysely<Database>

    await maybeSpawnProjectOnDealWon({ db, workspaceId: WORKSPACE_ID, userId: USER_ID, dealId: DEAL_ID })

    expect(db.selectFrom).not.toHaveBeenCalled()
  })

  it('creates a project linked to the deal when enabled and none exists yet', async () => {
    vi.mocked(getCrossModuleSetting).mockResolvedValue(true)

    const existingChain = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    }
    const dealChain = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ field_values: { name: 'Acme deal' } }),
    }
    let selectCall = 0
    const insertProjectChain = {
      values: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'project-1', name: 'Acme deal — Project' }),
    }
    const insertStatusesChain = { values: vi.fn().mockReturnThis(), execute: vi.fn().mockResolvedValue([]) }

    const db = {
      selectFrom: vi.fn(() => {
        selectCall++
        return selectCall === 1 ? existingChain : dealChain
      }),
      insertInto: vi.fn((table: string) => (table === 'projects' ? insertProjectChain : insertStatusesChain)),
    } as unknown as Kysely<Database>

    await maybeSpawnProjectOnDealWon({ db, workspaceId: WORKSPACE_ID, userId: USER_ID, dealId: DEAL_ID })

    expect(insertProjectChain.values).toHaveBeenCalledWith(expect.objectContaining({ deal_id: DEAL_ID, name: 'Acme deal — Project' }))
    expect(logActivity).toHaveBeenCalledWith(db, expect.objectContaining({ type: 'project_created' }))
  })
})

describe('maybeUpdateDealStageOnProjectComplete', () => {
  it('moves the deal to the won stage and logs the change', async () => {
    vi.mocked(getCrossModuleSetting).mockResolvedValue(true)

    const itemChain = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: DEAL_ID, pipeline_id: 'pipeline-1', stage_id: 'stage-open' }),
    }
    const wonStageChain = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: 'stage-won' }),
    }
    let selectCall = 0
    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), execute: vi.fn().mockResolvedValue([]) }

    const db = {
      selectFrom: vi.fn(() => {
        selectCall++
        return selectCall === 1 ? itemChain : wonStageChain
      }),
      updateTable: vi.fn(() => updateChain),
    } as unknown as Kysely<Database>

    await maybeUpdateDealStageOnProjectComplete({ db, workspaceId: WORKSPACE_ID, userId: USER_ID, dealId: DEAL_ID })

    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ stage_id: 'stage-won' }))
    expect(logStageChanged).toHaveBeenCalledWith(expect.objectContaining({ fromStageId: 'stage-open', toStageId: 'stage-won' }))
  })
})
