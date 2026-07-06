import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'

const WORKSPACE_ID = 'ws-1'

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    ;(req as any).user = { id: 'user-1', role: 'admin' }
    ;(req as any).workspace = { id: WORKSPACE_ID }
    next()
  })
}

describe('GET /api/cross-module-settings', () => {
  it('returns the full default key set merged with overrides', async () => {
    const chain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([{ setting_key: 'pm.deal_close_auto_spawn', enabled: true }]),
    }
    const db = chain as unknown as Kysely<Database>

    const { createCrossModuleSettingsRouter } = await import('./cross-module-settings')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/cross-module-settings', createCrossModuleSettingsRouter(db))

    const res = await request(app).get('/api/cross-module-settings')
    expect(res.status).toBe(200)
    expect(res.body.data['pm.deal_link_enabled']).toBe(true)
    expect(res.body.data['pm.deal_close_auto_spawn']).toBe(true)
  })
})

describe('PATCH /api/cross-module-settings', () => {
  it('upserts the given key', async () => {
    const chain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflict: vi.fn((cb: (oc: any) => any) => {
        cb({ columns: vi.fn().mockReturnThis(), doUpdateSet: vi.fn().mockReturnThis() })
        return chain
      }),
      execute: vi.fn().mockResolvedValue([]),
    }
    const db = chain as unknown as Kysely<Database>

    const { createCrossModuleSettingsRouter } = await import('./cross-module-settings')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/cross-module-settings', createCrossModuleSettingsRouter(db))

    const res = await request(app)
      .patch('/api/cross-module-settings')
      .send({ key: 'pm.deal_close_auto_spawn', enabled: true })

    expect(res.status).toBe(200)
    expect(res.body.data.key).toBe('pm.deal_close_auto_spawn')
    expect(res.body.data.enabled).toBe(true)
  })

  it('rejects an unknown key', async () => {
    const db = {} as unknown as Kysely<Database>
    const { createCrossModuleSettingsRouter } = await import('./cross-module-settings')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/cross-module-settings', createCrossModuleSettingsRouter(db))

    const res = await request(app)
      .patch('/api/cross-module-settings')
      .send({ key: 'not.a.real.key', enabled: true })

    expect(res.status).toBe(400)
  })
})
