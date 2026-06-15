# PM Plan 8: Advanced Views + Task Power Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Task dependencies API, custom fields API, time tracking API, and four additional project views: Timeline (Gantt), Calendar, Table (dense spreadsheet), and Roadmap (milestone-level).

**Architecture:** Dependencies and custom fields extend the existing tasks module. Views are separate Next.js pages that each query the existing tasks/milestones API with different query params. Timeline uses an SVG-based Gantt renderer (no third-party chart lib). Calendar uses CSS grid.

**Tech Stack:** Express, Kysely, Zod, Next.js 15 App Router, TypeScript strict, SVG for Gantt, CSS Grid for Calendar

**Prerequisite:** PM Plans 1–6 applied.

---

## File Map

- Create: `apps/api/src/modules/project-tasks/dependencies.controller.ts`
- Create: `apps/api/src/modules/custom-fields/custom-fields.schema.ts`
- Create: `apps/api/src/modules/custom-fields/custom-fields.queries.ts`
- Create: `apps/api/src/modules/custom-fields/custom-fields.controller.ts`
- Create: `apps/api/src/modules/custom-fields/custom-fields.router.ts`
- Create: `apps/api/src/modules/time-logs/time-logs.schema.ts`
- Create: `apps/api/src/modules/time-logs/time-logs.queries.ts`
- Create: `apps/api/src/modules/time-logs/time-logs.controller.ts`
- Create: `apps/api/src/modules/time-logs/time-logs.router.ts`
- Modify: `apps/api/src/modules/project-tasks/project-tasks.router.ts`
- Modify: `apps/api/src/index.ts`
- Create: `apps/web/src/app/(dashboard)/projects/[id]/timeline/page.tsx`
- Create: `apps/web/src/app/(dashboard)/projects/[id]/calendar/page.tsx`
- Create: `apps/web/src/app/(dashboard)/projects/[id]/table/page.tsx`
- Create: `apps/web/src/app/(dashboard)/projects/[id]/roadmap/page.tsx`
- Create: `apps/web/src/components/pm/GanttChart.tsx`

---

### Task 1: Task dependencies API

- [ ] **Step 1: Dependency queries**

In `apps/api/src/modules/project-tasks/project-tasks.queries.ts`, add:

```ts
export async function addDependency(taskId: string, dependsOnTaskId: string, type: 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO') {
  return db.insertInto('project_task_dependencies')
    .values({ task_id: taskId, depends_on_task_id: dependsOnTaskId, type })
    .onConflict(oc => oc.columns(['task_id', 'depends_on_task_id']).doNothing())
    .returningAll().executeTakeFirstOrThrow()
}

export async function removeDependency(taskId: string, dependsOnTaskId: string) {
  await db.deleteFrom('project_task_dependencies')
    .where('task_id', '=', taskId)
    .where('depends_on_task_id', '=', dependsOnTaskId)
    .execute()
}

export async function getTaskDependencies(taskId: string) {
  const [blocking, blockedBy] = await Promise.all([
    db.selectFrom('project_task_dependencies as d')
      .innerJoin('project_tasks as t', 't.id', 'd.depends_on_task_id')
      .select(['t.id', 't.title', 't.status_id', 'd.type'])
      .where('d.task_id', '=', taskId).execute(),
    db.selectFrom('project_task_dependencies as d')
      .innerJoin('project_tasks as t', 't.id', 'd.task_id')
      .select(['t.id', 't.title', 't.status_id', 'd.type'])
      .where('d.depends_on_task_id', '=', taskId).execute(),
  ])
  return { blocking, blockedBy }
}
```

- [ ] **Step 2: Dependencies controller**

Create `apps/api/src/modules/project-tasks/dependencies.controller.ts`:

