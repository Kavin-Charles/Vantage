# PM Plan 9: Analytics, Wiki/Docs, Search & Templates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project health dashboard with burndown/velocity charts, per-project wiki with rich text editing, global PM search (tasks + docs + projects), and project templates for one-click project scaffolding.

**Architecture:** Analytics computed server-side from DB aggregates (no external analytics lib). Wiki docs stored as JSON content (ProseMirror-compatible) in `project_docs` table. Search uses PostgreSQL full-text search with `tsvector`. Templates stored in `project_templates` table; applying a template inserts seed data via a transaction.

**Tech Stack:** Express, Kysely, Zod, Next.js 15 App Router, TypeScript strict, PostgreSQL FTS (`to_tsvector`, `to_tsquery`)

**Prerequisite:** PM Plans 1–8 applied.

---

## File Map

- Create: `apps/api/src/modules/pm-analytics/pm-analytics.queries.ts`
- Create: `apps/api/src/modules/pm-analytics/pm-analytics.controller.ts`
- Create: `apps/api/src/modules/pm-analytics/pm-analytics.router.ts`
- Create: `apps/api/src/modules/project-docs/project-docs.schema.ts`
- Create: `apps/api/src/modules/project-docs/project-docs.queries.ts`
- Create: `apps/api/src/modules/project-docs/project-docs.controller.ts`
- Create: `apps/api/src/modules/project-docs/project-docs.router.ts`
- Create: `apps/api/src/modules/pm-search/pm-search.controller.ts`
- Create: `apps/api/src/modules/pm-search/pm-search.router.ts`
- Create: `apps/api/src/modules/project-templates/project-templates.schema.ts`
- Create: `apps/api/src/modules/project-templates/project-templates.queries.ts`
- Create: `apps/api/src/modules/project-templates/project-templates.controller.ts`
- Create: `apps/api/src/modules/project-templates/project-templates.router.ts`
- Modify: `apps/api/src/index.ts`
- Create: `apps/web/src/app/(dashboard)/projects/[id]/analytics/page.tsx`
- Create: `apps/web/src/app/(dashboard)/projects/[id]/docs/page.tsx`
- Create: `apps/web/src/app/(dashboard)/projects/[id]/docs/[docId]/page.tsx`
- Create: `apps/web/src/app/(dashboard)/projects/search/page.tsx`
- Create: `apps/web/src/app/(dashboard)/projects/templates/page.tsx`

---

### Task 1: Analytics API

- [ ] **Step 1: Analytics queries**

