# PM Plan 5: Milestones, Sprints, Members

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API + UI for milestones, sprints, and project member management.

**Architecture:** Three new API modules (`milestones`, `sprints`, `project-members`) following the same router/controller/service/queries pattern. UI pages under `projects/[id]/milestones`, `/sprints`, and `/settings/members`.

**Tech Stack:** Express, Kysely, Zod, Next.js App Router, TypeScript strict

**Prerequisite:** PM Plans 1–4 applied.

---

## File Map

- Create: `apps/api/src/modules/milestones/milestones.{schema,queries,controller,router}.ts`
- Create: `apps/api/src/modules/sprints/sprints.{schema,queries,controller,router}.ts`
- Create: `apps/api/src/modules/project-members/project-members.{schema,queries,controller,router}.ts`
- Create: `apps/web/src/app/(dashboard)/projects/[id]/milestones/page.tsx`
- Create: `apps/web/src/app/(dashboard)/projects/[id]/sprints/page.tsx`
- Create: `apps/web/src/app/(dashboard)/projects/[id]/settings/members/page.tsx`
- Modify: `apps/api/src/index.ts` (register 3 new routers)

---

### Task 1: Milestones API

**Files:**
- Create: `apps/api/src/modules/milestones/milestones.schema.ts`
- Create: `apps/api/src/modules/milestones/milestones.queries.ts`
- Create: `apps/api/src/modules/milestones/milestones.controller.ts`
- Create: `apps/api/src/modules/milestones/milestones.router.ts`

- [ ] **Step 1: Schema**

```ts
// apps/api/src/modules/milestones/milestones.schema.ts
import { z } from 'zod'

export const createMilestoneSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  due_date: z.string().date(),
  client_visible: z.boolean().default(false),
  task_ids: z.array(z.string().uuid()).optional(),
})

export const updateMilestoneSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  due_date: z.string().date().optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'MISSED']).optional(),
  client_visible: z.boolean().optional(),
  task_ids: z.array(z.string().uuid()).optional(),
})

export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>
```

- [ ] **Step 2: Queries**

```ts
// apps/api/src/modules/milestones/milestones.queries.ts
import { db } from '../../db'
import type { CreateMilestoneInput, UpdateMilestoneInput } from './milestones.schema'

export async function listMilestones(projectId: string) {
  const milestones = await db
    .selectFrom('milestones')
    .selectAll()
    .where('project_id', '=', projectId)
    .orderBy('position', 'asc')
    .execute()

  // attach task counts
  const counts = await db
    .selectFrom('milestone_tasks as mt')
    .innerJoin('milestones as m', 'm.id', 'mt.milestone_id')
    .innerJoin('project_task_statuses as s', 's.id',
      db.selectFrom('project_tasks as pt').select('pt.status_id').whereRef('pt.id', '=', 'mt.task_id').limit(1))
    .select(['mt.milestone_id', db.fn.count('mt.task_id').as('total'),
      db.fn.count(db.raw(`case when s.is_done then mt.task_id end`)).as('done')])
    .groupBy('mt.milestone_id')
    .execute()

  const countMap = Object.fromEntries(counts.map(c => [c.milestone_id, c]))

  return milestones.map(m => ({
    ...m,
    task_count: Number(countMap[m.id]?.total ?? 0),
    done_count: Number(countMap[m.id]?.done ?? 0),
  }))
}

export async function createMilestone(projectId: string, input: CreateMilestoneInput) {
  const maxPos = await db
    .selectFrom('milestones')
    .select(db.fn.max('position').as('max'))
    .where('project_id', '=', projectId)
    .executeTakeFirst()

  const milestone = await db
    .insertInto('milestones')
    .values({
      project_id: projectId,
      name: input.name,
      description: input.description ?? null,
      due_date: input.due_date,
      client_visible: input.client_visible,
      position: (Number(maxPos?.max ?? -1)) + 1,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  if (input.task_ids?.length) {
    await db.insertInto('milestone_tasks')
      .values(input.task_ids.map(tid => ({ milestone_id: milestone.id, task_id: tid })))
      .execute()
  }

  return milestone
}

export async function updateMilestone(id: string, projectId: string, input: UpdateMilestoneInput) {
  const updates: Record<string, unknown> = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.description !== undefined) updates.description = input.description
  if (input.due_date !== undefined) updates.due_date = input.due_date
  if (input.status !== undefined) updates.status = input.status
  if (input.client_visible !== undefined) updates.client_visible = input.client_visible

  const milestone = await db
    .updateTable('milestones')
    .set(updates)
    .where('id', '=', id)
    .where('project_id', '=', projectId)
    .returningAll()
    .executeTakeFirstOrThrow()

  if (input.task_ids !== undefined) {
    await db.deleteFrom('milestone_tasks').where('milestone_id', '=', id).execute()
    if (input.task_ids.length) {
      await db.insertInto('milestone_tasks')
        .values(input.task_ids.map(tid => ({ milestone_id: id, task_id: tid })))
        .execute()
    }
  }

  return milestone
}

export async function deleteMilestone(id: string, projectId: string) {
  await db.deleteFrom('milestones').where('id', '=', id).where('project_id', '=', projectId).execute()
}

// Auto-complete milestone if all linked tasks are done
export async function checkMilestoneCompletion(milestoneId: string) {
  const tasks = await db
    .selectFrom('milestone_tasks as mt')
    .innerJoin('project_tasks as t', 't.id', 'mt.task_id')
    .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
    .select(['s.is_done'])
    .where('mt.milestone_id', '=', milestoneId)
    .execute()

  if (tasks.length > 0 && tasks.every(t => t.is_done)) {
    await db.updateTable('milestones')
      .set({ status: 'COMPLETED' })
      .where('id', '=', milestoneId)
      .where('status', '=', 'PENDING')
      .execute()
  }
}
```

