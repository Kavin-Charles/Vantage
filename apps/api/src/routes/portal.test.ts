import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { signApprovalToken } from '../lib/approval-token'

const SECRET = 'test-secret'
const APPROVAL_ID = 'approval-1'

vi.mock('../lib/pm-events', () => ({ pmEvents: { emit: vi.fn() } }))
vi.mock('../lib/log-activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }))

describe('GET /api/portal/approve/:token', () => {
  it('returns approval context for a valid token', async () => {
    const token = signApprovalToken({ aid: APPROVAL_ID, act: 'approve' }, SECRET)

    const chain = {
      selectFrom: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: APPROVAL_ID, status: 'PENDING', task_id: null, milestone_id: null, project_name: 'Acme' }),
    }
    const db = chain as unknown as Kysely<Database>

    const { createPortalRouter } = await import('./portal')
    const app = express()
    app.use(express.json())
    app.use('/api/portal', createPortalRouter(db, SECRET))

    const res = await request(app).get(`/api/portal/approve/${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.action).toBe('approve')
    expect(res.body.data.already_responded).toBe(false)
    expect(res.body.data.project_name).toBe('Acme')
  })

  it('returns 401 for an invalid token', async () => {
    const db = {} as unknown as Kysely<Database>
    const { createPortalRouter } = await import('./portal')
    const app = express()
    app.use(express.json())
    app.use('/api/portal', createPortalRouter(db, SECRET))

    const res = await request(app).get('/api/portal/approve/not-a-real-token')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('TOKEN_INVALID')
  })
})

describe('POST /api/portal/approve/:token', () => {
  it('applies the embedded action and logs activity + emits pmEvents', async () => {
    const { pmEvents } = await import('../lib/pm-events')
    const { logActivity } = await import('../lib/log-activity')
    const token = signApprovalToken({ aid: APPROVAL_ID, act: 'approve' }, SECRET)

    const lookupChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: APPROVAL_ID, status: 'PENDING' }),
    }
    const updateChain = {
      updateTable: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: APPROVAL_ID, project_id: 'project-1', status: 'APPROVED' }),
    }
    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ workspace_id: 'ws-1' }),
    }

    let selectCall = 0
    const db = {
      selectFrom: vi.fn(() => {
        selectCall++
        return selectCall === 1 ? lookupChain : projectChain
      }),
      updateTable: vi.fn(() => updateChain),
    } as unknown as Kysely<Database>

    const { createPortalRouter } = await import('./portal')
    const app = express()
    app.use(express.json())
    app.use('/api/portal', createPortalRouter(db, SECRET))

    const res = await request(app).post(`/api/portal/approve/${token}`).send({})

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('APPROVED')
    expect(pmEvents.emit).toHaveBeenCalledWith('pm', expect.objectContaining({ type: 'client_approved', approvalId: APPROVAL_ID }))
    expect(logActivity).toHaveBeenCalledWith(db, expect.objectContaining({ type: 'pm_approval_responded' }))
  })

  it('returns 409 if the approval was already responded to', async () => {
    const token = signApprovalToken({ aid: APPROVAL_ID, act: 'approve' }, SECRET)
    const lookupChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: APPROVAL_ID, status: 'APPROVED' }),
    }
    const db = { selectFrom: vi.fn(() => lookupChain) } as unknown as Kysely<Database>

    const { createPortalRouter } = await import('./portal')
    const app = express()
    app.use(express.json())
    app.use('/api/portal', createPortalRouter(db, SECRET))

    const res = await request(app).post(`/api/portal/approve/${token}`).send({})
    expect(res.status).toBe(409)
  })
})
