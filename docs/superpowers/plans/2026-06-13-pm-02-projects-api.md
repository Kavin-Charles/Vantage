# PM Plan 2: Projects API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full CRUD REST API for projects — create, list, get, update, archive/delete — workspace-scoped, authenticated, validated.

**Architecture:** `projects` module with router → controller → service → queries pattern. All routes protected by existing `requireWorkspace` middleware. Zod for input validation. `{ data, error }` response envelope.

**Tech Stack:** Express, Kysely, Zod, TypeScript strict, Vitest + Supertest

**Prerequisite:** PM Plan 1 (database) must be applied.

---

## File Map

- Create: `apps/api/src/modules/projects/projects.schema.ts`
- Create: `apps/api/src/modules/projects/projects.queries.ts`
- Create: `apps/api/src/modules/projects/projects.service.ts`
- Create: `apps/api/src/modules/projects/projects.controller.ts`
- Create: `apps/api/src/modules/projects/projects.router.ts`
- Create: `apps/api/src/__tests__/projects.test.ts`
- Modify: `apps/api/src/index.ts` (register projects router)

---

### Task 1: Zod schemas

**Files:**
- Create: `apps/api/src/modules/projects/projects.schema.ts`

- [ ] **Step 1: Write schemas**

```ts
// apps/api/src/modules/projects/projects.schema.ts
import { z } from 'zod'

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.unknown().optional(),
  cover_image: z.string().url().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  budget: z.number().positive().optional(),
})

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.unknown().optional(),
  cover_image: z.string().url().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  health: z.enum(['ON_TRACK', 'AT_RISK', 'OFF_TRACK']).optional(),
  start_date: z.string().date().nullable().optional(),
  end_date: z.string().date().nullable().optional(),
  budget: z.number().positive().nullable().optional(),
})

export const listProjectsSchema = z.object({
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  health: z.enum(['ON_TRACK', 'AT_RISK', 'OFF_TRACK']).optional(),
  search: z.string().optional(),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
export type ListProjectsInput = z.infer<typeof listProjectsSchema>
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/projects/projects.schema.ts
git commit -m "feat(pm): add projects Zod schemas"
```

---

### Task 2: Queries

**Files:**
- Create: `apps/api/src/modules/projects/projects.queries.ts`

- [ ] **Step 1: Write Kysely queries**

```ts
// apps/api/src/modules/projects/projects.queries.ts
import { db } from '../../db'
import type { CreateProjectInput, UpdateProjectInput, ListProjectsInput } from './projects.schema'

export async function listProjects(workspaceId: string, filters: ListProjectsInput) {
  let query = db
    .selectFrom('projects')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('status', '!=', 'DELETED')
    .orderBy('created_at', 'desc')

  if (filters.status) query = query.where('status', '=', filters.status)
  if (filters.health) query = query.where('health', '=', filters.health)
  if (filters.search) query = query.where('name', 'ilike', `%${filters.search}%`)

  return query.execute()
}

export async function getProject(id: string, workspaceId: string) {
  return db
    .selectFrom('projects')
    .selectAll()
    .where('id', '=', id)
    .where('workspace_id', '=', workspaceId)
    .where('status', '!=', 'DELETED')
    .executeTakeFirst()
}

export async function createProject(
  workspaceId: string,
  userId: string,
  input: CreateProjectInput
) {
  return db
    .insertInto('projects')
    .values({
      workspace_id: workspaceId,
      created_by: userId,
      name: input.name,
      description: input.description ? JSON.stringify(input.description) : null,
      cover_image: input.cover_image ?? null,
      color: input.color ?? null,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      budget: input.budget ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function updateProject(
  id: string,
  workspaceId: string,
  input: UpdateProjectInput
) {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) updates.name = input.name
  if (input.description !== undefined) updates.description = input.description ? JSON.stringify(input.description) : null
  if (input.cover_image !== undefined) updates.cover_image = input.cover_image
  if (input.color !== undefined) updates.color = input.color
  if (input.status !== undefined) updates.status = input.status
  if (input.health !== undefined) updates.health = input.health
  if (input.start_date !== undefined) updates.start_date = input.start_date
  if (input.end_date !== undefined) updates.end_date = input.end_date
  if (input.budget !== undefined) updates.budget = input.budget

  return db
    .updateTable('projects')
    .set(updates)
    .where('id', '=', id)
    .where('workspace_id', '=', workspaceId)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function deleteProject(id: string, workspaceId: string) {
  return db
    .updateTable('projects')
    .set({ status: 'DELETED', updated_at: new Date().toISOString() })
    .where('id', '=', id)
    .where('workspace_id', '=', workspaceId)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function getProjectProgress(projectId: string) {
  const result = await db
    .selectFrom('project_tasks as t')
    .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
    .select(db.fn.count('t.id').as('total'))
    .select(
      db.fn.count(db.raw(`case when s.is_done then t.id end`)).as('done')
    )
    .where('t.project_id', '=', projectId)
    .where('t.parent_id', 'is', null)
    .executeTakeFirst()

  const total = Number(result?.total ?? 0)
  const done = Number(result?.done ?? 0)
  return total === 0 ? 0 : Math.round((done / total) * 100)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/projects/projects.queries.ts
git commit -m "feat(pm): add projects Kysely queries"
```

---

### Task 3: Service

**Files:**
- Create: `apps/api/src/modules/projects/projects.service.ts`

- [ ] **Step 1: Write service**

