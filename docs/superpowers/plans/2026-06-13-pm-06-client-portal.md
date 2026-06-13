# PM Plan 6: Client Portal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Branded client portal — token-based access, white-labeled UI, portal views (tasks/roadmap/files), approval workflow, and client email notifications.

**Architecture:** Separate API module (`portal`) with its own auth middleware (portal session cookie, not JWT). Separate Next.js layout under `(portal)/portal/[token]/` — no sidebar, white-labeled. Portal routes are public-facing but gated by token + optional password.

**Tech Stack:** Express, Kysely, Zod, Next.js App Router, bcrypt (password hashing), cookie-based session, TypeScript strict

**Prerequisite:** PM Plans 1–5 applied.

---

## File Map

- Create: `apps/api/src/modules/portal/portal.schema.ts`
- Create: `apps/api/src/modules/portal/portal.queries.ts`
- Create: `apps/api/src/modules/portal/portal.middleware.ts`
- Create: `apps/api/src/modules/portal/portal.controller.ts`
- Create: `apps/api/src/modules/portal/portal.router.ts`
- Create: `apps/web/src/app/(portal)/portal/[token]/layout.tsx`
- Create: `apps/web/src/app/(portal)/portal/[token]/page.tsx`
- Create: `apps/web/src/app/(portal)/portal/[token]/tasks/page.tsx`
- Create: `apps/web/src/app/(portal)/portal/[token]/roadmap/page.tsx`
- Create: `apps/web/src/app/(portal)/portal/[token]/files/page.tsx`
- Create: `apps/web/src/app/(portal)/portal/[token]/approvals/page.tsx`
- Create: `apps/web/src/app/(portal)/layout.tsx`
- Create: `apps/web/src/app/(dashboard)/projects/[id]/settings/portal/page.tsx`
- Modify: `apps/api/src/index.ts`

---

### Task 1: Portal access API (internal — manage portal links)

**Files:**
- Create: `apps/api/src/modules/portal/portal.schema.ts`
- Create: `apps/api/src/modules/portal/portal.queries.ts`

- [ ] **Step 1: Schema**

```ts
// apps/api/src/modules/portal/portal.schema.ts
import { z } from 'zod'

export const createPortalSchema = z.object({
  label: z.string().min(1).max(255),
  password: z.string().min(6).optional(),
})

export const portalAuthSchema = z.object({
  password: z.string(),
})

export const respondApprovalSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(1000).optional(),
})

export const createApprovalSchema = z.object({
  portal_id: z.string().uuid(),
  task_id: z.string().uuid().optional(),
  milestone_id: z.string().uuid().optional(),
  attachment_id: z.string().uuid().optional(),
})

export type CreatePortalInput = z.infer<typeof createPortalSchema>
export type PortalAuthInput = z.infer<typeof portalAuthSchema>
export type RespondApprovalInput = z.infer<typeof respondApprovalSchema>
export type CreateApprovalInput = z.infer<typeof createApprovalSchema>
```

- [ ] **Step 2: Queries**