- [ ] **Step 3: Controller + Router**

```ts
// apps/api/src/modules/milestones/milestones.controller.ts
import type { Request, Response } from 'express'
import * as q from './milestones.queries'
import { createMilestoneSchema, updateMilestoneSchema } from './milestones.schema'

export async function list(req: Request, res: Response) {
  const milestones = await q.listMilestones(req.params.projectId)
  return res.json({ data: milestones, error: null })
}

export async function create(req: Request, res: Response) {
  const parsed = createMilestoneSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  const milestone = await q.createMilestone(req.params.projectId, parsed.data)
  return res.status(201).json({ data: milestone, error: null })
}

export async function update(req: Request, res: Response) {
  const parsed = updateMilestoneSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  try {
    const milestone = await q.updateMilestone(req.params.milestoneId, req.params.projectId, parsed.data)
    return res.json({ data: milestone, error: null })
  } catch {
    return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Milestone not found' } })
  }
}

export async function remove(req: Request, res: Response) {
  await q.deleteMilestone(req.params.milestoneId, req.params.projectId)
  return res.json({ data: { success: true }, error: null })
}
```

```ts
// apps/api/src/modules/milestones/milestones.router.ts
import { Router } from 'express'
import * as ctrl from './milestones.controller'

const router = Router({ mergeParams: true })
router.get('/', ctrl.list)
router.post('/', ctrl.create)
router.patch('/:milestoneId', ctrl.update)
router.delete('/:milestoneId', ctrl.remove)
export default router
```

- [ ] **Step 4: Register router**

In `apps/api/src/index.ts`:
```ts
import milestonesRouter from './modules/milestones/milestones.router'
app.use('/api/projects/:projectId/milestones', requireWorkspace, milestonesRouter)
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/milestones/
git add apps/api/src/index.ts
git commit -m "feat(pm): add milestones API"
```

---

### Task 2: Sprints API

**Files:**
- Create: `apps/api/src/modules/sprints/sprints.schema.ts`
- Create: `apps/api/src/modules/sprints/sprints.queries.ts`
- Create: `apps/api/src/modules/sprints/sprints.controller.ts`
- Create: `apps/api/src/modules/sprints/sprints.router.ts`

