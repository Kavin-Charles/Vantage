import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'

const WORKSPACE_ID = 'ws-1'
const PROJECT_ID = 'project-1'

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    (req as any).user = { id: 'user-1', role: 'admin' }
    ;(req as any).workspace = { id: WORKSPACE_ID }
    next()
  })
}

describe('GET /api/projects/:projectId/automation-logs', () => {
  it('lists logs for rules belonging to the project, newest first', async () => {
    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: PROJECT_ID }),
    }
    const logsChain = {
      selectFrom: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([
        { id: 'log-1', rule_id: 'rule-1', rule_name: 'Notify on overdue', triggered_at: new Date(), success: true, detail: null },
      ]),
    }
    const db = {
      selectFrom: vi.fn((table: string) => (table === 'projects' ? projectChain : logsChain)),
    } as unknown as Kysely<Database>

    const { createAutomationLogsRouter } = await import('./automation')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/automation-logs', createAutomationLogsRouter(db))

    const res = await request(app).get(`/api/projects/${PROJECT_ID}/automation-logs`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].rule_name).toBe('Notify on overdue')
    expect(logsChain.orderBy).toHaveBeenCalledWith('l.triggered_at', 'desc')
  })
})