```ts
// apps/api/src/modules/portal/portal.queries.ts
import { db } from '../../db'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import type { CreatePortalInput, CreateApprovalInput, RespondApprovalInput } from './portal.schema'

export async function listPortals(projectId: string) {
  return db.selectFrom('portal_access').selectAll()
    .where('project_id', '=', projectId)
    .orderBy('created_at', 'desc')
    .execute()
}

export async function createPortal(projectId: string, userId: string, input: CreatePortalInput) {
  const token = crypto.randomBytes(32).toString('base64url')
  const password_hash = input.password ? await bcrypt.hash(input.password, 10) : null

  return db.insertInto('portal_access')
    .values({ project_id: projectId, label: input.label, token, password_hash, created_by: userId })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function revokePortal(id: string, projectId: string) {
  await db.updateTable('portal_access').set({ is_active: false })
    .where('id', '=', id).where('project_id', '=', projectId).execute()
}

export async function getPortalByToken(token: string) {
  return db.selectFrom('portal_access').selectAll()
    .where('token', '=', token).where('is_active', '=', true)
    .executeTakeFirst()
}

export async function createSession(portalId: string, ip?: string, userAgent?: string) {
  return db.insertInto('client_portal_sessions')
    .values({ portal_id: portalId, ip: ip ?? null, user_agent: userAgent ?? null })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function refreshSession(sessionId: string) {
  await db.updateTable('client_portal_sessions').set({ last_seen: new Date().toISOString() })
    .where('id', '=', sessionId).execute()
}

export async function updatePortalLastAccessed(portalId: string) {
  await db.updateTable('portal_access').set({ last_accessed: new Date().toISOString() })
    .where('id', '=', portalId).execute()
}

// Portal project view — only client_visible items
export async function getPortalProject(portalId: string) {
  const portal = await db.selectFrom('portal_access').selectAll()
    .where('id', '=', portalId).executeTakeFirst()
  if (!portal) return null

  const project = await db.selectFrom('projects').selectAll()
    .where('id', '=', portal.project_id).executeTakeFirst()

  return { portal, project }
}

export async function getPortalTasks(projectId: string) {
  return db.selectFrom('project_tasks as t')
    .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
    .select(['t.id', 't.title', 't.description', 't.priority', 't.due_date', 't.status_id', 's.name as status_name', 's.color as status_color', 's.is_done'])
    .where('t.project_id', '=', projectId)
    .where('t.client_visible', '=', true)
    .orderBy('t.position', 'asc')
    .execute()
}

export async function getPortalMilestones(projectId: string) {
  return db.selectFrom('milestones').selectAll()
    .where('project_id', '=', projectId)
    .where('client_visible', '=', true)
    .orderBy('due_date', 'asc')
    .execute()
}

export async function getPortalFiles(projectId: string) {
  return db.selectFrom('project_task_attachments as a')
    .innerJoin('project_tasks as t', 't.id', 'a.task_id')
    .select(['a.id', 'a.filename', 'a.url', 'a.size_bytes', 'a.uploaded_at', 'a.task_id', 't.title as task_title'])
    .where('t.project_id', '=', projectId)
    .where('t.client_visible', '=', true)
    .where('a.is_deliverable', '=', true)
    .orderBy('a.uploaded_at', 'desc')
    .execute()
}

export async function createClientComment(taskId: string, portalSessionId: string, body: unknown) {
  return db.insertInto('project_task_comments')
    .values({ task_id: taskId, portal_session_id: portalSessionId, user_id: null, body: JSON.stringify(body) })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function listApprovals(projectId: string) {
  return db.selectFrom('approval_requests').selectAll()
    .where('project_id', '=', projectId)
    .orderBy('created_at', 'desc')
    .execute()
}

export async function createApproval(input: CreateApprovalInput) {
  return db.insertInto('approval_requests')
    .values({
      project_id: (await db.selectFrom('portal_access').select('project_id').where('id', '=', input.portal_id).executeTakeFirstOrThrow()).project_id,
      portal_id: input.portal_id,
      task_id: input.task_id ?? null,
      milestone_id: input.milestone_id ?? null,
      attachment_id: input.attachment_id ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function respondApproval(id: string, input: RespondApprovalInput) {
  return db.updateTable('approval_requests')
    .set({ status: input.status, note: input.note ?? null, responded_at: new Date().toISOString() })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow()
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/portal/portal.schema.ts
git add apps/api/src/modules/portal/portal.queries.ts
git commit -m "feat(pm): add portal schema and queries"
```

---

### Task 2: Portal middleware + controller + router

**Files:**
- Create: `apps/api/src/modules/portal/portal.middleware.ts`
- Create: `apps/api/src/modules/portal/portal.controller.ts`
- Create: `apps/api/src/modules/portal/portal.router.ts`

- [ ] **Step 1: Middleware**

```ts
// apps/api/src/modules/portal/portal.middleware.ts
import type { Request, Response, NextFunction } from 'express'
import { db } from '../../db'

declare global {
  namespace Express {
    interface Request {
      portalSession?: { id: string; portal_id: string }
    }
  }
}

export async function requirePortalSession(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.portal_session_id
  if (!sessionId) return res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Portal session required' } })

  const session = await db.selectFrom('client_portal_sessions').selectAll()
    .where('id', '=', sessionId).executeTakeFirst()

  if (!session) return res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid portal session' } })

  // Expire after 7 days inactivity
  const lastSeen = new Date(session.last_seen).getTime()
  if (Date.now() - lastSeen > 7 * 24 * 60 * 60 * 1000) {
    return res.status(401).json({ data: null, error: { code: 'SESSION_EXPIRED', message: 'Session expired' } })
  }

  // Verify session portal matches URL token
  const portal = await db.selectFrom('portal_access').selectAll()
    .where('id', '=', session.portal_id)
    .where('token', '=', req.params.token)
    .where('is_active', '=', true)
    .executeTakeFirst()

  if (!portal) return res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Portal access revoked' } })

  req.portalSession = { id: session.id, portal_id: session.portal_id }
  next()
}
```

