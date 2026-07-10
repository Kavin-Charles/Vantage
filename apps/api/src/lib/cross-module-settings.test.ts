import { describe, it, expect, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import {
  getCrossModuleSetting,
  setCrossModuleSetting,
  listCrossModuleSettings,
  DEFAULT_CROSS_MODULE_SETTINGS,
} from './cross-module-settings'

describe('getCrossModuleSetting', () => {
  it('returns the locked default when no row exists', async () => {
    const chain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    }
    const db = chain as unknown as Kysely<Database>

    const result = await getCrossModuleSetting(db, 'ws-1', 'pm.deal_link_enabled')
    expect(result).toBe(true)
  })

  it('returns the stored value when a row exists', async () => {
    const chain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ enabled: true }),
    }
    const db = chain as unknown as Kysely<Database>

    const result = await getCrossModuleSetting(db, 'ws-1', 'pm.deal_close_auto_spawn')
    expect(result).toBe(true)
  })
})

describe('setCrossModuleSetting', () => {
  it('upserts the row via onConflict', async () => {
    const chain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflict: vi.fn((cb: (oc: any) => any) => {
        const ocChain = { columns: vi.fn().mockReturnThis(), doUpdateSet: vi.fn().mockReturnThis() }
        cb(ocChain)
        return chain
      }),
      execute: vi.fn().mockResolvedValue([]),
    }
    const db = chain as unknown as Kysely<Database>

    await setCrossModuleSetting(db, 'ws-1', 'pm.deal_close_auto_spawn', true)
    expect(chain.insertInto).toHaveBeenCalledWith('cross_module_settings')
  })
})

describe('listCrossModuleSettings', () => {
  it('merges stored overrides onto the full default key set', async () => {
    const chain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([{ setting_key: 'pm.deal_close_auto_spawn', enabled: true }]),
    }
    const db = chain as unknown as Kysely<Database>

    const result = await listCrossModuleSettings(db, 'ws-1')
    expect(result['pm.deal_link_enabled']).toBe(DEFAULT_CROSS_MODULE_SETTINGS['pm.deal_link_enabled'])
    expect(result['pm.deal_close_auto_spawn']).toBe(true)
    expect(Object.keys(result).sort()).toEqual(Object.keys(DEFAULT_CROSS_MODULE_SETTINGS).sort())
  })
})