- [ ] **Step 1: Schema**

```ts
// apps/api/src/modules/sprints/sprints.schema.ts
import { z } from 'zod'

export const createSprintSchema = z.object({
  name: z.string().min(1).max(255),
  start_date: z.string().date(),
  end_date: z.string().date(),
  goal: z.string().max(1000).optional(),
})

export const updateSprintSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED']).optional(),
  goal: z.string().max(1000).nullable().optional(),
})

export const addSprintTaskSchema = z.object({
  task_id: z.string().uuid(),
  points: z.number().int().min(0).optional(),
})

export const closeSprintSchema = z.object({
  incomplete_action: z.enum(['carry_over', 'backlog']),
  next_sprint_id: z.string().uuid().optional(),
})

export type CreateSprintInput = z.infer<typeof createSprintSchema>
export type UpdateSprintInput = z.infer<typeof updateSprintSchema>
export type CloseSprintInput = z.infer<typeof closeSprintSchema>
```

- [ ] **Step 2: Queries**

```ts
// apps/api/src/modules/sprints/sprints.queries.ts
import { db } from '../../db'
import type { CreateSprintInput, UpdateSprintInput, CloseSprintInput } from './sprints.schema'

export async function listSprints(projectId: string) {
  return db.selectFrom('sprints').selectAll()
    .where('project_id', '=', projectId)
    .orderBy('start_date', 'desc')
    .execute()
}

export async function getSprint(id: string, projectId: string) {
  return db.selectFrom('sprints').selectAll()
    .where('id', '=', id).where('project_id', '=', projectId)
    .executeTakeFirst()
}

export async function createSprint(projectId: string, input: CreateSprintInput) {
  return db.insertInto('sprints')
    .values({ project_id: projectId, ...input, goal: input.goal ?? null })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function updateSprint(id: string, projectId: string, input: UpdateSprintInput) {
  return db.updateTable('sprints').set(input)
    .where('id', '=', id).where('project_id', '=', projectId)
    .returningAll().executeTakeFirstOrThrow()
}

export async function getSprintTasks(sprintId: string) {
  return db.selectFrom('sprint_tasks as st')
    .innerJoin('project_tasks as t', 't.id', 'st.task_id')
    .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
    .select(['t.id', 't.title', 't.priority', 't.status_id', 's.name as status_name', 's.is_done', 'st.points'])
    .where('st.sprint_id', '=', sprintId)
    .execute()
}

export async function addSprintTask(sprintId: string, taskId: string, points?: number) {
  await db.insertInto('sprint_tasks')
    .values({ sprint_id: sprintId, task_id: taskId, points: points ?? null })
    .onConflict(oc => oc.columns(['sprint_id', 'task_id']).doUpdateSet({ points: points ?? null }))
    .execute()
}

export async function removeSprintTask(sprintId: string, taskId: string) {
  await db.deleteFrom('sprint_tasks')
    .where('sprint_id', '=', sprintId).where('task_id', '=', taskId).execute()
}

export async function closeSprint(id: string, projectId: string, input: CloseSprintInput) {
  // Calculate velocity: sum points of done tasks
  const tasks = await getSprintTasks(id)
  const velocity = tasks.filter(t => t.is_done).reduce((sum, t) => sum + (t.points ?? 0), 0)

  await db.updateTable('sprints').set({ status: 'COMPLETED', velocity })
    .where('id', '=', id).where('project_id', '=', projectId).execute()

  const incompleteTasks = tasks.filter(t => !t.is_done).map(t => t.id)

  if (input.incomplete_action === 'carry_over' && input.next_sprint_id && incompleteTasks.length) {
    // Move to next sprint
    await db.deleteFrom('sprint_tasks').where('sprint_id', '=', id)
      .where('task_id', 'in', incompleteTasks).execute()
    await db.insertInto('sprint_tasks')
      .values(incompleteTasks.map(tid => ({ sprint_id: input.next_sprint_id!, task_id: tid })))
      .onConflict(oc => oc.columns(['sprint_id', 'task_id']).doNothing())
      .execute()
  } else if (input.incomplete_action === 'backlog') {
    // Remove from sprint (tasks return to project backlog)
    await db.deleteFrom('sprint_tasks').where('sprint_id', '=', id)
      .where('task_id', 'in', incompleteTasks).execute()
  }

  return { velocity, incomplete_count: incompleteTasks.length }
}
```