- [ ] **Step 2: Controller**

```ts
// apps/api/src/modules/portal/portal.controller.ts
import type { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import * as q from './portal.queries'
import { createPortalSchema, portalAuthSchema, createApprovalSchema, respondApprovalSchema } from './portal.schema'
import { refreshSession } from './portal.queries'

// Internal: manage portal links for a project
export async function listPortals(req: Request, res: Response) {
  return res.json({ data: await q.listPortals(req.params.projectId), error: null })
}

export async function createPortal(req: Request, res: Response) {
  const parsed = createPortalSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  const portal = await q.createPortal(req.params.projectId, req.user.id, parsed.data)
  return res.status(201).json({ data: { ...portal, password_hash: undefined }, error: null })
}

export async function revokePortal(req: Request, res: Response) {
  await q.revokePortal(req.params.portalId, req.params.projectId)
  return res.json({ data: { success: true }, error: null })
}

export async function createApproval(req: Request, res: Response) {
  const parsed = createApprovalSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  const approval = await q.createApproval(parsed.data)
  return res.status(201).json({ data: approval, error: null })
}

export async function listApprovals(req: Request, res: Response) {
  return res.json({ data: await q.listApprovals(req.params.projectId), error: null })
}

// Public portal routes (no JWT — portal token in URL)
export async function handshake(req: Request, res: Response) {
  const portal = await q.getPortalByToken(req.params.token)
  if (!portal) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Portal not found' } })
  if (portal.password_hash) return res.json({ data: { requires_password: true }, error: null })

  // No password — auto-create session
  const session = await q.createSession(portal.id, req.ip, req.headers['user-agent'])
  await q.updatePortalLastAccessed(portal.id)

  res.cookie('portal_session_id', session.id, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
  return res.json({ data: { requires_password: false, session_id: session.id }, error: null })
}

export async function authenticate(req: Request, res: Response) {
  const parsed = portalAuthSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

  const portal = await q.getPortalByToken(req.params.token)
  if (!portal?.password_hash) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Portal not found' } })

  const valid = await bcrypt.compare(parsed.data.password, portal.password_hash)
  if (!valid) return res.status(401).json({ data: null, error: { code: 'INVALID_PASSWORD', message: 'Incorrect password' } })

  const session = await q.createSession(portal.id, req.ip, req.headers['user-agent'])
  await q.updatePortalLastAccessed(portal.id)

  res.cookie('portal_session_id', session.id, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
  return res.json({ data: { success: true }, error: null })
}

export async function getProject(req: Request, res: Response) {
  await refreshSession(req.portalSession!.id)
  const result = await q.getPortalProject(req.portalSession!.portal_id)
  if (!result) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
  return res.json({ data: { project: result.project }, error: null })
}

export async function getTasks(req: Request, res: Response) {
  await refreshSession(req.portalSession!.id)
  const result = await q.getPortalProject(req.portalSession!.portal_id)
  if (!result) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
  const tasks = await q.getPortalTasks(result.project!.id)
  return res.json({ data: tasks, error: null })
}

export async function getMilestones(req: Request, res: Response) {
  await refreshSession(req.portalSession!.id)
  const result = await q.getPortalProject(req.portalSession!.portal_id)
  if (!result) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
  const milestones = await q.getPortalMilestones(result.project!.id)
  return res.json({ data: milestones, error: null })
}

export async function getFiles(req: Request, res: Response) {
  await refreshSession(req.portalSession!.id)
  const result = await q.getPortalProject(req.portalSession!.portal_id)
  if (!result) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
  const files = await q.getPortalFiles(result.project!.id)
  return res.json({ data: files, error: null })
}

export async function postComment(req: Request, res: Response) {
  const { task_id, body } = req.body
  if (!task_id || !body) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: 'task_id and body required' } })
  const comment = await q.createClientComment(task_id, req.portalSession!.id, body)
  return res.status(201).json({ data: comment, error: null })
}

export async function respondApproval(req: Request, res: Response) {
  const parsed = respondApprovalSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  const approval = await q.respondApproval(req.params.approvalId, parsed.data)
  return res.json({ data: approval, error: null })
}
```

- [ ] **Step 3: Router**