```ts
import type { Request, Response } from 'express'
import { z } from 'zod'
import { addDependency, removeDependency, getTaskDependencies } from './project-tasks.queries'

const addSchema = z.object({
  depends_on_task_id: z.string().uuid(),
  type: z.enum(['BLOCKS', 'BLOCKED_BY', 'RELATES_TO']).default('BLOCKS'),
})

export async function getDependencies(req: Request, res: Response) {
  const deps = await getTaskDependencies(req.params.taskId)
  return res.json({ data: deps, error: null })
}

export async function createDependency(req: Request, res: Response) {
  const parsed = addSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  if (parsed.data.depends_on_task_id === req.params.taskId) {
    return res.status(400).json({ data: null, error: { code: 'SELF_DEPENDENCY', message: 'Task cannot depend on itself' } })
  }
  const dep = await addDependency(req.params.taskId, parsed.data.depends_on_task_id, parsed.data.type)
  return res.status(201).json({ data: dep, error: null })
}

export async function deleteDependency(req: Request, res: Response) {
  await removeDependency(req.params.taskId, req.params.dependsOnTaskId)
  return res.json({ data: { success: true }, error: null })
}
```

- [ ] **Step 3: Wire into tasks router**

In `apps/api/src/modules/project-tasks/project-tasks.router.ts`, add:

```ts
import * as depsCtrl from './dependencies.controller'

router.get('/:taskId/dependencies', depsCtrl.getDependencies)
router.post('/:taskId/dependencies', depsCtrl.createDependency)
router.delete('/:taskId/dependencies/:dependsOnTaskId', depsCtrl.deleteDependency)
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/project-tasks/
git commit -m "feat(pm): add task dependencies API"
```

---

### Task 2: Custom fields API

- [ ] **Step 1: Schema**

```ts
// apps/api/src/modules/custom-fields/custom-fields.schema.ts
import { z } from 'zod'

export const createFieldSchema = z.object({
  name: z.string().min(1).max(100),
  field_type: z.enum(['TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX', 'URL']),
  options: z.array(z.string()).optional(), // for SELECT type
})

export const setValueSchema = z.object({
  custom_field_id: z.string().uuid(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
})

export type CreateFieldInput = z.infer<typeof createFieldSchema>
```

- [ ] **Step 2: Queries**

```ts
// apps/api/src/modules/custom-fields/custom-fields.queries.ts
import { db } from '../../db'
import type { CreateFieldInput } from './custom-fields.schema'

export async function listFields(projectId: string) {
  return db.selectFrom('custom_fields').selectAll()
    .where('project_id', '=', projectId).orderBy('created_at', 'asc').execute()
}

export async function createField(projectId: string, input: CreateFieldInput) {
  return db.insertInto('custom_fields')
    .values({ project_id: projectId, name: input.name, field_type: input.field_type, options: input.options ? JSON.stringify(input.options) : null })
    .returningAll().executeTakeFirstOrThrow()
}

export async function deleteField(id: string, projectId: string) {
  await db.deleteFrom('custom_fields').where('id', '=', id).where('project_id', '=', projectId).execute()
}

export async function getTaskFieldValues(taskId: string) {
  return db.selectFrom('custom_field_values as v')
    .innerJoin('custom_fields as f', 'f.id', 'v.custom_field_id')
    .select(['v.id', 'v.custom_field_id', 'f.name', 'f.field_type', 'v.value'])
    .where('v.task_id', '=', taskId).execute()
}

export async function upsertFieldValue(taskId: string, customFieldId: string, value: string | null) {
  return db.insertInto('custom_field_values')
    .values({ task_id: taskId, custom_field_id: customFieldId, value })
    .onConflict(oc => oc.columns(['task_id', 'custom_field_id']).doUpdateSet({ value }))
    .returningAll().executeTakeFirstOrThrow()
}
```

- [ ] **Step 3: Controller + Router**