- [ ] **Step 3: Controller + Router**

```ts
// apps/api/src/modules/sprints/sprints.controller.ts
import type { Request, Response } from 'express'
import * as q from './sprints.queries'
import { createSprintSchema, updateSprintSchema, addSprintTaskSchema, closeSprintSchema } from './sprints.schema'

export async function list(req: Request, res: Response) {
  return res.json({ data: await q.listSprints(req.params.projectId), error: null })
}

export async function create(req: Request, res: Response) {
  const parsed = createSprintSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  const sprint = await q.createSprint(req.params.projectId, parsed.data)
  return res.status(201).json({ data: sprint, error: null })
}

export async function update(req: Request, res: Response) {
  const parsed = updateSprintSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  try {
    const sprint = await q.updateSprint(req.params.sprintId, req.params.projectId, parsed.data)
    return res.json({ data: sprint, error: null })
  } catch {
    return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Sprint not found' } })
  }
}

export async function tasks(req: Request, res: Response) {
  return res.json({ data: await q.getSprintTasks(req.params.sprintId), error: null })
}

export async function addTask(req: Request, res: Response) {
  const parsed = addSprintTaskSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  await q.addSprintTask(req.params.sprintId, parsed.data.task_id, parsed.data.points)
  return res.json({ data: { success: true }, error: null })
}

export async function removeTask(req: Request, res: Response) {
  await q.removeSprintTask(req.params.sprintId, req.params.taskId)
  return res.json({ data: { success: true }, error: null })
}

export async function close(req: Request, res: Response) {
  const parsed = closeSprintSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  const result = await q.closeSprint(req.params.sprintId, req.params.projectId, parsed.data)
  return res.json({ data: result, error: null })
}
```

```ts
// apps/api/src/modules/sprints/sprints.router.ts
import { Router } from 'express'
import * as ctrl from './sprints.controller'
const router = Router({ mergeParams: true })
router.get('/', ctrl.list)
router.post('/', ctrl.create)
router.patch('/:sprintId', ctrl.update)
router.get('/:sprintId/tasks', ctrl.tasks)
router.post('/:sprintId/tasks', ctrl.addTask)
router.delete('/:sprintId/tasks/:taskId', ctrl.removeTask)
router.post('/:sprintId/close', ctrl.close)
export default router
```

- [ ] **Step 4: Register**

In `apps/api/src/index.ts`:
```ts
import sprintsRouter from './modules/sprints/sprints.router'
app.use('/api/projects/:projectId/sprints', requireWorkspace, sprintsRouter)
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/sprints/
git add apps/api/src/index.ts
git commit -m "feat(pm): add sprints API"
```

---

### Task 3: Project members API

**Files:**
- Create: `apps/api/src/modules/project-members/project-members.schema.ts`
- Create: `apps/api/src/modules/project-members/project-members.queries.ts`
- Create: `apps/api/src/modules/project-members/project-members.controller.ts`
- Create: `apps/api/src/modules/project-members/project-members.router.ts`

- [ ] **Step 1: Schema + Queries**

```ts
// apps/api/src/modules/project-members/project-members.schema.ts
import { z } from 'zod'

export const inviteMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['OWNER', 'MANAGER', 'MEMBER', 'VIEWER']).default('MEMBER'),
})

export const updateMemberSchema = z.object({
  role: z.enum(['OWNER', 'MANAGER', 'MEMBER', 'VIEWER']),
})

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>
```