```ts
// apps/api/src/modules/pm-analytics/pm-analytics.queries.ts
import { db } from '../../db'

export async function getProjectHealth(projectId: string) {
  const [taskStats, memberCount, openCount] = await Promise.all([
    db.selectFrom('project_tasks as t')
      .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
      .select([
        db.fn.count('t.id').as('total'),
        db.fn.count(db.raw(`case when s.is_done then t.id end`)).as('done'),
        db.fn.count(db.raw(`case when t.due_date < now() and not s.is_done then t.id end`)).as('overdue'),
      ])
      .where('t.project_id', '=', projectId)
      .where('t.parent_id', 'is', null)
      .executeTakeFirst(),

    db.selectFrom('project_members').select(db.fn.count('id').as('count'))
      .where('project_id', '=', projectId).executeTakeFirst(),

    db.selectFrom('project_tasks as t')
      .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
      .select(db.fn.count('t.id').as('count'))
      .where('t.project_id', '=', projectId)
      .where('s.is_done', '=', false)
      .executeTakeFirst(),
  ])

  const total = Number(taskStats?.total ?? 0)
  const done = Number(taskStats?.done ?? 0)
  const overdue = Number(taskStats?.overdue ?? 0)

  return {
    total_tasks: total,
    done_tasks: done,
    overdue_tasks: overdue,
    open_tasks: Number(openCount?.count ?? 0),
    member_count: Number(memberCount?.count ?? 0),
    completion_rate: total === 0 ? 0 : Math.round((done / total) * 100),
  }
}

export async function getTasksByStatus(projectId: string) {
  return db.selectFrom('project_task_statuses as s')
    .leftJoin('project_tasks as t', eb => eb.onRef('t.status_id', '=', 's.id').on('t.project_id', '=', projectId).on('t.parent_id', 'is', null))
    .select(['s.id', 's.name', 's.color', 's.is_done', db.fn.count('t.id').as('count')])
    .where('s.project_id', '=', projectId)
    .groupBy(['s.id', 's.name', 's.color', 's.is_done'])
    .orderBy('s.position', 'asc')
    .execute()
}

export async function getVelocity(projectId: string) {
  // Velocity: completed tasks per sprint (last 8 sprints)
  return db.selectFrom('sprints as sp')
    .select(['sp.id', 'sp.name', 'sp.velocity', 'sp.start_date', 'sp.end_date', 'sp.status'])
    .where('sp.project_id', '=', projectId)
    .where('sp.status', 'in', ['COMPLETED', 'ACTIVE'])
    .orderBy('sp.start_date', 'desc')
    .limit(8)
    .execute()
}

export async function getBurndown(projectId: string, sprintId?: string) {
  // Get task completion counts over time for a sprint or the last 30 days
  if (sprintId) {
    const sprint = await db.selectFrom('sprints').selectAll().where('id', '=', sprintId).executeTakeFirst()
    if (!sprint || !sprint.start_date || !sprint.end_date) return []

    // Tasks done per day within the sprint window
    return db
      .selectFrom('project_tasks as t')
      .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
      .innerJoin('sprint_tasks as st', 'st.task_id', 't.id')
      .select([
        db.raw(`date(t.updated_at)`).as('date'),
        db.fn.count('t.id').as('completed'),
      ])
      .where('st.sprint_id', '=', sprintId)
      .where('s.is_done', '=', true)
      .where('t.updated_at', '>=', sprint.start_date)
      .where('t.updated_at', '<=', sprint.end_date)
      .groupBy(db.raw(`date(t.updated_at)`))
      .orderBy(db.raw(`date(t.updated_at)`), 'asc')
      .execute()
  }

  // Rolling 30-day completion chart
  return db
    .selectFrom('project_tasks as t')
    .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
    .select([
      db.raw(`date(t.updated_at)`).as('date'),
      db.fn.count('t.id').as('completed'),
    ])
    .where('t.project_id', '=', projectId)
    .where('s.is_done', '=', true)
    .where('t.updated_at', '>=', db.raw(`now() - interval '30 days'`))
    .groupBy(db.raw(`date(t.updated_at)`))
    .orderBy(db.raw(`date(t.updated_at)`), 'asc')
    .execute()
}

export async function getWorkloadByMember(projectId: string) {
  return db.selectFrom('project_task_assignees as a')
    .innerJoin('project_tasks as t', 't.id', 'a.task_id')
    .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
    .leftJoin('workspace_users as u', 'u.user_id', 'a.user_id')
    .select([
      'a.user_id',
      'u.display_name',
      db.fn.count('t.id').as('total'),
      db.fn.count(db.raw(`case when s.is_done then t.id end`)).as('done'),
      db.fn.count(db.raw(`case when t.due_date < now() and not s.is_done then t.id end`)).as('overdue'),
    ])
    .where('t.project_id', '=', projectId)
    .where('t.parent_id', 'is', null)
    .groupBy(['a.user_id', 'u.display_name'])
    .orderBy(db.raw(`count(t.id)`), 'desc')
    .execute()
}
```

- [ ] **Step 2: Controller + Router**