```ts
// apps/api/src/modules/custom-fields/custom-fields.controller.ts
import type { Request, Response } from 'express'
import * as q from './custom-fields.queries'
import { createFieldSchema, setValueSchema } from './custom-fields.schema'

export async function list(req: Request, res: Response) {
  return res.json({ data: await q.listFields(req.params.projectId), error: null })
}

export async function create(req: Request, res: Response) {
  const parsed = createFieldSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  const existing = await q.listFields(req.params.projectId)
  if (existing.length >= 20) return res.status(400).json({ data: null, error: { code: 'LIMIT', message: 'Max 20 custom fields per project' } })
  const field = await q.createField(req.params.projectId, parsed.data)
  return res.status(201).json({ data: field, error: null })
}

export async function remove(req: Request, res: Response) {
  await q.deleteField(req.params.fieldId, req.params.projectId)
  return res.json({ data: { success: true }, error: null })
}

export async function getTaskValues(req: Request, res: Response) {
  return res.json({ data: await q.getTaskFieldValues(req.params.taskId), error: null })
}

export async function setTaskValue(req: Request, res: Response) {
  const parsed = setValueSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  const v = parsed.data.value
  const stringValue = v === null ? null : typeof v === 'string' ? v : String(v)
  const result = await q.upsertFieldValue(req.params.taskId, parsed.data.custom_field_id, stringValue)
  return res.json({ data: result, error: null })
}
```

```ts
// apps/api/src/modules/custom-fields/custom-fields.router.ts
import { Router } from 'express'
import * as ctrl from './custom-fields.controller'

const router = Router({ mergeParams: true })
router.get('/', ctrl.list)
router.post('/', ctrl.create)
router.delete('/:fieldId', ctrl.remove)
export default router

export const taskValuesRouter = Router({ mergeParams: true })
taskValuesRouter.get('/', ctrl.getTaskValues)
taskValuesRouter.post('/', ctrl.setTaskValue)
```

- [ ] **Step 4: Register in index.ts**

```ts
import customFieldsRouter, { taskValuesRouter } from './modules/custom-fields/custom-fields.router'

app.use('/api/projects/:projectId/custom-fields', requireWorkspace, customFieldsRouter)
app.use('/api/projects/:projectId/tasks/:taskId/field-values', requireWorkspace, taskValuesRouter)
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/custom-fields/
git add apps/api/src/index.ts
git commit -m "feat(pm): add custom fields API"
```

---

### Task 3: Time tracking API

- [ ] **Step 1: Schema + Queries**

```ts
// apps/api/src/modules/time-logs/time-logs.schema.ts
import { z } from 'zod'

export const logTimeSchema = z.object({
  minutes: z.number().int().min(1).max(1440),
  logged_at: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
})

export type LogTimeInput = z.infer<typeof logTimeSchema>
```

```ts
// apps/api/src/modules/time-logs/time-logs.queries.ts
import { db } from '../../db'
import type { LogTimeInput } from './time-logs.schema'

export async function listLogs(taskId: string) {
  return db.selectFrom('time_logs as l')
    .leftJoin('workspace_users as u', 'u.user_id', 'l.user_id')
    .select(['l.id', 'l.task_id', 'l.user_id', 'l.minutes', 'l.logged_at', 'l.note', 'u.display_name'])
    .where('l.task_id', '=', taskId)
    .orderBy('l.logged_at', 'desc').execute()
}

export async function createLog(taskId: string, userId: string, input: LogTimeInput) {
  return db.insertInto('time_logs')
    .values({ task_id: taskId, user_id: userId, minutes: input.minutes, logged_at: input.logged_at ?? new Date().toISOString(), note: input.note ?? null })
    .returningAll().executeTakeFirstOrThrow()
}

export async function deleteLog(id: string, userId: string) {
  // only owner can delete
  await db.deleteFrom('time_logs').where('id', '=', id).where('user_id', '=', userId).execute()
}

export async function getProjectTimeTotal(projectId: string) {
  const result = await db.selectFrom('time_logs as l')
    .innerJoin('project_tasks as t', 't.id', 'l.task_id')
    .select(db.fn.sum('l.minutes').as('total_minutes'))
    .where('t.project_id', '=', projectId)
    .executeTakeFirst()
  return Number(result?.total_minutes ?? 0)
}
```

- [ ] **Step 2: Controller + Router**

