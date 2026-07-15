import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { createSidebarRouter } from './sidebar'

const WORKSPACE_ID = 'ws-1'

function makeApp(db: Kysely<Database>, role: 'admin' | 'member' = 'admin') {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { id: 'user-1', role }
    ;(req as any).workspace = { id: WORKSPACE_ID }
    next()
  })
  app.use('/api/sidebar', createSidebarRouter(db))
  return app
}

/** Mock: selectFrom(table) → chainable → execute resolves rowsByTable[table]. */
function mockDb(rowsByTable: Record<string, unknown[]>, extra: Record<string, unknown> = {}) {
  const selectFrom = vi.fn((table: string) => {
    const chain: any = {
      select: vi.fn(() => chain),
      selectAll: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      execute: vi.fn(async () => rowsByTable[table] ?? []),
      executeTakeFirst: vi.fn(async () => (rowsByTable[table] ?? [])[0]),
    }
    return chain
  })
  return { selectFrom, ...extra } as unknown as Kysely<Database>
}

describe('GET /api/sidebar/layout', () => {
  it('returns seed groups when the workspace has no saved layout', async () => {
    const db = mockDb({ workspace_sidebar_groups: [], workspace_plugins: [] })
    const res = await request(makeApp(db)).get('/api/sidebar/layout')
    expect(res.status).toBe(200)
    expect(res.body.data.groups.map((g: any) => g.label)).toEqual(
      ['Sales', 'Infra', 'Projects', 'Insights', 'General'],
    )
  })

  it('appends enabled plugin nav keys to the default group', async () => {
    const db = mockDb({
      workspace_sidebar_groups: [],
      workspace_plugins: [
        { plugin_id: 'foo', manifest: { nav: { href: '/plugins/foo', label: 'Foo' } } },
        { plugin_id: 'bar', manifest: { surfaces: { nav: [{ path: '/home', label: 'Bar' }] } } },
      ],
    })
    const res = await request(makeApp(db)).get('/api/sidebar/layout')
    const general = res.body.data.groups.find((g: any) => g.is_default)
    expect(general.item_keys).toContain('/plugins/foo')
    expect(general.item_keys).toContain('/plugins/bar/home')
  })

  it('returns saved groups ordered by position', async () => {
    const db = mockDb({
      workspace_sidebar_groups: [
        { id: 'g1', label: 'Mine', is_default: false, item_keys: ['/pipeline'], position: 0 },
        { id: 'g2', label: 'Rest', is_default: true, item_keys: [], position: 1 },
      ],
      workspace_plugins: [],
    })
    const res = await request(makeApp(db)).get('/api/sidebar/layout')
    expect(res.body.data.groups[0].label).toBe('Mine')
    expect(res.body.data.groups[0].id).toBe('g1')
  })
})

describe('PUT /api/sidebar/layout', () => {
  const validBody = {
    groups: [
      { label: 'Sales', item_keys: ['/pipeline'], is_default: false },
      { label: 'General', item_keys: ['/dashboard'], is_default: true },
    ],
  }

  it('rejects non-admin with 403', async () => {
    const db = mockDb({})
    const res = await request(makeApp(db, 'member')).put('/api/sidebar/layout').send(validBody)
    expect(res.status).toBe(403)
  })

  it('rejects invalid layout with 400', async () => {
    const db = mockDb({})
    const res = await request(makeApp(db)).put('/api/sidebar/layout').send({
      groups: [
        { label: 'A', item_keys: ['/pipeline', '/dashboard'], is_default: true },
        { label: 'B', item_keys: ['/pipeline'], is_default: false },
      ],
    })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION')
  })

  it('persists via upsert inside a transaction and returns the merged layout', async () => {
    const trx = {
      selectFrom: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn(async () => [{ id: 'keep-1' }, { id: 'stale-1' }]),
      })),
      deleteFrom: vi.fn(() => ({
        where: vi.fn().mockReturnThis(),
        execute: vi.fn(async () => []),
      })),
      updateTable: vi.fn(() => ({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn(async () => []),
      })),
      insertInto: vi.fn(() => ({
        values: vi.fn().mockReturnThis(),
        execute: vi.fn(async () => []),
      })),
    }
    // Handler re-reads the layout after the transaction; mock returns the "saved" rows.
    const db = mockDb(
      {
        workspace_sidebar_groups: [
          { id: 'keep-1', label: 'Sales', is_default: false, item_keys: ['/pipeline'], position: 0 },
          { id: 'new-1', label: 'General', is_default: true, item_keys: ['/dashboard'], position: 1 },
        ],
        workspace_plugins: [],
      },
      { transaction: () => ({ execute: (cb: (t: unknown) => unknown) => cb(trx) }) },
    )
    const res = await request(makeApp(db)).put('/api/sidebar/layout').send({
      groups: [
        { id: 'keep-1', label: 'Sales', item_keys: ['/pipeline'], is_default: false },
        { label: 'General', item_keys: ['/dashboard'], is_default: true },
      ],
    })
    expect(res.status).toBe(200)
    expect(trx.updateTable).toHaveBeenCalled()   // keep-1 updated in place (id stable)
    expect(trx.insertInto).toHaveBeenCalled()    // new General row inserted
    expect(trx.deleteFrom).toHaveBeenCalled()    // stale-1 removed
    expect(res.body.data.groups.map((g: any) => g.label)).toEqual(['Sales', 'General'])
  })
})

describe('GET /api/sidebar/prefs', () => {
  it('returns empty prefs when no row exists', async () => {
    const db = mockDb({ user_sidebar_prefs: [] })
    const res = await request(makeApp(db, 'member')).get('/api/sidebar/prefs')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ pinned_keys: [], collapsed_group_keys: [] })
  })

  it('returns the stored row', async () => {
    const db = mockDb({
      user_sidebar_prefs: [{ pinned_keys: ['/pipeline'], collapsed_group_keys: ['g1'] }],
    })
    const res = await request(makeApp(db, 'member')).get('/api/sidebar/prefs')
    expect(res.body.data.pinned_keys).toEqual(['/pipeline'])
  })
})

describe('PUT /api/sidebar/prefs', () => {
  it('upserts and echoes the prefs', async () => {
    const chain: any = {
      values: vi.fn(() => chain),
      onConflict: vi.fn((cb: (oc: any) => any) => {
        cb({ columns: vi.fn().mockReturnThis(), doUpdateSet: vi.fn().mockReturnThis() })
        return chain
      }),
      execute: vi.fn(async () => []),
    }
    const db = mockDb({}, { insertInto: vi.fn(() => chain) })
    const res = await request(makeApp(db, 'member'))
      .put('/api/sidebar/prefs')
      .send({ pinned_keys: ['/tasks'], collapsed_group_keys: [] })
    expect(res.status).toBe(200)
    expect(res.body.data.pinned_keys).toEqual(['/tasks'])
    expect(chain.values).toHaveBeenCalled()
  })

  it('rejects malformed body with 400', async () => {
    const db = mockDb({})
    const res = await request(makeApp(db, 'member'))
      .put('/api/sidebar/prefs')
      .send({ pinned_keys: 'nope' })
    expect(res.status).toBe(400)
  })
})