```ts
// apps/api/src/modules/projects/projects.service.ts
import * as q from './projects.queries'
import type { CreateProjectInput, UpdateProjectInput, ListProjectsInput } from './projects.schema'

export async function listProjects(workspaceId: string, filters: ListProjectsInput) {
  return q.listProjects(workspaceId, filters)
}

export async function getProject(id: string, workspaceId: string) {
  const project = await q.getProject(id, workspaceId)
  if (!project) return null
  const progress = await q.getProjectProgress(id)
  return { ...project, progress }
}

export async function createProject(
  workspaceId: string,
  userId: string,
  input: CreateProjectInput
) {
  const project = await q.createProject(workspaceId, userId, input)
  // seed default task statuses
  const { seedDefaultStatuses } = await import('../project-tasks/project-tasks.queries')
  await seedDefaultStatuses(project.id)
  return project
}

export async function updateProject(
  id: string,
  workspaceId: string,
  input: UpdateProjectInput
) {
  return q.updateProject(id, workspaceId, input)
}

export async function deleteProject(id: string, workspaceId: string) {
  return q.deleteProject(id, workspaceId)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/projects/projects.service.ts
git commit -m "feat(pm): add projects service"
```

---

### Task 4: Controller

**Files:**
- Create: `apps/api/src/modules/projects/projects.controller.ts`

- [ ] **Step 1: Write controller**

```ts
// apps/api/src/modules/projects/projects.controller.ts
import type { Request, Response } from 'express'
import * as service from './projects.service'
import { createProjectSchema, updateProjectSchema, listProjectsSchema } from './projects.schema'

export async function list(req: Request, res: Response) {
  const parsed = listProjectsSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  const projects = await service.listProjects(req.workspace.id, parsed.data)
  return res.json({ data: projects, error: null })
}

export async function get(req: Request, res: Response) {
  const project = await service.getProject(req.params.id, req.workspace.id)
  if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
  return res.json({ data: project, error: null })
}

export async function create(req: Request, res: Response) {
  const parsed = createProjectSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  const project = await service.createProject(req.workspace.id, req.user.id, parsed.data)
  return res.status(201).json({ data: project, error: null })
}

export async function update(req: Request, res: Response) {
  const parsed = updateProjectSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  try {
    const project = await service.updateProject(req.params.id, req.workspace.id, parsed.data)
    return res.json({ data: project, error: null })
  } catch {
    return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
  }
}

export async function remove(req: Request, res: Response) {
  try {
    await service.deleteProject(req.params.id, req.workspace.id)
    return res.json({ data: { success: true }, error: null })
  } catch {
    return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/projects/projects.controller.ts
git commit -m "feat(pm): add projects controller"
```

---

### Task 5: Router + registration

**Files:**
- Create: `apps/api/src/modules/projects/projects.router.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write router**

```ts
// apps/api/src/modules/projects/projects.router.ts
import { Router } from 'express'
import * as ctrl from './projects.controller'

const router = Router()

router.get('/', ctrl.list)
router.post('/', ctrl.create)
router.get('/:id', ctrl.get)
router.patch('/:id', ctrl.update)
router.delete('/:id', ctrl.remove)

export default router
```

- [ ] **Step 2: Register in main app**

In `apps/api/src/index.ts`, find where other routers are registered (look for `app.use('/api/...'`) and add:

```ts
import projectsRouter from './modules/projects/projects.router'
// ...
app.use('/api/projects', requireWorkspace, projectsRouter)
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/projects/projects.router.ts apps/api/src/index.ts
git commit -m "feat(pm): register projects router"
```

---

### Task 6: API tests

**Files:**
- Create: `apps/api/src/__tests__/projects.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/api/src/__tests__/projects.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../index'
import { getTestToken, getTestWorkspaceId, cleanupProjects } from './helpers'

describe('Projects API', () => {
  let token: string
  let workspaceId: string

  beforeEach(async () => {
    token = await getTestToken()
    workspaceId = await getTestWorkspaceId()
    await cleanupProjects(workspaceId)
  })

  it('GET /api/projects returns empty list', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
    expect(res.body.error).toBeNull()
  })

  it('POST /api/projects creates project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Project' })
    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Test Project')
    expect(res.body.data.workspace_id).toBe(workspaceId)
    expect(res.body.data.status).toBe('ACTIVE')
  })

  it('GET /api/projects/:id returns project with progress', async () => {
    const created = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Project' })
    const res = await request(app)
      .get(`/api/projects/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.progress).toBe(0)
  })

  it('PATCH /api/projects/:id updates health', async () => {
    const created = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Project' })
    const res = await request(app)
      .patch(`/api/projects/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ health: 'AT_RISK' })
    expect(res.status).toBe(200)
    expect(res.body.data.health).toBe('AT_RISK')
  })

  it('DELETE /api/projects/:id soft-deletes', async () => {
    const created = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Project' })
    await request(app)
      .delete(`/api/projects/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
    const res = await request(app)
      .get(`/api/projects/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it('POST /api/projects validates name required', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION')
  })
})
```

- [ ] **Step 2: Run tests — expect failures (routes exist now)**

```bash
cd apps/api
pnpm test src/__tests__/projects.test.ts
```

Expected: tests may fail if test helpers don't exist yet — add minimal `helpers.ts` with `getTestToken`, `getTestWorkspaceId`, `cleanupProjects` using your existing test auth pattern.

- [ ] **Step 3: Run tests until passing**

```bash
pnpm test src/__tests__/projects.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/__tests__/projects.test.ts
git commit -m "test(pm): add projects API tests"
```
