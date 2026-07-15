import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'
import {
  listCrossModuleSettings,
  setCrossModuleSetting,
  DEFAULT_CROSS_MODULE_SETTINGS,
  type CrossModuleSettingKey,
} from '../lib/cross-module-settings'

const KNOWN_KEYS = Object.keys(DEFAULT_CROSS_MODULE_SETTINGS) as CrossModuleSettingKey[]

const patchSchema = z.object({
  key: z.enum(KNOWN_KEYS as [CrossModuleSettingKey, ...CrossModuleSettingKey[]]),
  enabled: z.boolean(),
})

export function createCrossModuleSettingsRouter(db: Kysely<Database>): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest
      const settings = await listCrossModuleSettings(db, workspace.id)
      return res.json({ data: settings, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  router.patch('/', async (req, res) => {
    const parsed = patchSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const { workspace } = req as unknown as AuthenticatedRequest
      await setCrossModuleSetting(db, workspace.id, parsed.data.key, parsed.data.enabled)
      return res.json({ data: { key: parsed.data.key, enabled: parsed.data.enabled }, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  return router
}