```ts
// apps/api/src/modules/time-logs/time-logs.controller.ts
import type { Request, Response } from 'express'
import * as q from './time-logs.queries'
import { logTimeSchema } from './time-logs.schema'

export async function list(req: Request, res: Response) {
  return res.json({ data: await q.listLogs(req.params.taskId), error: null })
}

export async function create(req: Request, res: Response) {
  const parsed = logTimeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  const log = await q.createLog(req.params.taskId, req.user.id, parsed.data)
  return res.status(201).json({ data: log, error: null })
}

export async function remove(req: Request, res: Response) {
  await q.deleteLog(req.params.logId, req.user.id)
  return res.json({ data: { success: true }, error: null })
}
```

```ts
// apps/api/src/modules/time-logs/time-logs.router.ts
import { Router } from 'express'
import * as ctrl from './time-logs.controller'

const router = Router({ mergeParams: true })
router.get('/', ctrl.list)
router.post('/', ctrl.create)
router.delete('/:logId', ctrl.remove)
export default router
```

- [ ] **Step 3: Register**

```ts
import timeLogsRouter from './modules/time-logs/time-logs.router'

app.use('/api/projects/:projectId/tasks/:taskId/time-logs', requireWorkspace, timeLogsRouter)
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/time-logs/
git add apps/api/src/index.ts
git commit -m "feat(pm): add time tracking API"
```

---

### Task 4: Gantt/Timeline view

- [ ] **Step 1: GanttChart component**

```tsx
// apps/web/src/components/pm/GanttChart.tsx
'use client'
import { useMemo } from 'react'

interface GanttTask {
  id: string; title: string; start_date: string | null; due_date: string | null
  status_color: string; assignee_name?: string; parent_id: string | null
  dependencies?: string[]
}

interface Props { tasks: GanttTask[]; startDate: Date; endDate: Date }

const DAY_PX = 32
const ROW_H = 40

function dateToPx(date: Date, start: Date): number {
  return Math.round((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) * DAY_PX
}

export function GanttChart({ tasks, startDate, endDate }: Props) {
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  const svgW = totalDays * DAY_PX + 220
  const svgH = tasks.length * ROW_H + 40

  const months = useMemo(() => {
    const result: { label: string; x: number }[] = []
    const cur = new Date(startDate)
    cur.setDate(1)
    while (cur <= endDate) {
      result.push({ label: cur.toLocaleDateString('en', { month: 'short', year: '2-digit' }), x: 220 + dateToPx(cur, startDate) })
      cur.setMonth(cur.getMonth() + 1)
    }
    return result
  }, [startDate, endDate])

  return (
    <div className="overflow-x-auto" style={{ fontFamily: 'DM Sans' }}>
      <svg width={svgW} height={svgH} style={{ display: 'block' }}>
        {/* Month headers */}
        <rect x={0} y={0} width={svgW} height={32} fill="var(--surface2)" />
        {months.map(m => (
          <text key={m.label} x={m.x + 8} y={20} fontSize={11} fill="var(--text2)">{m.label}</text>
        ))}

        {/* Day column lines */}
        {Array.from({ length: totalDays }, (_, i) => (
          <line key={i} x1={220 + i * DAY_PX} y1={0} x2={220 + i * DAY_PX} y2={svgH}
            stroke="var(--border)" strokeWidth={0.5} />
        ))}

        {/* Tasks */}
        {tasks.map((task, i) => {
          const y = 32 + i * ROW_H
          const hasBar = task.start_date && task.due_date
          const barX = hasBar ? 220 + dateToPx(new Date(task.start_date!), startDate) : null
          const barW = hasBar ? Math.max(DAY_PX, dateToPx(new Date(task.due_date!), startDate) - dateToPx(new Date(task.start_date!), startDate)) : null

          return (
            <g key={task.id}>
              {/* Row bg */}
              <rect x={0} y={y} width={svgW} height={ROW_H - 1} fill={i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'} />
              {/* Task name */}
              <text x={8} y={y + 24} fontSize={13} fill="var(--text)"
                style={{ textOverflow: 'ellipsis' }}>
                {task.title.length > 22 ? task.title.slice(0, 22) + '…' : task.title}
              </text>
              {/* Gantt bar */}
              {hasBar && barX !== null && barW !== null && (
                <rect x={barX} y={y + 8} width={barW} height={ROW_H - 18} rx={4}
                  fill={task.status_color} opacity={0.85} />
              )}
              {/* No-date marker */}
              {!hasBar && (
                <text x={svgW - 60} y={y + 24} fontSize={10} fill="var(--text3)">No dates</text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
```