```ts
// apps/api/src/modules/pm-analytics/pm-analytics.controller.ts
import type { Request, Response } from 'express'
import * as q from './pm-analytics.queries'

export async function health(req: Request, res: Response) {
  return res.json({ data: await q.getProjectHealth(req.params.projectId), error: null })
}

export async function byStatus(req: Request, res: Response) {
  return res.json({ data: await q.getTasksByStatus(req.params.projectId), error: null })
}

export async function velocity(req: Request, res: Response) {
  return res.json({ data: await q.getVelocity(req.params.projectId), error: null })
}

export async function burndown(req: Request, res: Response) {
  const sprintId = typeof req.query.sprint_id === 'string' ? req.query.sprint_id : undefined
  return res.json({ data: await q.getBurndown(req.params.projectId, sprintId), error: null })
}

export async function workload(req: Request, res: Response) {
  return res.json({ data: await q.getWorkloadByMember(req.params.projectId), error: null })
}
```

```ts
// apps/api/src/modules/pm-analytics/pm-analytics.router.ts
import { Router } from 'express'
import * as ctrl from './pm-analytics.controller'
const router = Router({ mergeParams: true })
router.get('/health', ctrl.health)
router.get('/by-status', ctrl.byStatus)
router.get('/velocity', ctrl.velocity)
router.get('/burndown', ctrl.burndown)
router.get('/workload', ctrl.workload)
export default router
```

- [ ] **Step 3: Register**

```ts
import analyticsRouter from './modules/pm-analytics/pm-analytics.router'
app.use('/api/projects/:projectId/analytics', requireWorkspace, analyticsRouter)
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/pm-analytics/
git add apps/api/src/index.ts
git commit -m "feat(pm): add project analytics API"
```

---

### Task 2: Analytics dashboard UI

- [ ] **Step 1: Analytics page**