```ts
// apps/api/src/modules/project-members/project-members.queries.ts
import { db } from '../../db'
import type { InviteMemberInput, UpdateMemberInput } from './project-members.schema'

export async function listMembers(projectId: string) {
  return db.selectFrom('project_members as pm')
    .leftJoin('users as u', 'u.id', 'pm.user_id')
    .select(['pm.id', 'pm.project_id', 'pm.user_id', 'pm.role', 'pm.joined_at', 'u.name', 'u.email'])
    .where('pm.project_id', '=', projectId)
    .execute()
}

export async function getMember(projectId: string, userId: string) {
  return db.selectFrom('project_members')
    .selectAll()
    .where('project_id', '=', projectId)
    .where('user_id', '=', userId)
    .executeTakeFirst()
}

export async function addMember(projectId: string, input: InviteMemberInput) {
  return db.insertInto('project_members')
    .values({ project_id: projectId, user_id: input.user_id, role: input.role })
    .onConflict(oc => oc.columns(['project_id', 'user_id']).doUpdateSet({ role: input.role }))
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function updateMember(id: string, projectId: string, input: UpdateMemberInput) {
  return db.updateTable('project_members').set({ role: input.role })
    .where('id', '=', id).where('project_id', '=', projectId)
    .returningAll().executeTakeFirstOrThrow()
}

export async function removeMember(id: string, projectId: string) {
  await db.deleteFrom('project_members').where('id', '=', id).where('project_id', '=', projectId).execute()
}

export async function assertMemberRole(projectId: string, userId: string, minRole: string[]) {
  const member = await getMember(projectId, userId)
  if (!member || !minRole.includes(member.role)) return false
  return true
}
```

- [ ] **Step 2: Controller + Router**

```ts
// apps/api/src/modules/project-members/project-members.controller.ts
import type { Request, Response } from 'express'
import * as q from './project-members.queries'
import { inviteMemberSchema, updateMemberSchema } from './project-members.schema'

export async function list(req: Request, res: Response) {
  return res.json({ data: await q.listMembers(req.params.projectId), error: null })
}

export async function invite(req: Request, res: Response) {
  const parsed = inviteMemberSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  const member = await q.addMember(req.params.projectId, parsed.data)
  return res.status(201).json({ data: member, error: null })
}

export async function update(req: Request, res: Response) {
  const parsed = updateMemberSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  try {
    const member = await q.updateMember(req.params.memberId, req.params.projectId, parsed.data)
    return res.json({ data: member, error: null })
  } catch {
    return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Member not found' } })
  }
}

export async function remove(req: Request, res: Response) {
  await q.removeMember(req.params.memberId, req.params.projectId)
  return res.json({ data: { success: true }, error: null })
}
```

```ts
// apps/api/src/modules/project-members/project-members.router.ts
import { Router } from 'express'
import * as ctrl from './project-members.controller'
const router = Router({ mergeParams: true })
router.get('/', ctrl.list)
router.post('/invite', ctrl.invite)
router.patch('/:memberId', ctrl.update)
router.delete('/:memberId', ctrl.remove)
export default router
```

- [ ] **Step 3: Register**

In `apps/api/src/index.ts`:
```ts
import projectMembersRouter from './modules/project-members/project-members.router'
app.use('/api/projects/:projectId/members', requireWorkspace, projectMembersRouter)
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/project-members/
git add apps/api/src/index.ts
git commit -m "feat(pm): add project members API"
```

---

### Task 4: Milestones UI

**Files:**
- Create: `apps/web/src/app/(dashboard)/projects/[id]/milestones/page.tsx`

- [ ] **Step 1: Write page**