- [ ] **Step 2: Timeline page**

```tsx
// apps/web/src/app/(dashboard)/projects/[id]/timeline/page.tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { GanttChart } from '@/components/pm/GanttChart'

export default function TimelinePage() {
  const { id } = useParams<{ id: string }>()
  const [tasks, setTasks] = useState<any[]>([])
  const [statuses, setStatuses] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${id}/tasks`).then(r => r.json()),
      fetch(`/api/projects/${id}/tasks/statuses`).then(r => r.json()),
    ]).then(([t, s]) => {
      setTasks(t.data ?? [])
      setStatuses(s.data ?? [])
    })
  }, [id])

  const statusMap = useMemo(() => Object.fromEntries(statuses.map((s: any) => [s.id, s])), [statuses])

  const ganttTasks = useMemo(() => tasks.map((t: any) => ({
    id: t.id, title: t.title, start_date: t.start_date ?? null, due_date: t.due_date ?? null,
    status_color: statusMap[t.status_id]?.color ?? '#9e998f',
    parent_id: t.parent_id ?? null,
  })), [tasks, statusMap])

  const { start, end } = useMemo(() => {
    const dates = ganttTasks.flatMap(t => [t.start_date, t.due_date].filter(Boolean).map(d => new Date(d!)))
    if (!dates.length) {
      const now = new Date(); return { start: now, end: new Date(now.getTime() + 30 * 86400000) }
    }
    const min = new Date(Math.min(...dates.map(d => d.getTime())))
    const max = new Date(Math.max(...dates.map(d => d.getTime())))
    min.setDate(min.getDate() - 7)
    max.setDate(max.getDate() + 14)
    return { start: min, end: max }
  }, [ganttTasks])

  if (!tasks.length) return (
    <div className="p-8 text-center" style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>
      No tasks with dates yet. Add start/due dates to see the timeline.
    </div>
  )

  return (
    <div className="p-4">
      <GanttChart tasks={ganttTasks} startDate={start} endDate={end} />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/pm/GanttChart.tsx
git add "apps/web/src/app/(dashboard)/projects/[id]/timeline/page.tsx"
git commit -m "feat(pm): add Gantt/Timeline view"
```

---

### Task 5: Calendar view

- [ ] **Step 1: Calendar page**

```tsx
// apps/web/src/app/(dashboard)/projects/[id]/calendar/page.tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarPage() {
  const { id } = useParams<{ id: string }>()
  const [tasks, setTasks] = useState<any[]>([])
  const [statuses, setStatuses] = useState<any[]>([])
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d })

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${id}/tasks`).then(r => r.json()),
      fetch(`/api/projects/${id}/tasks/statuses`).then(r => r.json()),
    ]).then(([t, s]) => { setTasks(t.data ?? []); setStatuses(s.data ?? []) })
  }, [id])

  const statusMap = useMemo(() => Object.fromEntries(statuses.map((s: any) => [s.id, s])), [statuses])

  const tasksByDate = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const t of tasks) {
      if (t.due_date) {
        const key = t.due_date.split('T')[0]
        if (!map[key]) map[key] = []
        map[key].push(t)
      }
    }
    return map
  }, [tasks])

  const cells = useMemo(() => {
    const result: (Date | null)[] = []
    const first = new Date(month)
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
    for (let i = 0; i < first.getDay(); i++) result.push(null)
    for (let d = 1; d <= last.getDate(); d++) result.push(new Date(month.getFullYear(), month.getMonth(), d))
    return result
  }, [month])

  const monthLabel = month.toLocaleDateString('en', { month: 'long', year: 'numeric' })

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          className="px-3 py-1 rounded border text-sm" style={{ borderColor: 'var(--border)', fontFamily: 'DM Sans', color: 'var(--text)' }}>
          ‹
        </button>
        <span style={{ fontFamily: 'Instrument Serif', fontSize: 18, color: 'var(--text)' }}>{monthLabel}</span>
        <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          className="px-3 py-1 rounded border text-sm" style={{ borderColor: 'var(--border)', fontFamily: 'DM Sans', color: 'var(--text)' }}>
          ›
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px" style={{ background: 'var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {DAYS.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium"
            style={{ background: 'var(--surface2)', color: 'var(--text2)', fontFamily: 'DM Sans' }}>{d}</div>
        ))}
        {cells.map((date, i) => {
          const key = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : ''
          const dayTasks = date ? (tasksByDate[key] ?? []) : []
          const isToday = date ? key === new Date().toISOString().split('T')[0] : false
          return (
            <div key={i} className="min-h-[96px] p-1.5"
              style={{ background: 'var(--surface)', borderRadius: 0 }}>
              {date && (
                <>
                  <div className="text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full"
                    style={{
                      fontFamily: 'DM Sans', color: isToday ? 'white' : 'var(--text2)',
                      background: isToday ? 'var(--blue)' : 'transparent',
                    }}>
                    {date.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map((t: any) => (
                      <div key={t.id} className="text-xs px-1.5 py-0.5 rounded truncate"
                        style={{
                          background: (statusMap[t.status_id]?.color ?? '#9e998f') + '22',
                          color: statusMap[t.status_id]?.color ?? '#9e998f',
                          fontFamily: 'DM Sans', fontSize: 11,
                        }}>
                        {t.title}
                      </div>
                    ))}
                    {dayTasks.length > 3 && (
                      <div className="text-xs" style={{ color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 10 }}>
                        +{dayTasks.length - 3} more
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/(dashboard)/projects/[id]/calendar/page.tsx"
git commit -m "feat(pm): add calendar view"
```