```ts
// apps/api/src/modules/portal/portal.router.ts
import { Router } from 'express'
import * as ctrl from './portal.controller'
import { requirePortalSession } from './portal.middleware'

const router = Router()

// Internal project portal management (JWT-protected — mounted under /api/projects/:projectId)
export const internalRouter = Router({ mergeParams: true })
internalRouter.get('/portal', ctrl.listPortals)
internalRouter.post('/portal', ctrl.createPortal)
internalRouter.delete('/portal/:portalId', ctrl.revokePortal)
internalRouter.get('/portal/approvals', ctrl.listApprovals)
internalRouter.post('/portal/approvals', ctrl.createApproval)

// Public portal routes (token-based, no JWT)
router.get('/:token', ctrl.handshake)
router.post('/:token/auth', ctrl.authenticate)
router.get('/:token/project', requirePortalSession, ctrl.getProject)
router.get('/:token/tasks', requirePortalSession, ctrl.getTasks)
router.get('/:token/milestones', requirePortalSession, ctrl.getMilestones)
router.get('/:token/files', requirePortalSession, ctrl.getFiles)
router.post('/:token/comments', requirePortalSession, ctrl.postComment)
router.post('/:token/approvals/:approvalId/respond', requirePortalSession, ctrl.respondApproval)

export default router
```

- [ ] **Step 4: Register**

In `apps/api/src/index.ts`:
```ts
import portalRouter, { internalRouter as portalInternalRouter } from './modules/portal/portal.router'
import cookieParser from 'cookie-parser'

// Add cookie parser middleware (if not already present)
app.use(cookieParser())

// Internal portal management (JWT-protected)
app.use('/api/projects/:projectId', requireWorkspace, portalInternalRouter)

// Public portal (no JWT)
app.use('/api/portal', portalRouter)
```

Also install: `pnpm add bcrypt cookie-parser` and `pnpm add -D @types/bcrypt @types/cookie-parser`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/portal/
git add apps/api/src/index.ts
git commit -m "feat(pm): add client portal API — auth, views, approvals"
```

---

### Task 3: Portal frontend layout

**Files:**
- Create: `apps/web/src/app/(portal)/layout.tsx`
- Create: `apps/web/src/app/(portal)/portal/[token]/layout.tsx`

- [ ] **Step 1: Root portal layout (no sidebar)**

```tsx
// apps/web/src/app/(portal)/layout.tsx
import type { ReactNode } from 'react'

