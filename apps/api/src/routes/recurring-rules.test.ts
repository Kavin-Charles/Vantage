import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'

const WORKSPACE_ID = 'ws-1'
const USER_ID = 'user-1'
const PROJECT_ID = 'project-1'
const RULE_ID = 'rule-1'

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    (req as any).user = { id: USER_ID, role: 'admin' }
    ;(req as any).workspace = { id: WORKSPACE_ID }
    next()
  })
}

describe('GET /api/projects/:projectId/recurring-rules', () => {
  it('returns 404 when project is not found in workspace', async () => {
    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    }
    const db = { selectFrom: vi.fn(() => projectChain) } as unknown as Kysely<Database>

    const { createRecurringRulesRouter } = await import('./recurring-rules')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/recurring-rules', createRecurringRulesRouter(db))

    const res = await request(app).get(`/api/projects/${PROJECT_ID}/recurring-rules`)

    expect(res.status).toBe(404)
  })

  it('lists rules for the project', async () => {
    const fakeRules = [
      { id: RULE_ID, project_id: PROJECT_ID, title: 'Weekly standup notes', frequency: 'WEEKLY' },
    ]

    let call = 0
    const db = {
      selectFrom: vi.fn((table: string) => {
        call += 1
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue({ id: PROJECT_ID }),
          }
        }
        return {
          selectAll: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          execute: vi.fn().mockResolvedValue(fakeRules),
        }
      }),
    } as unknown as Kysely<Database>

    const { createRecurringRulesRouter } = await import('./recurring-rules')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/recurring-rules', createRecurringRulesRouter(db))

    const res = await request(app).get(`/api/projects/${PROJECT_ID}/recurring-rules`)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual(fakeRules)
    expect(call).toBeGreaterThan(0)
  })
})