---

### Task 6: Table view

- [ ] **Step 1: Table page**

```tsx
// apps/web/src/app/(dashboard)/projects/[id]/table/page.tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

const PRIORITY_LABELS: Record<string, string> = { LOW: 'Low', MEDIUM: 'Med', HIGH: 'High', URGENT: 'Urgent' }
const PRIORITY_COLORS: Record<string, string> = { LOW: '#6b665c', MEDIUM: '#1e3a8a', HIGH: '#92400e', URGENT: '#991b1b' }

export default function TablePage() {
  const { id } = useParams<{ id: string }>()
  const [tasks, setTasks] = useState<any[]>([])
  const [statuses, setStatuses] = useState<any[]>([])
  const [customFields, setCustomFields] = useState<any[]>([])
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${id}/tasks`).then(r => r.json()),
      fetch(`/api/projects/${id}/tasks/statuses`).then(r => r.json()),
      fetch(`/api/projects/${id}/custom-fields`).then(r => r.json()),
    ]).then(([t, s, cf]) => {
      setTasks(t.data ?? [])
      setStatuses(s.data ?? [])
      setCustomFields(cf.data ?? [])
    })
  }, [id])

  const statusMap = useMemo(() => Object.fromEntries(statuses.map((s: any) => [s.id, s])), [statuses])

  const filtered = useMemo(() => tasks.filter(t => {
    if (filterStatus !== 'all' && t.status_id !== filterStatus) return false
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [tasks, filterStatus, search])

  return (
    <div className="p-4">
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
          className="px-3 py-1.5 rounded-lg border text-sm outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'DM Sans', width: 200 }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg border text-sm outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'DM Sans' }}>
          <option value="all">All statuses</option>
          {statuses.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="text-xs" style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>{filtered.length} tasks</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-sm" style={{ fontFamily: 'DM Sans', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--text2)', width: '40%' }}>Task</th>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--text2)' }}>Status</th>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--text2)' }}>Priority</th>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--text2)' }}>Due</th>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--text2)' }}>Est.</th>
              {customFields.map((cf: any) => (
                <th key={cf.id} className="text-left p-3 font-medium" style={{ color: 'var(--text2)' }}>{cf.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((task: any, i) => {
              const status = statusMap[task.status_id]
              return (
                <tr key={task.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'transparent' }}>
                  <td className="p-3" style={{ color: 'var(--text)' }}>
                    {task.parent_id && <span style={{ marginRight: 8, color: 'var(--text3)' }}>↳</span>}
                    {task.title}
                  </td>
                  <td className="p-3">
                    {status && (
                      <span className="px-2 py-0.5 rounded text-xs" style={{ background: status.color + '22', color: status.color }}>
                        {status.name}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {task.priority && (
                      <span className="text-xs font-medium" style={{ color: PRIORITY_COLORS[task.priority] }}>
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-xs" style={{ color: task.due_date && new Date(task.due_date) < new Date() ? 'var(--red)' : 'var(--text2)' }}>
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="p-3 text-xs" style={{ color: 'var(--text2)' }}>
                    {task.estimated_minutes ? `${Math.round(task.estimated_minutes / 60)}h` : '—'}
                  </td>
                  {customFields.map((cf: any) => (
                    <td key={cf.id} className="p-3 text-xs" style={{ color: 'var(--text2)' }}>—</td>
                  ))}
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={5 + customFields.length} className="p-8 text-center text-sm" style={{ color: 'var(--text3)' }}>No tasks match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/(dashboard)/projects/[id]/table/page.tsx"
git commit -m "feat(pm): add table view with custom field columns"
```

---

### Task 7: Roadmap view

- [ ] **Step 1: Roadmap page**

```tsx
// apps/web/src/app/(dashboard)/projects/[id]/roadmap/page.tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

const QUARTER_MONTHS = [[0,1,2],[3,4,5],[6,7,8],[9,10,11]]
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function RoadmapPage() {
  const { id } = useParams<{ id: string }>()
  const [milestones, setMilestones] = useState<any[]>([])
  const [year, setYear] = useState(() => new Date().getFullYear())

  useEffect(() => {
    fetch(`/api/projects/${id}/milestones`).then(r => r.json()).then(j => setMilestones(j.data ?? []))
  }, [id])

  const quarters = QUARTER_MONTHS.map((months, qi) => ({
    label: `Q${qi + 1} ${year}`,
    months: months.map(m => ({
      label: MONTH_NAMES[m],
      milestones: milestones.filter(ms => {
        if (!ms.due_date) return false
        const d = new Date(ms.due_date)
        return d.getFullYear() === year && d.getMonth() === m
      }),
    })),
  }))

  const STATUS_COLORS: Record<string, string> = {
    PENDING: 'var(--text3)',
    IN_PROGRESS: 'var(--blue)',
    COMPLETED: 'var(--green)',
    AT_RISK: 'var(--amber)',
  }

  return (
    <div className="p-4">
      {/* Year nav */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => setYear(y => y - 1)} className="px-3 py-1 rounded border text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text)', fontFamily: 'DM Sans' }}>‹</button>
        <span style={{ fontFamily: 'Instrument Serif', fontSize: 20, color: 'var(--text)' }}>{year}</span>
        <button onClick={() => setYear(y => y + 1)} className="px-3 py-1 rounded border text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text)', fontFamily: 'DM Sans' }}>›</button>
      </div>

      {/* Quarter grid */}
      <div className="grid grid-cols-4 gap-4">
        {quarters.map(q => (
          <div key={q.label} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text2)', fontFamily: 'DM Sans', letterSpacing: '0.08em' }}>
              {q.label}
            </p>
            <div className="space-y-3">
              {q.months.map(m => (
                <div key={m.label}>
                  {m.milestones.length > 0 && (
                    <>
                      <p className="text-xs mb-1" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>{m.label}</p>
                      <div className="space-y-1.5">
                        {m.milestones.map((ms: any) => (
                          <div key={ms.id} className="flex items-center gap-2 p-2 rounded-lg"
                            style={{ background: 'var(--surface2)' }}>
                            <div className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: STATUS_COLORS[ms.status] ?? 'var(--text3)' }} />
                            <span className="text-xs truncate" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>
                              {ms.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {q.months.every(m => m.milestones.length === 0) && (
                <p className="text-xs italic" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>No milestones</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/(dashboard)/projects/[id]/roadmap/page.tsx"
git commit -m "feat(pm): add roadmap view"
```