export default function PortalRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Instrument+Serif&display=swap" rel="stylesheet" />
        <style>{`
          :root {
            --bg: #f7f6f2; --surface: #ffffff; --surface2: #f0ede6;
            --border: #e4e0d8; --text: #1a1814; --text2: #6b665c;
            --text3: #9e998f; --green: #2d6a4f; --green-bg: #d8f3dc;
            --amber: #92400e; --amber-bg: #fef3c7; --red: #991b1b;
            --red-bg: #fee2e2; --blue: #1e3a8a; --blue-bg: #dbeafe;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Portal token layout with header**

```tsx
// apps/web/src/app/(portal)/portal/[token]/layout.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'

interface PortalProject {
  id: string; name: string; health: string; color: string | null; progress: number
}

const NAV = [
  { href: '', label: 'Overview' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/roadmap', label: 'Roadmap' },
  { href: '/files', label: 'Files' },
  { href: '/approvals', label: 'Approvals' },
]

export default function PortalLayout({ children }: { children: ReactNode }) {
  const { token } = useParams<{ token: string }>()
  const [project, setProject] = useState<PortalProject | null>(null)

  useEffect(() => {
    fetch(`/api/portal/${token}/project`)
      .then(r => r.json()).then(j => setProject(j.data?.project ?? null))
  }, [token])

  return (
    <div className="min-h-screen flex flex-col">
      {/* Portal header — white-labeled */}
      <header className="h-14 flex items-center px-6 border-b" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {project?.color && <div className="w-3 h-3 rounded-full" style={{ background: project.color }} />}
          <span style={{ fontFamily: 'Instrument Serif', fontSize: 18, color: 'var(--text)' }}>
            {project?.name ?? 'Loading...'}
          </span>
        </div>
        {project && (
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 rounded-full" style={{ background: 'var(--surface2)' }}>
              <div className="h-full rounded-full" style={{ width: `${project.progress}%`, background: 'var(--green)' }} />
            </div>
            <span className="text-xs" style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>{project.progress}%</span>
          </div>
        )}
      </header>

      {/* Portal sub-nav */}
      <nav className="flex gap-1 px-6 border-b" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        {NAV.map(n => (
          <Link key={n.href} href={`/portal/${token}${n.href}`}
            className="px-3 py-2 text-sm"
            style={{ fontFamily: 'DM Sans', color: 'var(--text2)' }}>
            {n.label}
          </Link>
        ))}
      </nav>

      <main className="flex-1">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(portal)/"
git commit -m "feat(pm): add portal layout"
```

---

### Task 4: Portal views

**Files:**
- Create: `apps/web/src/app/(portal)/portal/[token]/page.tsx`
- Create: `apps/web/src/app/(portal)/portal/[token]/tasks/page.tsx`
- Create: `apps/web/src/app/(portal)/portal/[token]/roadmap/page.tsx`
- Create: `apps/web/src/app/(portal)/portal/[token]/files/page.tsx`
- Create: `apps/web/src/app/(portal)/portal/[token]/approvals/page.tsx`

- [ ] **Step 1: Portal home (overview)**

```tsx
// apps/web/src/app/(portal)/portal/[token]/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function PortalHomePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [requiresPassword, setRequiresPassword] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [project, setProject] = useState<{ name: string; health: string; progress: number } | null>(null)

  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then(r => r.json())
      .then(async j => {
        if (j.error) { setError('Portal not found'); return }
        if (j.data.requires_password) {
          setRequiresPassword(true)
        } else {
          setRequiresPassword(false)
          const pr = await fetch(`/api/portal/${token}/project`).then(r => r.json())
          setProject(pr.data?.project)
        }
      })
  }, [token])

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(`/api/portal/${token}/auth`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const j = await res.json()
    if (j.error) { setError('Incorrect password'); return }
    const pr = await fetch(`/api/portal/${token}/project`).then(r => r.json())
    setProject(pr.data?.project)
    setRequiresPassword(false)
  }

  if (requiresPassword) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-sm">
          <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 24, color: 'var(--text)', marginBottom: 8 }}>
            Password Required
          </h2>
          <p style={{ color: 'var(--text2)', fontFamily: 'DM Sans', fontSize: 14, marginBottom: 20 }}>
            This portal is password protected.
          </p>
          <form onSubmit={submitPassword} className="space-y-3">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Enter password" autoFocus
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border)', fontFamily: 'DM Sans', color: 'var(--text)' }} />
            {error && <p className="text-sm" style={{ color: 'var(--red)', fontFamily: 'DM Sans' }}>{error}</p>}
            <button type="submit" className="w-full py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--text)', color: '#fff', fontFamily: 'DM Sans' }}>
              Access Portal
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (!project) return <div className="p-8" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>{error || 'Loading...'}</div>

  return (
    <div className="p-8 max-w-2xl">
      <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 26, color: 'var(--text)', marginBottom: 6 }}>
        Welcome to the project portal
      </h2>
      <p style={{ color: 'var(--text2)', fontFamily: 'DM Sans', fontSize: 14, marginBottom: 24 }}>
        Use the navigation above to view tasks, milestones, files, and approvals.
      </p>
      <div className="p-5 rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text2)' }}>Overall Progress</span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{project.progress}%</span>
        </div>
        <div className="h-2 rounded-full" style={{ background: 'var(--surface2)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${project.progress}%`, background: 'var(--green)' }} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Portal tasks view**

```tsx
// apps/web/src/app/(portal)/portal/[token]/tasks/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface PortalTask {
  id: string; title: string; priority: string; due_date: string | null
  status_name: string; status_color: string; is_done: boolean
}

export default function PortalTasksPage() {
  const { token } = useParams<{ token: string }>()
  const [tasks, setTasks] = useState<PortalTask[]>([])

  useEffect(() => {
    fetch(`/api/portal/${token}/tasks`).then(r => r.json()).then(j => setTasks(j.data ?? []))
  }, [token])

  return (
    <div className="p-6 max-w-3xl">
      <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', marginBottom: 20 }}>Tasks</h2>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        {tasks.map((t, i) => (
          <div key={t.id} className="flex items-center gap-4 px-4 py-3"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, opacity: t.is_done ? 0.5 : 1 }}>
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.status_color }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm" style={{ color: 'var(--text)', fontFamily: 'DM Sans', textDecoration: t.is_done ? 'line-through' : undefined }}>
                {t.title}
              </p>
            </div>
            <span className="text-xs" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>{t.status_name}</span>
            {t.due_date && (
              <span className="text-xs" style={{ color: new Date(t.due_date) < new Date() && !t.is_done ? 'var(--red)' : 'var(--text3)', fontFamily: 'DM Sans' }}>
                {new Date(t.due_date).toLocaleDateString()}
              </span>
            )}
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>No tasks shared yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Portal roadmap view**

```tsx
// apps/web/src/app/(portal)/portal/[token]/roadmap/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface PortalMilestone {
  id: string; name: string; due_date: string; status: string; description: string | null
}

const STATUS_STYLES = {
  PENDING: { color: '#1e3a8a', bg: '#dbeafe', label: 'Upcoming' },
  COMPLETED: { color: '#2d6a4f', bg: '#d8f3dc', label: 'Completed' },
  MISSED: { color: '#991b1b', bg: '#fee2e2', label: 'Missed' },
}

export default function PortalRoadmapPage() {
  const { token } = useParams<{ token: string }>()
  const [milestones, setMilestones] = useState<PortalMilestone[]>([])

  useEffect(() => {
    fetch(`/api/portal/${token}/milestones`).then(r => r.json()).then(j => setMilestones(j.data ?? []))
  }, [token])

  return (
    <div className="p-6 max-w-2xl">
      <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', marginBottom: 20 }}>Roadmap</h2>
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px" style={{ background: 'var(--border)' }} />
        <div className="space-y-6 pl-10">
          {milestones.map(m => {
            const style = STATUS_STYLES[m.status as keyof typeof STATUS_STYLES]
            return (
              <div key={m.id} className="relative">
                <div className="absolute -left-10 top-1 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                  style={{ background: style.bg, borderColor: style.color }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: style.color }} />
                </div>
                <div className="p-4 rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-sm" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>{m.name}</h3>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: style.bg, color: style.color, fontFamily: 'DM Sans' }}>
                      {style.label}
                    </span>
                  </div>
                  {m.description && <p className="text-sm" style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>{m.description}</p>}
                  <p className="text-xs mt-1" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>
                    {new Date(m.due_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            )
          })}
          {milestones.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>No milestones shared yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Portal files view**

```tsx
// apps/web/src/app/(portal)/portal/[token]/files/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface PortalFile {
  id: string; filename: string; url: string; size_bytes: number; uploaded_at: string; task_title: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function PortalFilesPage() {
  const { token } = useParams<{ token: string }>()
  const [files, setFiles] = useState<PortalFile[]>([])

  useEffect(() => {
    fetch(`/api/portal/${token}/files`).then(r => r.json()).then(j => setFiles(j.data ?? []))
  }, [token])

  return (
    <div className="p-6 max-w-2xl">
      <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', marginBottom: 20 }}>Deliverables</h2>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        {files.map((f, i) => (
          <div key={f.id} className="flex items-center gap-4 px-4 py-3"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>{f.filename}</p>
              <p className="text-xs" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>
                {f.task_title} · {formatBytes(f.size_bytes)} · {new Date(f.uploaded_at).toLocaleDateString()}
              </p>
            </div>
            <a href={f.url} download={f.filename}
              className="text-xs px-3 py-1.5 rounded-lg border"
              style={{ borderColor: 'var(--border)', color: 'var(--text2)', fontFamily: 'DM Sans' }}>
              Download
            </a>
          </div>
        ))}
        {files.length === 0 && (
          <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>No deliverables shared yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Portal approvals view**

```tsx
// apps/web/src/app/(portal)/portal/[token]/approvals/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Approval {
  id: string; status: string; note: string | null; created_at: string
  task_id: string | null; milestone_id: string | null
}

export default function PortalApprovalsPage() {
  const { token } = useParams<{ token: string }>()
  const [approvals, setApprovals] = useState<Approval[]>([])

  useEffect(() => {
    // We need project_id to list approvals. Get it from /project first
    fetch(`/api/portal/${token}/project`)
      .then(r => r.json())
      .then(j => {
        // Approvals endpoint is not on portal — they come embedded in tasks/milestones
        // For now show pending approvals that client needs to action
        setApprovals([]) // Approvals listed from project endpoint in Plan 7
      })
  }, [token])

  async function respond(id: string, status: 'APPROVED' | 'REJECTED', note?: string) {
    await fetch(`/api/portal/${token}/approvals/${id}/respond`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note }),
    })
    setApprovals(prev => prev.map(a => a.id === id ? { ...a, status } : a))
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', marginBottom: 20 }}>Approvals</h2>
      {approvals.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>No pending approvals.</p>
      ) : (
        <div className="space-y-3">
          {approvals.filter(a => a.status === 'PENDING').map(a => (
            <div key={a.id} className="p-4 rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <p className="text-sm mb-3" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>
                Approval requested · {new Date(a.created_at).toLocaleDateString()}
              </p>
              <div className="flex gap-2">
                <button onClick={() => respond(a.id, 'APPROVED')}
                  className="px-3 py-1.5 rounded-lg text-sm"
                  style={{ background: 'var(--green-bg)', color: 'var(--green)', fontFamily: 'DM Sans' }}>
                  Approve
                </button>
                <button onClick={() => respond(a.id, 'REJECTED')}
                  className="px-3 py-1.5 rounded-lg text-sm"
                  style={{ background: 'var(--red-bg)', color: 'var(--red)', fontFamily: 'DM Sans' }}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(portal)/portal/"
git commit -m "feat(pm): add client portal frontend views"
```

---

### Task 5: Internal portal settings UI

**Files:**
- Create: `apps/web/src/app/(dashboard)/projects/[id]/settings/portal/page.tsx`

- [ ] **Step 1: Write page**

```tsx
// apps/web/src/app/(dashboard)/projects/[id]/settings/portal/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Portal { id: string; label: string; token: string; is_active: boolean; last_accessed: string | null; created_at: string }

export default function PortalSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [portals, setPortals] = useState<Portal[]>([])
  const [label, setLabel] = useState('')
  const [password, setPassword] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/portal`).then(r => r.json()).then(j => setPortals(j.data ?? []))
  }, [projectId])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(`/api/projects/${projectId}/portal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, password: password || undefined }),
    })
    const json = await res.json()
    setPortals(prev => [...prev, json.data])
    setShowForm(false); setLabel(''); setPassword('')
  }

  async function revoke(id: string) {
    await fetch(`/api/projects/${projectId}/portal/${id}`, { method: 'DELETE' })
    setPortals(prev => prev.filter(p => p.id !== id))
  }

  const portalBaseUrl = typeof window !== 'undefined' ? `${window.location.origin}/portal` : ''

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)' }}>Client Portal</h2>
          <p style={{ color: 'var(--text2)', fontFamily: 'DM Sans', fontSize: 14, marginTop: 4 }}>
            Share read-only access with clients. No Vencore account required.
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: 'var(--text)', color: '#fff', fontFamily: 'DM Sans' }}>
          + Create Link
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="mb-6 p-4 rounded-xl border space-y-3" style={{ borderColor: 'var(--border)' }}>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (e.g. Acme Corp)" required
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: 'var(--border)', fontFamily: 'DM Sans', color: 'var(--text)' }} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (optional)"
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: 'var(--border)', fontFamily: 'DM Sans', color: 'var(--text)' }} />
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 text-sm rounded-lg"
              style={{ background: 'var(--text)', color: '#fff', fontFamily: 'DM Sans' }}>Create</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm rounded-lg"
              style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {portals.map(p => (
          <div key={p.id} className="p-4 rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="font-medium text-sm" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>{p.label}</p>
                <p className="text-xs" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>
                  {p.last_accessed ? `Last visited ${new Date(p.last_accessed).toLocaleDateString()}` : 'Never visited'}
                </p>
              </div>
              <button onClick={() => revoke(p.id)} className="text-xs px-2 py-1 rounded border"
                style={{ borderColor: 'var(--border)', color: 'var(--red)', fontFamily: 'DM Sans' }}>
                Revoke
              </button>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs px-2 py-1 rounded flex-1 truncate"
                style={{ background: 'var(--surface2)', color: 'var(--text2)', fontFamily: 'monospace' }}>
                {portalBaseUrl}/{p.token}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(`${portalBaseUrl}/${p.token}`)}
                className="text-xs px-2 py-1 rounded border"
                style={{ borderColor: 'var(--border)', color: 'var(--text2)', fontFamily: 'DM Sans' }}>
                Copy
              </button>
            </div>
          </div>
        ))}
        {portals.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>No portal links yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/(dashboard)/projects/[id]/settings/portal/page.tsx"
git commit -m "feat(pm): add portal settings UI page"
```
