import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'

const WORKSPACE_ID = 'ws-1'

function injectUser(app: express.Express, opts: { admin: boolean }) {
  app.use((req, _res, next) => {
    ;(req as any).user = { id: 'user-1', role: opts.admin ? 'admin' : 'member' }
    ;(req as any).workspace = { id: WORKSPACE_ID }
    ;(req as any).isAdmin = opts.admin
    ;(req as any).permissions = new Set<string>()
    next()
  })
}

describe('GET /api/settings/crm', () => {
  it('returns defaults when no row is stored', async () => {
    const chain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    }
    const db = chain as unknown as Kysely<Database>

    const { createCrmSettingsRouter } = await import('./crm-settings')
    const app = express()
    app.use(express.json())
    injectUser(app, { admin: false })
    app.use('/api/settings/crm', createCrmSettingsRouter(db))

    const res = await request(app).get('/api/settings/crm')

    expect(res.status).toBe(200)
    expect(res.body.error).toBeNull()
    expect(res.body.data).toEqual({
      defaultPipelineId: '',
      defaultPageSize: 25,
      showCompanyColumn: true,
      showOwnerColumn: true,
    })
    expect(chain.where).toHaveBeenCalledWith('workspace_id', '=', WORKSPACE_ID)
    expect(chain.where).toHaveBeenCalledWith('setting_key', '=', 'crm.preferences')
  })

  it('returns the stored config merged over defaults', async () => {
    const stored = {
      defaultPipelineId: 'pipeline-1',
      defaultPageSize: 50,
      showCompanyColumn: false,
      showOwnerColumn: true,
    }
    const chain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ config: stored }),
    }
    const db = chain as unknown as Kysely<Database>

    const { createCrmSettingsRouter } = await import('./crm-settings')
    const app = express()
    app.use(express.json())
    injectUser(app, { admin: false })
    app.use('/api/settings/crm', createCrmSettingsRouter(db))

    const res = await request(app).get('/api/settings/crm')

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual(stored)
  })
})

describe('PUT /api/settings/crm', () => {
  const validBody = {
    defaultPipelineId: 'pipeline-2',
    defaultPageSize: 10,
    showCompanyColumn: true,
    showOwnerColumn: false,
  }

  it('rejects non-admins', async () => {
    const db = {} as unknown as Kysely<Database>
    const { createCrmSettingsRouter } = await import('./crm-settings')
    const app = express()
    app.use(express.json())
    injectUser(app, { admin: false })
    app.use('/api/settings/crm', createCrmSettingsRouter(db))

    const res = await request(app).put('/api/settings/crm').send(validBody)

    expect(res.status).toBe(403)
    expect(res.body.data).toBeNull()
  })

  it('rejects an invalid body', async () => {
    const db = {} as unknown as Kysely<Database>
    const { createCrmSettingsRouter } = await import('./crm-settings')
    const app = express()
    app.use(express.json())
    injectUser(app, { admin: true })
    app.use('/api/settings/crm', createCrmSettingsRouter(db))

    const res = await request(app)
      .put('/api/settings/crm')
      .send({ defaultPipelineId: 'p1', defaultPageSize: 'not-a-number', showCompanyColumn: true, showOwnerColumn: true })

    expect(res.status).toBe(400)
    expect(res.body.data).toBeNull()
  })

  it('upserts the preferences for admins', async () => {
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

    const { createCrmSettingsRouter } = await import('./crm-settings')
    const app = express()
    app.use(express.json())
    injectUser(app, { admin: true })
    app.use('/api/settings/crm', createCrmSettingsRouter(db))

    const res = await request(app).put('/api/settings/crm').send(validBody)

    expect(res.status).toBe(200)
    expect(res.body.error).toBeNull()
    expect(res.body.data).toEqual(validBody)
    expect(chain.insertInto).toHaveBeenCalledWith('cross_module_settings')
    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WORKSPACE_ID,
        setting_key: 'crm.preferences',
        enabled: true,
        config: validBody,
      }),
    )
  })
})