```tsx
// apps/web/src/app/(dashboard)/projects/[id]/analytics/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface HealthData {
  total_tasks: number; done_tasks: number; overdue_tasks: number
  open_tasks: number; member_count: number; completion_rate: number
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="p-5 rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <p className="text-xs mb-1" style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>{label}</p>
      <p style={{ fontFamily: 'Instrument Serif', fontSize: 36, color: color ?? 'var(--text)', lineHeight: 1 }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>{sub}</p>}
    </div>
  )
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max === 0 ? 0 : Math.min(100, (value / max) * 100)
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface2)', flex: 1 }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>()
  const [health, setHealth] = useState<HealthData | null>(null)
  const [byStatus, setByStatus] = useState<any[]>([])
  const [workload, setWorkload] = useState<any[]>([])
  const [velocity, setVelocity] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${id}/analytics/health`).then(r => r.json()),
      fetch(`/api/projects/${id}/analytics/by-status`).then(r => r.json()),
      fetch(`/api/projects/${id}/analytics/workload`).then(r => r.json()),
      fetch(`/api/projects/${id}/analytics/velocity`).then(r => r.json()),
    ]).then(([h, s, w, v]) => {
      setHealth(h.data)
      setByStatus(s.data ?? [])
      setWorkload(w.data ?? [])
      setVelocity(v.data ?? [])
    })
  }, [id])

  if (!health) return <div className="p-8" style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>Loading…</div>

  const maxWorkload = Math.max(...workload.map((w: any) => Number(w.total)), 1)

  return (
    <div className="p-6 max-w-4xl space-y-8">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Completion" value={`${health.completion_rate}%`} sub={`${health.done_tasks} of ${health.total_tasks} tasks done`} color="var(--green)" />
        <StatCard label="Open tasks" value={health.open_tasks} sub={`${health.overdue_tasks} overdue`} color={health.overdue_tasks > 0 ? 'var(--red)' : 'var(--text)'} />
        <StatCard label="Team members" value={health.member_count} />
      </div>

      {/* Status breakdown */}
      <div className="p-5 rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <p className="text-sm font-medium mb-4" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>Tasks by status</p>
        <div className="space-y-3">
          {byStatus.map((s: any) => (
            <div key={s.id} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="text-sm w-28 truncate" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>{s.name}</span>
              <MiniBar value={Number(s.count)} max={health.total_tasks} color={s.color} />
              <span className="text-sm w-6 text-right" style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Workload heatmap */}
      <div className="p-5 rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <p className="text-sm font-medium mb-4" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>Workload by member</p>
        <div className="space-y-3">
          {workload.map((w: any) => (
            <div key={w.user_id} className="flex items-center gap-3">
              <span className="text-sm w-32 truncate" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>{w.display_name ?? 'Unknown'}</span>
              <MiniBar value={Number(w.total)} max={maxWorkload} color="var(--blue)" />
              <span className="text-xs" style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>{w.done}/{w.total}</span>
              {Number(w.overdue) > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--red-bg)', color: 'var(--red)', fontFamily: 'DM Sans' }}>
                  {w.overdue} overdue
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Velocity bars */}
      {velocity.length > 0 && (
        <div className="p-5 rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <p className="text-sm font-medium mb-4" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>Sprint velocity (story points completed)</p>
          <div className="flex items-end gap-3 h-24">
            {[...velocity].reverse().map((s: any) => {
              const maxV = Math.max(...velocity.map((v: any) => v.velocity ?? 0), 1)
              const h = Math.round(((s.velocity ?? 0) / maxV) * 80)
              return (
                <div key={s.id} className="flex flex-col items-center gap-1" style={{ minWidth: 48 }}>
                  <span className="text-xs" style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>{s.velocity ?? 0}</span>
                  <div className="w-full rounded-t-md" style={{ height: h || 4, background: s.status === 'ACTIVE' ? 'var(--blue)' : 'var(--green)', opacity: 0.8 }} />
                  <span className="text-xs truncate w-12 text-center" style={{ color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 10 }}>
                    {s.name.length > 8 ? s.name.slice(0, 8) + '…' : s.name}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/(dashboard)/projects/[id]/analytics/page.tsx"
git commit -m "feat(pm): add analytics dashboard UI"
```

---

### Task 3: Wiki/Docs API

- [ ] **Step 1: Schema + Queries**

```ts
// apps/api/src/modules/project-docs/project-docs.schema.ts
import { z } from 'zod'

export const createDocSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.record(z.unknown()).optional().default({}), // ProseMirror JSON
})

export const updateDocSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.record(z.unknown()).optional(),
})
```

```ts
// apps/api/src/modules/project-docs/project-docs.queries.ts
import { db } from '../../db'
import type { z } from 'zod'
import type { createDocSchema, updateDocSchema } from './project-docs.schema'

export async function listDocs(projectId: string) {
  return db.selectFrom('project_docs').select(['id', 'project_id', 'title', 'created_by', 'created_at', 'updated_at'])
    .where('project_id', '=', projectId).orderBy('updated_at', 'desc').execute()
}

export async function getDoc(id: string, projectId: string) {
  return db.selectFrom('project_docs').selectAll()
    .where('id', '=', id).where('project_id', '=', projectId).executeTakeFirst()
}

export async function createDoc(projectId: string, userId: string, input: z.infer<typeof createDocSchema>) {
  return db.insertInto('project_docs')
    .values({ project_id: projectId, created_by: userId, title: input.title, content: JSON.stringify(input.content) })
    .returningAll().executeTakeFirstOrThrow()
}

export async function updateDoc(id: string, projectId: string, input: z.infer<typeof updateDocSchema>) {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.title !== undefined) updates.title = input.title
  if (input.content !== undefined) updates.content = JSON.stringify(input.content)
  return db.updateTable('project_docs').set(updates)
    .where('id', '=', id).where('project_id', '=', projectId)
    .returningAll().executeTakeFirstOrThrow()
}

export async function deleteDoc(id: string, projectId: string) {
  await db.deleteFrom('project_docs').where('id', '=', id).where('project_id', '=', projectId).execute()
}
```

- [ ] **Step 2: Controller + Router**

```ts
// apps/api/src/modules/project-docs/project-docs.controller.ts
import type { Request, Response } from 'express'
import * as q from './project-docs.queries'
import { createDocSchema, updateDocSchema } from './project-docs.schema'

export async function list(req: Request, res: Response) {
  return res.json({ data: await q.listDocs(req.params.projectId), error: null })
}

export async function get(req: Request, res: Response) {
  const doc = await q.getDoc(req.params.docId, req.params.projectId)
  if (!doc) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Doc not found' } })
  return res.json({ data: doc, error: null })
}

export async function create(req: Request, res: Response) {
  const parsed = createDocSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  const doc = await q.createDoc(req.params.projectId, req.user.id, parsed.data)
  return res.status(201).json({ data: doc, error: null })
}

export async function update(req: Request, res: Response) {
  const parsed = updateDocSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  try {
    const doc = await q.updateDoc(req.params.docId, req.params.projectId, parsed.data)
    return res.json({ data: doc, error: null })
  } catch {
    return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Doc not found' } })
  }
}

export async function remove(req: Request, res: Response) {
  await q.deleteDoc(req.params.docId, req.params.projectId)
  return res.json({ data: { success: true }, error: null })
}
```

```ts
// apps/api/src/modules/project-docs/project-docs.router.ts
import { Router } from 'express'
import * as ctrl from './project-docs.controller'
const router = Router({ mergeParams: true })
router.get('/', ctrl.list)
router.post('/', ctrl.create)
router.get('/:docId', ctrl.get)
router.patch('/:docId', ctrl.update)
router.delete('/:docId', ctrl.remove)
export default router
```

- [ ] **Step 3: Register + Commit**

```ts
import projectDocsRouter from './modules/project-docs/project-docs.router'
app.use('/api/projects/:projectId/docs', requireWorkspace, projectDocsRouter)
```

```bash
git add apps/api/src/modules/project-docs/
git add apps/api/src/index.ts
git commit -m "feat(pm): add wiki/docs API"
```

---

### Task 4: Wiki/Docs UI

- [ ] **Step 1: Docs list page**

```tsx
// apps/web/src/app/(dashboard)/projects/[id]/docs/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function DocsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [docs, setDocs] = useState<any[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch(`/api/projects/${id}/docs`).then(r => r.json()).then(j => setDocs(j.data ?? []))
  }, [id])

  async function createDoc() {
    setCreating(true)
    const res = await fetch(`/api/projects/${id}/docs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled doc' }),
    })
    const { data } = await res.json()
    setCreating(false)
    if (data) router.push(`/projects/${id}/docs/${data.id}`)
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)' }}>Docs</h2>
        <button onClick={createDoc} disabled={creating}
          className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'var(--text)', color: 'white', fontFamily: 'DM Sans', opacity: creating ? 0.6 : 1 }}>
          {creating ? 'Creating…' : '+ New doc'}
        </button>
      </div>

      <div className="space-y-2">
        {docs.map((doc: any) => (
          <a key={doc.id} href={`/projects/${id}/docs/${doc.id}`}
            className="flex items-center gap-3 p-4 rounded-xl border transition-colors cursor-pointer"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', textDecoration: 'none' }}>
            <div className="text-xl">📄</div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>{doc.title}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>
                Updated {new Date(doc.updated_at).toLocaleDateString()}
              </p>
            </div>
          </a>
        ))}
        {docs.length === 0 && (
          <div className="p-8 rounded-xl border-2 border-dashed text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>No docs yet. Create one to get started.</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Doc editor page**

```tsx
// apps/web/src/app/(dashboard)/projects/[id]/docs/[docId]/page.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

export default function DocEditorPage() {
  const { id, docId } = useParams<{ id: string; docId: string }>()
  const [doc, setDoc] = useState<any>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`/api/projects/${id}/docs/${docId}`).then(r => r.json()).then(j => {
      if (j.data) {
        setDoc(j.data)
        setTitle(j.data.title)
        // content is ProseMirror JSON — display as plain text for now
        const content = j.data.content
        const text = typeof content === 'string' ? JSON.parse(content) : content
        setBody(extractPlainText(text))
      }
    })
  }, [id, docId])

  function extractPlainText(node: any): string {
    if (!node) return ''
    if (node.type === 'text') return node.text ?? ''
    if (node.content) return node.content.map(extractPlainText).join(node.type === 'paragraph' ? '\n' : '')
    return ''
  }

  function autoSave(newTitle: string, newBody: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await fetch(`/api/projects/${id}/docs/${docId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          content: { type: 'doc', content: newBody.split('\n').map(line => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) },
        }),
      })
      setSaving(false)
    }, 800)
  }

  if (!doc) return <div className="p-8" style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>Loading…</div>

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div />
        <span className="text-xs" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>
          {saving ? 'Saving…' : 'Saved'}
        </span>
      </div>
      {/* Title */}
      <input
        value={title}
        onChange={e => { setTitle(e.target.value); autoSave(e.target.value, body) }}
        placeholder="Untitled"
        className="w-full outline-none mb-4 bg-transparent"
        style={{ fontFamily: 'Instrument Serif', fontSize: 36, color: 'var(--text)', border: 'none' }}
      />
      {/* Body */}
      <textarea
        value={body}
        onChange={e => { setBody(e.target.value); autoSave(title, e.target.value) }}
        placeholder="Start writing…"
        rows={24}
        className="w-full outline-none resize-none bg-transparent"
        style={{ fontFamily: 'DM Sans', fontSize: 15, color: 'var(--text)', border: 'none', lineHeight: 1.8 }}
      />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/projects/[id]/docs/"
git commit -m "feat(pm): add wiki/docs UI with autosave editor"
```

---

### Task 5: Global PM search

- [ ] **Step 1: Search controller**

```ts
// apps/api/src/modules/pm-search/pm-search.controller.ts
import type { Request, Response } from 'express'
import { db } from '../../db'

export async function search(req: Request, res: Response) {
  const q = req.query.q
  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    return res.status(400).json({ data: null, error: { code: 'QUERY_TOO_SHORT', message: 'Query must be at least 2 characters' } })
  }
  const workspaceId = req.workspace.id
  const tsQuery = q.trim().split(/\s+/).map(w => w + ':*').join(' & ')

  const [tasks, projects, docs] = await Promise.all([
    db.selectFrom('project_tasks as t')
      .innerJoin('projects as p', 'p.id', 't.project_id')
      .select(['t.id', 't.title', 't.project_id', 'p.name as project_name'])
      .where('p.workspace_id', '=', workspaceId)
      .where(db.raw(`to_tsvector('english', t.title)`) as any, '@@', db.raw(`to_tsquery('english', ?)`, [tsQuery]))
      .limit(10).execute(),

    db.selectFrom('projects')
      .select(['id', 'name', 'color', 'status'])
      .where('workspace_id', '=', workspaceId)
      .where(db.raw(`to_tsvector('english', name || ' ' || coalesce(description, ''))`) as any, '@@', db.raw(`to_tsquery('english', ?)`, [tsQuery]))
      .limit(5).execute(),

    db.selectFrom('project_docs as d')
      .innerJoin('projects as p', 'p.id', 'd.project_id')
      .select(['d.id', 'd.title', 'd.project_id', 'p.name as project_name'])
      .where('p.workspace_id', '=', workspaceId)
      .where(db.raw(`to_tsvector('english', d.title)`) as any, '@@', db.raw(`to_tsquery('english', ?)`, [tsQuery]))
      .limit(5).execute(),
  ])

  return res.json({ data: { tasks, projects, docs }, error: null })
}
```

```ts
// apps/api/src/modules/pm-search/pm-search.router.ts
import { Router } from 'express'
import { search } from './pm-search.controller'
const router = Router()
router.get('/', search)
export default router
```

- [ ] **Step 2: Register + Commit**

```ts
import pmSearchRouter from './modules/pm-search/pm-search.router'
app.use('/api/pm/search', requireWorkspace, pmSearchRouter)
```

```bash
git add apps/api/src/modules/pm-search/
git add apps/api/src/index.ts
git commit -m "feat(pm): add global PM search with PostgreSQL FTS"
```

---

### Task 6: Project templates

- [ ] **Step 1: Schema + Queries**

```ts
// apps/api/src/modules/project-templates/project-templates.schema.ts
import { z } from 'zod'

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  is_public: z.boolean().default(false),
})

export const applyTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})
```

```ts
// apps/api/src/modules/project-templates/project-templates.queries.ts
import { db } from '../../db'
import type { z } from 'zod'
import type { createTemplateSchema, applyTemplateSchema } from './project-templates.schema'

export async function listTemplates(workspaceId: string) {
  return db.selectFrom('project_templates')
    .selectAll()
    .where(eb => eb.or([
      eb('workspace_id', '=', workspaceId),
      eb('is_public', '=', true),
    ]))
    .orderBy('is_public', 'asc')
    .orderBy('name', 'asc')
    .execute()
}

export async function getTemplate(id: string) {
  return db.selectFrom('project_templates').selectAll().where('id', '=', id).executeTakeFirst()
}

export async function createTemplateFromProject(workspaceId: string, projectId: string, userId: string, input: z.infer<typeof createTemplateSchema>) {
  // Snapshot the current project's statuses and tasks as template data
  const [statuses, tasks] = await Promise.all([
    db.selectFrom('project_task_statuses').select(['name', 'color', 'position', 'is_done'])
      .where('project_id', '=', projectId).orderBy('position', 'asc').execute(),
    db.selectFrom('project_tasks').select(['title', 'description', 'priority', 'estimated_minutes', 'parent_id'])
      .where('project_id', '=', projectId).where('parent_id', 'is', null).limit(50).execute(),
  ])

  const templateData = JSON.stringify({ statuses, tasks: tasks.map(t => ({ ...t })) })

  return db.insertInto('project_templates')
    .values({
      workspace_id: workspaceId, name: input.name,
      description: input.description ?? null,
      is_public: input.is_public,
      template_data: templateData,
      created_by: userId,
    })
    .returningAll().executeTakeFirstOrThrow()
}

export async function applyTemplate(workspaceId: string, templateId: string, userId: string, input: z.infer<typeof applyTemplateSchema>) {
  const template = await getTemplate(templateId)
  if (!template) throw new Error('Template not found')

  const data = JSON.parse(template.template_data as string) as { statuses: any[]; tasks: any[] }

  // Create project
  const project = await db.insertInto('projects')
    .values({ workspace_id: workspaceId, name: input.name, color: input.color ?? '#1e3a8a', created_by: userId })
    .returningAll().executeTakeFirstOrThrow()

  // Create statuses
  const statusMap: Record<string, string> = {}
  for (const s of data.statuses) {
    const created = await db.insertInto('project_task_statuses')
      .values({ project_id: project.id, name: s.name, color: s.color, position: s.position, is_done: s.is_done })
      .returningAll().executeTakeFirstOrThrow()
    statusMap[s.name] = created.id
  }

  // Create tasks (use first non-done status as default)
  const defaultStatusId = Object.values(statusMap)[0]
  for (const t of data.tasks) {
    await db.insertInto('project_tasks')
      .values({
        project_id: project.id,
        status_id: defaultStatusId,
        title: t.title,
        description: t.description ?? null,
        priority: t.priority ?? 'MEDIUM',
        estimated_minutes: t.estimated_minutes ?? null,
        created_by: userId,
      }).execute()
  }

  return project
}

export async function deleteTemplate(id: string, workspaceId: string) {
  await db.deleteFrom('project_templates').where('id', '=', id).where('workspace_id', '=', workspaceId).execute()
}
```

- [ ] **Step 2: Controller + Router**

```ts
// apps/api/src/modules/project-templates/project-templates.controller.ts
import type { Request, Response } from 'express'
import * as q from './project-templates.queries'
import { createTemplateSchema, applyTemplateSchema } from './project-templates.schema'

export async function list(req: Request, res: Response) {
  return res.json({ data: await q.listTemplates(req.workspace.id), error: null })
}

export async function createFromProject(req: Request, res: Response) {
  const parsed = createTemplateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  const t = await q.createTemplateFromProject(req.workspace.id, req.params.projectId, req.user.id, parsed.data)
  return res.status(201).json({ data: t, error: null })
}

export async function apply(req: Request, res: Response) {
  const parsed = applyTemplateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  try {
    const project = await q.applyTemplate(req.workspace.id, req.params.templateId, req.user.id, parsed.data)
    return res.status(201).json({ data: project, error: null })
  } catch (err) {
    return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Template not found' } })
  }
}

export async function remove(req: Request, res: Response) {
  await q.deleteTemplate(req.params.templateId, req.workspace.id)
  return res.json({ data: { success: true }, error: null })
}
```

```ts
// apps/api/src/modules/project-templates/project-templates.router.ts
import { Router } from 'express'
import * as ctrl from './project-templates.controller'

// Public template routes (no projectId)
export const templatesRouter = Router()
templatesRouter.get('/', ctrl.list)
templatesRouter.post('/:templateId/apply', ctrl.apply)
templatesRouter.delete('/:templateId', ctrl.remove)

// Per-project: save current project as template
export const saveAsTemplateRouter = Router({ mergeParams: true })
saveAsTemplateRouter.post('/', ctrl.createFromProject)
```

- [ ] **Step 3: Register**

```ts
import { templatesRouter, saveAsTemplateRouter } from './modules/project-templates/project-templates.router'
app.use('/api/project-templates', requireWorkspace, templatesRouter)
app.use('/api/projects/:projectId/save-as-template', requireWorkspace, saveAsTemplateRouter)
```

- [ ] **Step 4: Templates UI**

```tsx
// apps/web/src/app/(dashboard)/projects/templates/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<any[]>([])
  const [applying, setApplying] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/project-templates').then(r => r.json()).then(j => setTemplates(j.data ?? []))
  }, [])

  async function applyTemplate(templateId: string) {
    const name = prompt('Project name:')
    if (!name) return
    setApplying(templateId)
    const res = await fetch(`/api/project-templates/${templateId}/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const { data } = await res.json()
    setApplying(null)
    if (data) router.push(`/projects/${data.id}/board`)
  }

  const workspace = templates.filter(t => !t.is_public)
  const builtIn = templates.filter(t => t.is_public)

  function TemplateCard({ t }: { t: any }) {
    return (
      <div className="p-5 rounded-2xl border flex flex-col gap-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>{t.name}</p>
          {t.description && <p className="text-xs mt-1" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>{t.description}</p>}
          {t.is_public && <span className="inline-block text-xs mt-2 px-2 py-0.5 rounded" style={{ background: 'var(--blue-bg)', color: 'var(--blue)', fontFamily: 'DM Sans' }}>Built-in</span>}
        </div>
        <button onClick={() => applyTemplate(t.id)} disabled={applying === t.id}
          className="w-full py-2 rounded-xl text-sm text-center"
          style={{ background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'DM Sans', opacity: applying === t.id ? 0.6 : 1 }}>
          {applying === t.id ? 'Creating…' : 'Use template'}
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontFamily: 'Instrument Serif', fontSize: 28, color: 'var(--text)' }}>Project templates</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>Start a new project from a template.</p>
        </div>
      </div>

      {builtIn.length > 0 && (
        <div className="mb-8">
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text3)', fontFamily: 'DM Sans', letterSpacing: '0.08em' }}>BUILT-IN</p>
          <div className="grid grid-cols-3 gap-4">{builtIn.map(t => <TemplateCard key={t.id} t={t} />)}</div>
        </div>
      )}

      {workspace.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text3)', fontFamily: 'DM Sans', letterSpacing: '0.08em' }}>WORKSPACE TEMPLATES</p>
          <div className="grid grid-cols-3 gap-4">{workspace.map(t => <TemplateCard key={t.id} t={t} />)}</div>
        </div>
      )}

      {templates.length === 0 && (
        <div className="p-12 rounded-2xl border-2 border-dashed text-center" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>
            No templates yet. Save a project as a template from its settings page.
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/project-templates/
git add apps/api/src/index.ts
git add "apps/web/src/app/(dashboard)/projects/templates/page.tsx"
git commit -m "feat(pm): add project templates — save and apply"
```