```tsx
// apps/web/src/app/(dashboard)/projects/[id]/milestones/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Milestone {
  id: string; name: string; description: string | null; due_date: string
  status: string; client_visible: boolean; task_count: number; done_count: number
}

const STATUS_STYLES = {
  PENDING: { color: '#1e3a8a', bg: '#dbeafe', label: 'Pending' },
  COMPLETED: { color: '#2d6a4f', bg: '#d8f3dc', label: 'Completed' },
  MISSED: { color: '#991b1b', bg: '#fee2e2', label: 'Missed' },
}

export default function MilestonesPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [clientVisible, setClientVisible] = useState(false)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/milestones`)
      .then(r => r.json()).then(j => setMilestones(j.data ?? []))
  }, [projectId])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(`/api/projects/${projectId}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, due_date: dueDate, client_visible: clientVisible }),
    })
    const json = await res.json()
    setMilestones(prev => [...prev, json.data])
    setShowForm(false); setName(''); setDueDate('')
  }

  async function markComplete(id: string) {
    await fetch(`/api/projects/${projectId}/milestones/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    })
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, status: 'COMPLETED' } : m))
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)' }}>Milestones</h2>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: 'var(--text)', color: '#fff', fontFamily: 'DM Sans' }}>
          + Add Milestone
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="mb-6 p-4 rounded-xl border space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Milestone name"
            required className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: 'var(--border)', fontFamily: 'DM Sans', color: 'var(--text)' }} />
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            required className="px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: 'var(--border)', fontFamily: 'DM Sans', color: 'var(--text)' }} />
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={clientVisible} onChange={e => setClientVisible(e.target.checked)} id="cv" />
            <label htmlFor="cv" className="text-sm" style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>Visible in client portal</label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 text-sm rounded-lg"
              style={{ background: 'var(--text)', color: '#fff', fontFamily: 'DM Sans' }}>Create</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm rounded-lg"
              style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {milestones.map(m => {
          const style = STATUS_STYLES[m.status as keyof typeof STATUS_STYLES]
          const pct = m.task_count > 0 ? Math.round((m.done_count / m.task_count) * 100) : 0
          return (
            <div key={m.id} className="p-4 rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-sm" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>{m.name}</h3>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: style.bg, color: style.color, fontFamily: 'DM Sans' }}>
                      {style.label}
                    </span>
                    {m.client_visible && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface2)', color: 'var(--text3)', fontFamily: 'DM Sans' }}>
                        Client visible
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>
                    Due {new Date(m.due_date).toLocaleDateString()} · {m.done_count}/{m.task_count} tasks
                  </p>
                  {m.task_count > 0 && (
                    <div className="mt-2 h-1 rounded-full" style={{ background: 'var(--surface2)', maxWidth: 200 }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--green)' }} />
                    </div>
                  )}
                </div>
                {m.status === 'PENDING' && (
                  <button onClick={() => markComplete(m.id)}
                    className="text-xs px-2 py-1 rounded border flex-shrink-0"
                    style={{ borderColor: 'var(--border)', color: 'var(--text2)', fontFamily: 'DM Sans' }}>
                    Mark complete
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {milestones.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>No milestones yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/(dashboard)/projects/[id]/milestones/page.tsx"
git commit -m "feat(pm): add milestones UI page"
```

---

### Task 5: Sprints UI + Members UI

**Files:**
- Create: `apps/web/src/app/(dashboard)/projects/[id]/sprints/page.tsx`
- Create: `apps/web/src/app/(dashboard)/projects/[id]/settings/members/page.tsx`

- [ ] **Step 1: Sprints page**

```tsx
// apps/web/src/app/(dashboard)/projects/[id]/sprints/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Sprint {
  id: string; name: string; start_date: string; end_date: string
  status: string; goal: string | null; velocity: number | null
}

const STATUS_STYLES = {
  PLANNED: { color: '#6b665c', bg: 'var(--surface2)', label: 'Planned' },
  ACTIVE: { color: '#1e3a8a', bg: '#dbeafe', label: 'Active' },
  COMPLETED: { color: '#2d6a4f', bg: '#d8f3dc', label: 'Completed' },
}

export default function SprintsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [goal, setGoal] = useState('')

  useEffect(() => {
    fetch(`/api/projects/${projectId}/sprints`).then(r => r.json()).then(j => setSprints(j.data ?? []))
  }, [projectId])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(`/api/projects/${projectId}/sprints`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, start_date: startDate, end_date: endDate, goal: goal || undefined }),
    })
    const json = await res.json()
    setSprints(prev => [json.data, ...prev])
    setShowForm(false); setName(''); setStartDate(''); setEndDate(''); setGoal('')
  }

  async function activate(id: string) {
    await fetch(`/api/projects/${projectId}/sprints/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACTIVE' }),
    })
    setSprints(prev => prev.map(s => s.id === id ? { ...s, status: 'ACTIVE' } : s))
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)' }}>Sprints</h2>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: 'var(--text)', color: '#fff', fontFamily: 'DM Sans' }}>
          + New Sprint
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="mb-6 p-4 rounded-xl border space-y-3" style={{ borderColor: 'var(--border)' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Sprint name" required
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: 'var(--border)', fontFamily: 'DM Sans', color: 'var(--text)' }} />
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required
              className="px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border)', fontFamily: 'DM Sans', color: 'var(--text)' }} />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required
              className="px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border)', fontFamily: 'DM Sans', color: 'var(--text)' }} />
          </div>
          <input value={goal} onChange={e => setGoal(e.target.value)} placeholder="Sprint goal (optional)"
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
        {sprints.map(s => {
          const style = STATUS_STYLES[s.status as keyof typeof STATUS_STYLES]
          return (
            <div key={s.id} className="p-4 rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>{s.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: style.bg, color: style.color, fontFamily: 'DM Sans' }}>
                      {style.label}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>
                    {new Date(s.start_date).toLocaleDateString()} → {new Date(s.end_date).toLocaleDateString()}
                    {s.velocity !== null && ` · ${s.velocity} pts velocity`}
                  </p>
                  {s.goal && <p className="text-xs mt-1 italic" style={{ color: 'var(--text2)', fontFamily: 'DM Sans' }}>"{s.goal}"</p>}
                </div>
                {s.status === 'PLANNED' && (
                  <button onClick={() => activate(s.id)} className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: 'var(--border)', color: 'var(--text2)', fontFamily: 'DM Sans' }}>
                    Activate
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {sprints.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>No sprints yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Members settings page**

```tsx
// apps/web/src/app/(dashboard)/projects/[id]/settings/members/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Member {
  id: string; user_id: string; role: string; joined_at: string
  name: string | null; email: string | null
}

const ROLES = ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'] as const

export default function MembersSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    fetch(`/api/projects/${projectId}/members`).then(r => r.json()).then(j => setMembers(j.data ?? []))
  }, [projectId])

  async function changeRole(memberId: string, role: string) {
    await fetch(`/api/projects/${projectId}/members/${memberId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role } : m))
  }

  async function remove(memberId: string) {
    await fetch(`/api/projects/${projectId}/members/${memberId}`, { method: 'DELETE' })
    setMembers(prev => prev.filter(m => m.id !== memberId))
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)', marginBottom: 24 }}>
        Members
      </h2>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        {members.map((m, i) => (
          <div key={m.id} className="flex items-center gap-4 px-4 py-3"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>
                {m.name ?? m.email ?? 'Unknown'}
              </p>
              {m.email && <p className="text-xs truncate" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>{m.email}</p>}
            </div>
            <select
              value={m.role}
              onChange={e => changeRole(m.id, e.target.value)}
              className="px-2 py-1 rounded border text-xs"
              style={{ borderColor: 'var(--border)', fontFamily: 'DM Sans', color: 'var(--text)', background: 'var(--surface)' }}
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={() => remove(m.id)} className="text-xs px-2 py-1 rounded"
              style={{ color: 'var(--red)', fontFamily: 'DM Sans' }}>Remove</button>
          </div>
        ))}
        {members.length === 0 && (
          <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>
            No members yet.
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/projects/[id]/sprints/page.tsx"
git add "apps/web/src/app/(dashboard)/projects/[id]/settings/members/page.tsx"
git commit -m "feat(pm): add sprints UI and members settings page"
```