describe('POST /api/projects/:projectId/recurring-rules', () => {
  it('creates a rule with a computed next_run_at and returns 201', async () => {
    const fakeRule = {
      id: RULE_ID, project_id: PROJECT_ID, title: 'Weekly standup notes',
      description: null, status_id: null, priority: 'NONE', assignee_ids: null,
      frequency: 'WEEKLY', interval: 1, next_run_at: new Date(), is_active: true,
      created_by: USER_ID, created_at: new Date(), updated_at: new Date(),
    }

    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: PROJECT_ID }),
    }
    const ruleChain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue(fakeRule),
    }
    const db = {
      selectFrom: vi.fn(() => projectChain),
      insertInto: vi.fn(() => ruleChain),
    } as unknown as Kysely<Database>

    const { createRecurringRulesRouter } = await import('./recurring-rules')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/recurring-rules', createRecurringRulesRouter(db))

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/recurring-rules`)
      .send({ title: 'Weekly standup notes', frequency: 'WEEKLY', interval: 1 })

    expect(res.status).toBe(201)
    expect(res.body.data.frequency).toBe('WEEKLY')
    expect(ruleChain.values).toHaveBeenCalledWith(expect.objectContaining({
      project_id: PROJECT_ID, title: 'Weekly standup notes', frequency: 'WEEKLY', created_by: USER_ID,
    }))
  })

  it('rejects an invalid frequency with 400', async () => {
    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: PROJECT_ID }),
    }
    const db = { selectFrom: vi.fn(() => projectChain) } as unknown as Kysely<Database>

    const { createRecurringRulesRouter } = await import('./recurring-rules')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/recurring-rules', createRecurringRulesRouter(db))

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/recurring-rules`)
      .send({ title: 'x', frequency: 'YEARLY', interval: 1 })

    expect(res.status).toBe(400)
  })

  it('rejects a missing title with 400', async () => {
    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: PROJECT_ID }),
    }
    const db = { selectFrom: vi.fn(() => projectChain) } as unknown as Kysely<Database>

    const { createRecurringRulesRouter } = await import('./recurring-rules')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/recurring-rules', createRecurringRulesRouter(db))

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/recurring-rules`)
      .send({ title: '', frequency: 'DAILY', interval: 1 })

    expect(res.status).toBe(400)
  })

  it('returns 404 when project is not found in workspace', async () => {
    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    }
    const db = { selectFrom: vi.fn(() => projectChain) } as unknown as Kysely<Database>

    const { createRecurringRulesRouter } = await import('./recurring-rules')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/recurring-rules', createRecurringRulesRouter(db))

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/recurring-rules`)
      .send({ title: 'x', frequency: 'DAILY', interval: 1 })

    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/projects/:projectId/recurring-rules/:ruleId', () => {
  it('deactivates a rule', async () => {
    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: PROJECT_ID }),
    }
    const updateChain = {
      updateTable: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: RULE_ID, is_active: false }),
    }
    const db = {
      selectFrom: vi.fn(() => projectChain),
      updateTable: vi.fn(() => updateChain),
    } as unknown as Kysely<Database>

    const { createRecurringRulesRouter } = await import('./recurring-rules')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/recurring-rules', createRecurringRulesRouter(db))

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/recurring-rules/${RULE_ID}`)
      .send({ is_active: false })

    expect(res.status).toBe(200)
    expect(res.body.data.is_active).toBe(false)
  })

  it('returns 404 when rule does not exist', async () => {
    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: PROJECT_ID }),
    }
    const updateChain = {
      updateTable: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    }
    const db = {
      selectFrom: vi.fn(() => projectChain),
      updateTable: vi.fn(() => updateChain),
    } as unknown as Kysely<Database>

    const { createRecurringRulesRouter } = await import('./recurring-rules')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/recurring-rules', createRecurringRulesRouter(db))

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/recurring-rules/${RULE_ID}`)
      .send({ is_active: false })

    expect(res.status).toBe(404)
  })

  it('rejects an invalid priority with 400', async () => {
    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: PROJECT_ID }),
    }
    const db = { selectFrom: vi.fn(() => projectChain) } as unknown as Kysely<Database>

    const { createRecurringRulesRouter } = await import('./recurring-rules')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/recurring-rules', createRecurringRulesRouter(db))

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/recurring-rules/${RULE_ID}`)
      .send({ priority: 'CRITICAL' })

    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/projects/:projectId/recurring-rules/:ruleId', () => {
  it('deletes a rule and returns success', async () => {
    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: PROJECT_ID }),
    }
    const deleteChain = {
      deleteFrom: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    }
    const db = {
      selectFrom: vi.fn(() => projectChain),
      deleteFrom: vi.fn(() => deleteChain),
    } as unknown as Kysely<Database>

    const { createRecurringRulesRouter } = await import('./recurring-rules')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/recurring-rules', createRecurringRulesRouter(db))

    const res = await request(app).delete(`/api/projects/${PROJECT_ID}/recurring-rules/${RULE_ID}`)

    expect(res.status).toBe(200)
    expect(res.body.data.success).toBe(true)
    expect(deleteChain.where).toHaveBeenCalledWith('id', '=', RULE_ID)
  })

  it('returns 404 when project is not found in workspace', async () => {
    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    }
    const db = { selectFrom: vi.fn(() => projectChain) } as unknown as Kysely<Database>

    const { createRecurringRulesRouter } = await import('./recurring-rules')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/recurring-rules', createRecurringRulesRouter(db))

    const res = await request(app).delete(`/api/projects/${PROJECT_ID}/recurring-rules/${RULE_ID}`)

    expect(res.status).toBe(404)
  })
})

describe('computeNextRun', () => {
  it('adds days for DAILY frequency', async () => {
    const { computeNextRun } = await import('./recurring-rules')
    const from = new Date(Date.UTC(2026, 0, 1))
    const next = computeNextRun(from, 'DAILY', 3)
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 0, 4)).toISOString())
  })

  it('adds weeks for WEEKLY frequency', async () => {
    const { computeNextRun } = await import('./recurring-rules')
    const from = new Date(Date.UTC(2026, 0, 1))
    const next = computeNextRun(from, 'WEEKLY', 2)
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 0, 15)).toISOString())
  })

  it('adds months for MONTHLY frequency', async () => {
    const { computeNextRun } = await import('./recurring-rules')
    const from = new Date(Date.UTC(2026, 0, 1))
    const next = computeNextRun(from, 'MONTHLY', 1)
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 1, 1)).toISOString())
  })
})
