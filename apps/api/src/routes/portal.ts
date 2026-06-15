import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'
import type { Request, Response, NextFunction } from 'express'

// ── Zod schemas ──────────────────────────────────────────────────────────────

const createPortalSchema = z.object({
  label: z.string().min(1).max(255),
  password: z.string().min(6).optional(),
})

const portalAuthSchema = z.object({
  password: z.string(),
})

const createApprovalSchema = z.object({
  portal_id: z.string().uuid(),
  task_id: z.string().uuid().optional(),
  milestone_id: z.string().uuid().optional(),
  attachment_id: z.string().uuid().optional(),
})

const respondApprovalSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().optional(),
})

// ── Cookie constants ─────────────────────────────────────────────────────────

const SESSION_COOKIE = 'portal_session_id'
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ── Portal column selection (no password_hash) ───────────────────────────────

const PORTAL_COLUMNS = [
  'id', 'project_id', 'label', 'token', 'is_active', 'last_accessed', 'created_by', 'created_at',
] as const

// ── Internal management router ───────────────────────────────────────────────
// Mounted at: /api/projects/:projectId/portal (JWT-protected via requireAuth)

export function createPortalInternalRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  // GET / — list portals for project
  router.get('/', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest
      const { projectId } = req.params as { projectId: string }

      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const portals = await db.selectFrom('portal_access')
        .select(PORTAL_COLUMNS)
        .where('project_id', '=', projectId)
        .orderBy('created_at', 'desc')
        .execute()

      return res.json({ data: portals, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // POST / — create portal link
  router.post('/', async (req, res) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest
      const { projectId } = req.params as { projectId: string }

      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const parsed = createPortalSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

      const token = randomBytes(32).toString('hex')
      const password_hash = parsed.data.password
        ? await bcrypt.hash(parsed.data.password, 12)
        : null

      const portal = await db.insertInto('portal_access')
        .values({
          project_id: projectId,
          label: parsed.data.label,
          token,
          password_hash,
          created_by: user.id,
        })
        .returning(PORTAL_COLUMNS)
        .executeTakeFirstOrThrow()

      return res.status(201).json({ data: portal, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // DELETE /:portalId — revoke portal
  router.delete('/:portalId', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest
      const { projectId, portalId } = req.params as { projectId: string; portalId: string }

      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      await db.updateTable('portal_access')
        .set({ is_active: false })
        .where('id', '=', portalId)
        .where('project_id', '=', projectId)
        .execute()

      return res.json({ data: { success: true }, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // GET /approvals — list approval requests for project
  router.get('/approvals', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest
      const { projectId } = req.params as { projectId: string }

      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const approvals = await db.selectFrom('approval_requests')
        .selectAll()
        .where('project_id', '=', projectId)
        .orderBy('created_at', 'desc')
        .execute()

      return res.json({ data: approvals, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // POST /approvals — create approval request
  router.post('/approvals', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest
      const { projectId } = req.params as { projectId: string }

      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const parsed = createApprovalSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

      const approval = await db.insertInto('approval_requests')
        .values({
          project_id: projectId,
          portal_id: parsed.data.portal_id,
          task_id: parsed.data.task_id ?? null,
          milestone_id: parsed.data.milestone_id ?? null,
          attachment_id: parsed.data.attachment_id ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      return res.status(201).json({ data: approval, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  return router
}

// ── Public portal router ──────────────────────────────────────────────────────
// Mounted at: /api/portal (no requireAuth)

export function createPortalRouter(db: Kysely<Database>): Router {
  const router = Router()

  // ── Portal session middleware (closes over db) ──────────────────────────────
  async function requirePortalSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { token } = req.params as { token: string }
    const sessionId = req.cookies[SESSION_COOKIE] as string | undefined

    if (!sessionId) {
      res.status(401).json({ data: null, error: { code: 'PORTAL_AUTH_REQUIRED', message: 'Portal session required' } })
      return
    }

    const session = await db.selectFrom('client_portal_sessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirst()

    if (!session) {
      res.status(401).json({ data: null, error: { code: 'PORTAL_AUTH_REQUIRED', message: 'Invalid session' } })
      return
    }

    // Check session not expired (7 days since last_seen)
    const now = new Date()
    const lastSeen = new Date(session.last_seen)
    if (now.getTime() - lastSeen.getTime() > SESSION_MAX_AGE_MS) {
      res.status(401).json({ data: null, error: { code: 'PORTAL_SESSION_EXPIRED', message: 'Session expired' } })
      return
    }

    // Verify this session belongs to the portal with this token
    const portal = await db.selectFrom('portal_access')
      .select(PORTAL_COLUMNS)
      .where('id', '=', session.portal_id)
      .where('token', '=', token)
      .where('is_active', '=', true)
      .executeTakeFirst()

    if (!portal) {
      res.status(401).json({ data: null, error: { code: 'PORTAL_AUTH_REQUIRED', message: 'Portal not found or inactive' } })
      return
    }

    // Refresh last_seen
    await db.updateTable('client_portal_sessions')
      .set({ last_seen: now })
      .where('id', '=', sessionId)
      .execute()

    ;(req as Request & { portal: typeof portal; session: typeof session }).portal = portal
    ;(req as Request & { portal: typeof portal; session: typeof session }).session = session
    next()
  }

  // GET /:token — handshake
  router.get('/:token', async (req, res) => {
    try {
      const { token } = req.params as { token: string }

      const portal = await db.selectFrom('portal_access')
        .select([...PORTAL_COLUMNS, 'password_hash'])
        .where('token', '=', token)
        .where('is_active', '=', true)
        .executeTakeFirst()

      if (!portal) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Portal not found' } })

      const requires_password = portal.password_hash !== null

      // If no password required, auto-create session
      if (!requires_password) {
        const sessionId = req.cookies[SESSION_COOKIE] as string | undefined
        let session = sessionId
          ? await db.selectFrom('client_portal_sessions').selectAll().where('id', '=', sessionId).executeTakeFirst()
          : null

        if (!session || session.portal_id !== portal.id) {
          session = await db.insertInto('client_portal_sessions')
            .values({
              portal_id: portal.id,
              ip: req.ip ?? null,
              user_agent: req.headers['user-agent'] ?? null,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

          res.cookie(SESSION_COOKIE, session.id, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env['NODE_ENV'] === 'production' && process.env['COOKIE_SECURE'] !== 'false',
            maxAge: SESSION_MAX_AGE_MS,
          })
        }

        // Update last_accessed on portal
        await db.updateTable('portal_access')
          .set({ last_accessed: new Date() })
          .where('id', '=', portal.id)
          .execute()
      }

      return res.json({ data: { requires_password, label: portal.label }, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // POST /:token/auth — authenticate with password
  router.post('/:token/auth', async (req, res) => {
    try {
      const { token } = req.params as { token: string }

      const portal = await db.selectFrom('portal_access')
        .select([...PORTAL_COLUMNS, 'password_hash'])
        .where('token', '=', token)
        .where('is_active', '=', true)
        .executeTakeFirst()

      if (!portal) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Portal not found' } })

      const parsed = portalAuthSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

      if (!portal.password_hash) return res.status(400).json({ data: null, error: { code: 'NO_PASSWORD', message: 'This portal has no password' } })

      const valid = await bcrypt.compare(parsed.data.password, portal.password_hash)
      if (!valid) return res.status(401).json({ data: null, error: { code: 'INVALID_PASSWORD', message: 'Incorrect password' } })

      const session = await db.insertInto('client_portal_sessions')
        .values({
          portal_id: portal.id,
          ip: req.ip ?? null,
          user_agent: req.headers['user-agent'] ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      await db.updateTable('portal_access')
        .set({ last_accessed: new Date() })
        .where('id', '=', portal.id)
        .execute()

      res.cookie(SESSION_COOKIE, session.id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env['NODE_ENV'] === 'production' && process.env['COOKIE_SECURE'] !== 'false',
        maxAge: SESSION_MAX_AGE_MS,
      })

      return res.json({ data: { success: true }, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // GET /:token/project — get project info
  router.get('/:token/project', requirePortalSession, async (req, res) => {
    try {
      const portalReq = req as Request & { portal: { project_id: string } }

      const project = await db.selectFrom('projects')
        .select(['id', 'name', 'description', 'color', 'health', 'start_date', 'end_date', 'status'])
        .where('id', '=', portalReq.portal.project_id)
        .executeTakeFirst()

      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      // Compute progress from tasks
      const tasks = await db.selectFrom('project_tasks as t')
        .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
        .select(['s.is_done'])
        .where('t.project_id', '=', project.id)
        .execute()

      const total = tasks.length
      const done = tasks.filter(t => t.is_done).length
      const progress = total > 0 ? Math.round((done / total) * 100) : 0

      return res.json({ data: { ...project, progress }, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // GET /:token/tasks — get client_visible tasks
  router.get('/:token/tasks', requirePortalSession, async (req, res) => {
    try {
      const portalReq = req as Request & { portal: { project_id: string } }

      const tasks = await db.selectFrom('project_tasks as t')
        .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
        .select([
          't.id', 't.title', 't.description', 't.priority', 't.due_date',
          's.name as status_name', 's.color as status_color', 's.is_done',
        ])
        .where('t.project_id', '=', portalReq.portal.project_id)
        .where('t.client_visible', '=', true)
        .orderBy('t.position', 'asc')
        .execute()

      return res.json({ data: tasks, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // GET /:token/milestones — get client_visible milestones
  router.get('/:token/milestones', requirePortalSession, async (req, res) => {
    try {
      const portalReq = req as Request & { portal: { project_id: string } }

      const milestones = await db.selectFrom('milestones')
        .select(['id', 'name', 'description', 'due_date', 'status', 'position'])
        .where('project_id', '=', portalReq.portal.project_id)
        .where('client_visible', '=', true)
        .orderBy('position', 'asc')
        .execute()

      return res.json({ data: milestones, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // GET /:token/files — get deliverable attachments
  router.get('/:token/files', requirePortalSession, async (req, res) => {
    try {
      const portalReq = req as Request & { portal: { project_id: string } }

      const files = await db.selectFrom('project_task_attachments as a')
        .innerJoin('project_tasks as t', 't.id', 'a.task_id')
        .select([
          'a.id', 'a.task_id', 'a.filename', 'a.url', 'a.size_bytes', 'a.uploaded_at',
          't.title as task_title',
        ])
        .where('t.project_id', '=', portalReq.portal.project_id)
        .where('a.is_deliverable', '=', true)
        .orderBy('a.uploaded_at', 'desc')
        .execute()

      return res.json({ data: files, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // POST /:token/comments — post client comment
  router.post('/:token/comments', requirePortalSession, async (req, res) => {
    try {
      const portalReq = req as Request & { portal: { project_id: string }; session: { id: string } }
      const { task_id, body } = req.body as { task_id?: string; body?: string }

      if (!body?.trim()) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: 'body is required' } })
      if (!task_id) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: 'task_id is required' } })

      // Verify task belongs to this project and is client_visible
      const task = await db.selectFrom('project_tasks').select('id')
        .where('id', '=', task_id)
        .where('project_id', '=', portalReq.portal.project_id)
        .where('client_visible', '=', true)
        .executeTakeFirst()

      if (!task) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } })

      const comment = await db.insertInto('project_task_comments')
        .values({
          task_id,
          user_id: null,
          portal_session_id: portalReq.session.id,
          body: body.trim(),
          parent_id: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      return res.status(201).json({ data: comment, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // GET /:token/approvals — list approvals for this portal
  router.get('/:token/approvals', requirePortalSession, async (req, res) => {
    try {
      const portalReq = req as Request & { portal: { id: string; project_id: string } }

      const approvals = await db.selectFrom('approval_requests')
        .selectAll()
        .where('portal_id', '=', portalReq.portal.id)
        .where('project_id', '=', portalReq.portal.project_id)
        .orderBy('created_at', 'desc')
        .execute()

      return res.json({ data: approvals, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // POST /:token/approvals/:approvalId/respond — approve or reject
  router.post('/:token/approvals/:approvalId/respond', requirePortalSession, async (req, res) => {
    try {
      const portalReq = req as Request & { portal: { id: string; project_id: string } }
      const { approvalId } = req.params as { approvalId: string }

      const parsed = respondApprovalSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

      const approval = await db.selectFrom('approval_requests').selectAll()
        .where('id', '=', approvalId)
        .where('portal_id', '=', portalReq.portal.id)
        .where('project_id', '=', portalReq.portal.project_id)
        .executeTakeFirst()

      if (!approval) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Approval not found' } })
      if (approval.status !== 'PENDING') return res.status(409).json({ data: null, error: { code: 'ALREADY_RESPONDED', message: 'Already responded to this approval' } })

      const updated = await db.updateTable('approval_requests')
        .set({
          status: parsed.data.status,
          note: parsed.data.note ?? null,
          responded_at: new Date(),
        })
        .where('id', '=', approvalId)
        .returningAll()
        .executeTakeFirstOrThrow()

      return res.json({ data: updated, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  return router
}
