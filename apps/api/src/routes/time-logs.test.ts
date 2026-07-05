import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'

vi.mock('../lib/log-activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }))

import { logActivity } from '../lib/log-activity'

const WORKSPACE_ID = 'ws-1'
const USER_ID = 'user-1'
const PROJECT_ID = 'project-1'
const TASK_ID = 'task-1'

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    (req as any).user = { id: USER_ID, role: 'admin' };
    (req as any).workspace = { id: WORKSPACE_ID };
    next();
  })
}

function buildChain(overrides: Record<string, unknown> = {}) {
  return {
    selectFrom: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    executeTakeFirstOrThrow: vi.fn().mockResolvedValue({}),
    ...overrides,
  }
}

describe('POST /api/projects/:projectId/tasks/:taskId/time-logs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs pm_time_logged after creating a time log', async () => {
    const projectChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ id: PROJECT_ID }) })
    const logChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'log-1', task_id: TASK_ID, minutes: 45 }),
    })
    const db = {
      selectFrom: vi.fn(() => projectChain),
      insertInto: vi.fn(() => logChain),
    } as unknown as Kysely<Database>

    const { createTimeLogsRouter } = await import('./time-logs')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/tasks/:taskId/time-logs', createTimeLogsRouter(db))

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/tasks/${TASK_ID}/time-logs`)
      .send({ minutes: 45 })

    expect(res.status).toBe(201)
    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        workspace_id: WORKSPACE_ID,
        user_id: USER_ID,
        type: 'pm_time_logged',
        source_module_id: 'projects',
        record_id: TASK_ID,
      }),
    )
  })
})
