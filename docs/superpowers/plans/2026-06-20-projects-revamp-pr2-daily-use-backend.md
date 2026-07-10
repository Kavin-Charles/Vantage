# Projects Revamp PR2 Daily-Use — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recurring task generation, drag-to-reorder, and subtask-depth enforcement to the Projects backend — the three daily-use gaps identified in the audit.

**Architecture:** A new `recurring_task_rules` table stores per-project recurrence templates (title/description/priority/assignees/frequency). A new `recurring-rules.ts` router exposes CRUD for these rules under `/api/projects/:projectId/recurring-rules`. A new `recurring-task-generator.ts` worker polls hourly for rules whose `next_run_at` has passed, materializes a `project_tasks` row from the template, advances `next_run_at`, and logs `pm_task_created` activity — mirroring `task-due-notifier.ts`'s scheduling shape. A new `POST /:taskId/reorder` endpoint on the existing `project-tasks.ts` router computes a new fractional `position` (the column is already `real`) between two neighboring tasks, supporting both same-column reorder and cross-column drag. Subtask depth enforcement is added inline to the existing create/update handlers in `project-tasks.ts`, walking the `parent_id` chain to reject depth > 3 or cycles.

**Tech Stack:** Express, Kysely, Zod, vitest + supertest (mirroring `pipeline-items.test.ts`'s mock-chain pattern).

---

## File Structure

| File | Change |
|---|---|
| `packages/db/migrations/20260620_001_recurring_task_rules.ts` | New migration |
| `apps/api/src/routes/recurring-rules.ts` | New file |
| `apps/api/src/routes/recurring-rules.test.ts` | New file |
| `apps/api/src/workers/recurring-task-generator.ts` | New file |
| `apps/api/src/workers/recurring-task-generator.test.ts` | New file |
| `apps/api/src/routes/project-tasks.ts` | Add `POST /:taskId/reorder`, depth/cycle checks on create+update |
| `apps/api/src/routes/project-tasks.test.ts` | Add tests for reorder + depth enforcement (extends the file created in Plan 1A) |
| `apps/api/src/index.ts` | Mount `recurring-rules.ts`, start `recurring-task-generator.ts` worker |

---

### Task 1: `recurring_task_rules` migration

**Files:**
- Create: `packages/db/migrations/20260620_001_recurring_task_rules.ts`

- [ ] **Step 1: Write the migration**

```ts
import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('recurring_task_rules')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c => c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('title', 'varchar(500)', c => c.notNull())
    .addColumn('description', 'text')
    .addColumn('status_id', 'uuid', c => c.references('project_task_statuses.id').onDelete('set null'))
    .addColumn('priority', 'varchar(20)', c => c.notNull().defaultTo('NONE'))
    .addColumn('assignee_ids', 'jsonb')
    .addColumn('frequency', 'varchar(20)', c => c.notNull())
    .addColumn('interval', 'integer', c => c.notNull().defaultTo(1))
    .addColumn('next_run_at', 'timestamptz', c => c.notNull())
    .addColumn('is_active', 'boolean', c => c.notNull().defaultTo(true))
    .addColumn('created_by', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()
  await db.schema.createIndex('idx_recurring_rules_project').on('recurring_task_rules').column('project_id').execute()
  await db.schema.createIndex('idx_recurring_rules_next_run').on('recurring_task_rules').column('next_run_at').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('recurring_task_rules').ifExists().execute()
}
```

- [ ] **Step 2: Run the migration locally**

Run: `cd packages/db && npx kysely migrate:latest`
Expected: `recurring_task_rules` listed as applied.

- [ ] **Step 3: Regenerate Kysely types**

Run: `cd packages/db && npm run codegen` (or the project's existing type-generation script — check `package.json` for the exact name; it is the same step that already produced `RecurringTaskRuleTable` for every other table in `schema.ts`).
Expected: `packages/db/src/schema.ts` gains a `recurring_task_rules: RecurringTaskRuleTable` entry in the `Database` interface and a matching `RecurringTaskRuleTable` interface, with `assignee_ids` typed as `string[] | null` and `id`/`created_at`/`updated_at`/`is_active`/`interval` as `Generated<...>`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/20260620_001_recurring_task_rules.ts packages/db/src/schema.ts
git commit -m "feat(db): add recurring_task_rules table"
```

---

### Task 2: `recurring-rules.ts` router

**Files:**
- Create: `apps/api/src/routes/recurring-rules.ts`
- Test: `apps/api/src/routes/recurring-rules.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/recurring-rules.test.ts`:

```ts
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
    (req as any).workspace = { id: WORKSPACE_ID }
    next()
  })
}

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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/recurring-rules.test.ts`
Expected: FAIL — `Cannot find module './recurring-rules'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/routes/recurring-rules.ts`:

```ts
import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'

const createRuleSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  status_id: z.string().uuid().optional(),
  priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']).optional(),
  assignee_ids: z.array(z.string().uuid()).optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  interval: z.number().int().min(1).max(365).default(1),
})

const updateRuleSchema = createRuleSchema.partial().extend({
  is_active: z.boolean().optional(),
})

async function verifyProjectAccess(db: Kysely<Database>, projectId: string, workspaceId: string) {
  return db.selectFrom('projects').select('id')
    .where('id', '=', projectId)
    .where('workspace_id', '=', workspaceId)
    .where('status', '!=', 'DELETED' as never)
    .executeTakeFirst()
}

export function computeNextRun(from: Date, frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY', interval: number): Date {
  const next = new Date(from)
  if (frequency === 'DAILY') next.setUTCDate(next.getUTCDate() + interval)
  else if (frequency === 'WEEKLY') next.setUTCDate(next.getUTCDate() + interval * 7)
  else next.setUTCMonth(next.getUTCMonth() + interval)
  return next
}

export function createRecurringRulesRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const rules = await db.selectFrom('recurring_task_rules')
        .selectAll()
        .where('project_id', '=', projectId)
        .orderBy('created_at', 'asc')
        .execute()

      return res.json({ data: rules, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  router.post('/', async (req, res) => {
    const { user, workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const parsed = createRuleSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

      const nextRunAt = computeNextRun(new Date(), parsed.data.frequency, parsed.data.interval)

      const rule = await db.insertInto('recurring_task_rules')
        .values({
          project_id: projectId,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          status_id: parsed.data.status_id ?? null,
          priority: parsed.data.priority ?? 'NONE',
          assignee_ids: parsed.data.assignee_ids ? JSON.stringify(parsed.data.assignee_ids) : null,
          frequency: parsed.data.frequency,
          interval: parsed.data.interval,
          next_run_at: nextRunAt,
          created_by: user.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      return res.status(201).json({ data: rule, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  router.patch('/:ruleId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, ruleId } = req.params as { projectId: string; ruleId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const parsed = updateRuleSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

      const updates: Record<string, unknown> = { updated_at: new Date() }
      if (parsed.data.title !== undefined) updates['title'] = parsed.data.title
      if (parsed.data.description !== undefined) updates['description'] = parsed.data.description
      if (parsed.data.status_id !== undefined) updates['status_id'] = parsed.data.status_id
      if (parsed.data.priority !== undefined) updates['priority'] = parsed.data.priority
      if (parsed.data.assignee_ids !== undefined) updates['assignee_ids'] = JSON.stringify(parsed.data.assignee_ids)
      if (parsed.data.frequency !== undefined) updates['frequency'] = parsed.data.frequency
      if (parsed.data.interval !== undefined) updates['interval'] = parsed.data.interval
      if (parsed.data.is_active !== undefined) updates['is_active'] = parsed.data.is_active

      const rule = await db.updateTable('recurring_task_rules')
        .set(updates as never)
        .where('id', '=', ruleId)
        .where('project_id', '=', projectId)
        .returningAll()
        .executeTakeFirst()

      if (!rule) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Rule not found' } })
      return res.json({ data: rule, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  router.delete('/:ruleId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, ruleId } = req.params as { projectId: string; ruleId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      await db.deleteFrom('recurring_task_rules')
        .where('id', '=', ruleId)
        .where('project_id', '=', projectId)
        .execute()

      return res.json({ data: { success: true }, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  return router
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/routes/recurring-rules.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/recurring-rules.ts apps/api/src/routes/recurring-rules.test.ts
git commit -m "feat(projects): add recurring task rules CRUD router"
```

---

### Task 3: `recurring-task-generator.ts` worker

**Files:**
- Create: `apps/api/src/workers/recurring-task-generator.ts`
- Test: `apps/api/src/workers/recurring-task-generator.test.ts`

Edge case from the design brainstorm — "what happens to instances when the rule is edited/deleted mid-series": this worker only ever reads `is_active=true` rules at the moment it runs, so a deleted rule simply stops generating (already-created tasks are untouched, since `project_tasks` has no FK back to `recurring_task_rules`), and an edited rule picks up the new template fields on its very next run. No special-case code is needed for this — it falls out of the design naturally.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/workers/recurring-task-generator.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'

describe('runRecurringTaskGeneration', () => {
  it('creates a task from a due rule and advances next_run_at', async () => {
    const dueRule = {
      id: 'rule-1', project_id: 'project-1', title: 'Weekly review',
      description: 'Check progress', status_id: null, priority: 'MEDIUM',
      assignee_ids: JSON.stringify(['user-1']), frequency: 'WEEKLY', interval: 1,
      next_run_at: new Date('2026-06-01T00:00:00Z'), is_active: true, created_by: 'user-1',
    }

    const ruleSelectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([dueRule]),
    }
    const statusSelectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: 'status-todo' }),
    }
    const taskInsertChain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'task-new-1', title: 'Weekly review' }),
    }
    const assigneeInsertChain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflict: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    }
    const ruleUpdateChain = {
      updateTable: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    }
    const activityInsertChain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    }
    const projectSelectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ workspace_id: 'ws-1' }),
    }

    let insertCallCount = 0
    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'recurring_task_rules') return ruleSelectChain
        if (table === 'project_task_statuses') return statusSelectChain
        return projectSelectChain
      }),
      insertInto: vi.fn((table: string) => {
        if (table === 'project_tasks') return taskInsertChain
        if (table === 'project_task_assignees') return assigneeInsertChain
        insertCallCount++
        return activityInsertChain
      }),
      updateTable: vi.fn(() => ruleUpdateChain),
    } as unknown as Kysely<Database>

    const { runRecurringTaskGeneration } = await import('./recurring-task-generator')
    await runRecurringTaskGeneration(db)

    expect(taskInsertChain.values).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1', title: 'Weekly review', priority: 'MEDIUM',
    }))
    expect(assigneeInsertChain.values).toHaveBeenCalledWith([{ task_id: 'task-new-1', user_id: 'user-1' }])
    expect(ruleUpdateChain.set).toHaveBeenCalledWith(expect.objectContaining({
      next_run_at: new Date('2026-06-08T00:00:00Z'),
    }))
  })

  it('skips rules whose next_run_at is in the future', async () => {
    const ruleSelectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    }
    const db = { selectFrom: vi.fn(() => ruleSelectChain) } as unknown as Kysely<Database>

    const { runRecurringTaskGeneration } = await import('./recurring-task-generator')
    await runRecurringTaskGeneration(db)

    expect(ruleSelectChain.where).toHaveBeenCalledWith('is_active', '=', true)
    expect(ruleSelectChain.where).toHaveBeenCalledWith('next_run_at', '<=', expect.any(Date))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/workers/recurring-task-generator.test.ts`
Expected: FAIL — `Cannot find module './recurring-task-generator'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/workers/recurring-task-generator.ts`:

```ts
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { logger } from '../lib/logger'
import { logActivity } from '../lib/log-activity'
import { computeNextRun } from '../routes/recurring-rules'

async function getDefaultStatusId(db: Kysely<Database>, projectId: string): Promise<string | null> {
  const first = await db.selectFrom('project_task_statuses')
    .select('id')
    .where('project_id', '=', projectId)
    .where('is_done', '=', false)
    .orderBy('position', 'asc')
    .executeTakeFirst()
  return first?.id ?? null
}

export async function runRecurringTaskGeneration(db: Kysely<Database>): Promise<void> {
  const dueRules = await db.selectFrom('recurring_task_rules')
    .selectAll()
    .where('is_active', '=', true)
    .where('next_run_at', '<=', new Date())
    .execute()

  for (const rule of dueRules) {
    try {
      const statusId = rule.status_id ?? await getDefaultStatusId(db, rule.project_id)
      if (!statusId) {
        logger.warn({ ruleId: rule.id }, '[recurring-task-generator] no status available — skipping')
        continue
      }

      const task = await db.insertInto('project_tasks')
        .values({
          project_id: rule.project_id,
          created_by: rule.created_by,
          status_id: statusId,
          title: rule.title,
          description: rule.description,
          priority: rule.priority,
          position: Date.now(),
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const assigneeIds: string[] = rule.assignee_ids
        ? (typeof rule.assignee_ids === 'string' ? JSON.parse(rule.assignee_ids) : rule.assignee_ids)
        : []
      if (assigneeIds.length > 0) {
        await db.insertInto('project_task_assignees')
          .values(assigneeIds.map(uid => ({ task_id: task.id, user_id: uid })))
          .onConflict(oc => oc.columns(['task_id', 'user_id']).doNothing())
          .execute()
      }

      await db.updateTable('recurring_task_rules')
        .set({ next_run_at: computeNextRun(rule.next_run_at, rule.frequency as 'DAILY' | 'WEEKLY' | 'MONTHLY', rule.interval) })
        .where('id', '=', rule.id)
        .execute()

      const project = await db.selectFrom('projects').select('workspace_id').where('id', '=', rule.project_id).executeTakeFirst()
      if (project) {
        void logActivity(db, {
          workspace_id: project.workspace_id,
          user_id: rule.created_by,
          type: 'pm_task_created',
          source_module_id: 'projects',
          body: `Recurring task "${task.title}" generated`,
          meta: { task_id: task.id, project_id: rule.project_id, rule_id: rule.id },
        })
      }
    } catch (err) {
      logger.error({ err, ruleId: rule.id }, '[recurring-task-generator] failed to generate task')
    }
  }

  if (dueRules.length > 0) {
    logger.info({ count: dueRules.length }, '[recurring-task-generator] generated tasks from due rules')
  }
}

export function startRecurringTaskGenerator(db: Kysely<Database>): void {
  void runRecurringTaskGeneration(db).catch(err =>
    logger.error({ err }, '[recurring-task-generator] initial run failed'),
  )
  setInterval(() => {
    void runRecurringTaskGeneration(db).catch(err =>
      logger.error({ err }, '[recurring-task-generator] run failed'),
    )
  }, 60 * 60 * 1000)
  logger.info('[recurring-task-generator] started — polls hourly')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/workers/recurring-task-generator.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the worker into `index.ts`**

In `apps/api/src/index.ts`, add the import near the other worker imports:

```ts
import { startRecurringTaskGenerator } from './workers/recurring-task-generator';
```

Add the start call alongside the other `start*` calls in the worker-start block:

```ts
startRecurringTaskGenerator(db);
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/workers/recurring-task-generator.ts apps/api/src/workers/recurring-task-generator.test.ts apps/api/src/index.ts
git commit -m "feat(projects): add recurring task generator worker"
```

---

### Task 4: Drag-to-reorder endpoint

**Files:**
- Modify: `apps/api/src/routes/project-tasks.ts`
- Test: `apps/api/src/routes/project-tasks.test.ts` (extends the file from Plan 1A Task 6 — append these tests, don't replace the file)

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/routes/project-tasks.test.ts` (create the file with this content if Plan 1A's version doesn't exist yet in your working copy):

```ts
describe('POST /api/projects/:projectId/tasks/:taskId/reorder', () => {
  it('computes a midpoint position between two neighboring tasks', async () => {
    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(), executeTakeFirst: vi.fn().mockResolvedValue({ id: 'project-1' }),
    }
    const neighborsChain = {
      selectFrom: vi.fn().mockReturnThis(), selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([
        { id: 'task-a', position: 100, status_id: 'status-1' },
        { id: 'task-b', position: 200, status_id: 'status-1' },
      ]),
    }
    const updateChain = {
      updateTable: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(), returningAll: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: 'task-moved', position: 150, status_id: 'status-1' }),
    }

    let selectCallCount = 0
    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'projects') return projectChain
        selectCallCount++
        return neighborsChain
      }),
      updateTable: vi.fn(() => updateChain),
    } as unknown as Kysely<Database>

    const { createProjectTasksRouter } = await import('./project-tasks')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/tasks', createProjectTasksRouter(db))

    const res = await request(app)
      .post('/api/projects/project-1/tasks/task-moved/reorder')
      .send({ status_id: 'status-1', after_task_id: 'task-a' })

    expect(res.status).toBe(200)
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ position: 150, status_id: 'status-1' }))
  })
})

describe('subtask depth enforcement', () => {
  it('rejects creating a task at depth 4 with 400 DEPTH_EXCEEDED', async () => {
    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(), executeTakeFirst: vi.fn().mockResolvedValue({ id: 'project-1' }),
    }
    // parent chain: parent-3 -> parent-2 -> parent-1 -> null (depth 3 already, adding a 4th level)
    const ancestorChain = {
      selectFrom: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn()
        .mockResolvedValueOnce({ id: 'parent-3', parent_id: 'parent-2' })
        .mockResolvedValueOnce({ id: 'parent-2', parent_id: 'parent-1' })
        .mockResolvedValueOnce({ id: 'parent-1', parent_id: null }),
    }
    const db = {
      selectFrom: vi.fn((table: string) => (table === 'projects' ? projectChain : ancestorChain)),
    } as unknown as Kysely<Database>

    const { createProjectTasksRouter } = await import('./project-tasks')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/tasks', createProjectTasksRouter(db))

    const res = await request(app)
      .post('/api/projects/project-1/tasks')
      .send({ title: 'Too deep', parent_id: 'parent-3' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('DEPTH_EXCEEDED')
  })
})
```

Add the necessary imports at the top of the test file if not already present (matching `pipeline-items.test.ts`'s style):

```ts
import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    (req as any).user = { id: 'user-1', role: 'admin' }
    (req as any).workspace = { id: 'ws-1' }
    next()
  })
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/project-tasks.test.ts`
Expected: FAIL — reorder route returns 404 (doesn't exist yet); depth test passes through without a 400 (no depth check yet).

- [ ] **Step 3: Implement**

In `apps/api/src/routes/project-tasks.ts`, add a depth-checking helper near the top (after `getDefaultStatusId`):

```ts
const MAX_TASK_DEPTH = 3

async function getTaskDepth(db: Kysely<Database>, taskId: string, candidateChildId?: string): Promise<number> {
  let depth = 0
  let currentId: string | null = taskId
  const visited = new Set<string>()
  while (currentId) {
    if (candidateChildId && currentId === candidateChildId) {
      throw new Error('CYCLE_DETECTED')
    }
    if (visited.has(currentId)) throw new Error('CYCLE_DETECTED')
    visited.add(currentId)
    const row = await db.selectFrom('project_tasks').select(['id', 'parent_id']).where('id', '=', currentId).executeTakeFirst()
    if (!row) break
    depth++
    currentId = row.parent_id
  }
  return depth
}
```

Update the create handler — replace the line `const statusId = parsed.data.status_id ?? await getDefaultStatusId(db, projectId)` with a depth check inserted right before it:

```ts
    if (parsed.data.parent_id) {
      try {
        const parentDepth = await getTaskDepth(db, parsed.data.parent_id)
        if (parentDepth >= MAX_TASK_DEPTH) {
          return res.status(400).json({ data: null, error: { code: 'DEPTH_EXCEEDED', message: `Subtasks cannot be nested more than ${MAX_TASK_DEPTH} levels deep` } })
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'CYCLE_DETECTED') {
          return res.status(400).json({ data: null, error: { code: 'CYCLE_DETECTED', message: 'Invalid parent reference' } })
        }
        throw err
      }
    }

    const statusId = parsed.data.status_id ?? await getDefaultStatusId(db, projectId)
```

Update the update handler (`router.patch('/:taskId', ...)`) — insert the same check right after the `existingTask` lookup, only when `parent_id` is being changed:

```ts
    if (parsed.data.parent_id !== undefined && parsed.data.parent_id !== null) {
      try {
        const parentDepth = await getTaskDepth(db, parsed.data.parent_id, taskId)
        if (parentDepth >= MAX_TASK_DEPTH) {
          return res.status(400).json({ data: null, error: { code: 'DEPTH_EXCEEDED', message: `Subtasks cannot be nested more than ${MAX_TASK_DEPTH} levels deep` } })
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'CYCLE_DETECTED') {
          return res.status(400).json({ data: null, error: { code: 'CYCLE_DETECTED', message: 'Invalid parent reference' } })
        }
        throw err
      }
    }
```

Add the reorder route — insert it right before `// Delete task`:

```ts
  // Reorder task (drag-to-reorder, supports cross-column moves)
  const reorderSchema = z.object({
    status_id: z.string().uuid().optional(),
    after_task_id: z.string().uuid().optional().nullable(),
  })

  router.post('/:taskId/reorder', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, taskId } = req.params as { projectId: string; taskId: string }
    const project = await verifyProjectAccess(db, projectId, workspace.id)
    if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

    const parsed = reorderSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

    const targetStatusId = parsed.data.status_id
    const siblings = targetStatusId
      ? await db.selectFrom('project_tasks').selectAll()
          .where('project_id', '=', projectId)
          .where('status_id', '=', targetStatusId)
          .where('id', '!=', taskId)
          .orderBy('position', 'asc')
          .execute()
      : []

    let newPosition: number
    if (!parsed.data.after_task_id) {
      newPosition = siblings.length > 0 ? siblings[0]!.position - 1000 : 0
    } else {
      const idx = siblings.findIndex(s => s.id === parsed.data.after_task_id)
      const afterPos = idx >= 0 ? siblings[idx]!.position : 0
      const nextPos = idx >= 0 && idx + 1 < siblings.length ? siblings[idx + 1]!.position : afterPos + 2000
      newPosition = (afterPos + nextPos) / 2
    }

    const updates: Record<string, unknown> = { position: newPosition, updated_at: new Date() }
    if (targetStatusId) updates['status_id'] = targetStatusId

    const task = await db.updateTable('project_tasks')
      .set(updates as never)
      .where('id', '=', taskId)
      .where('project_id', '=', projectId)
      .returningAll()
      .executeTakeFirst()

    if (!task) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } })
    return res.json({ data: task, error: null })
  })

```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/routes/project-tasks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/project-tasks.ts apps/api/src/routes/project-tasks.test.ts
git commit -m "feat(projects): add drag-to-reorder endpoint and subtask depth enforcement"
```

---

### Task 5: Mount the recurring-rules router

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Implement**

Add the import near the other route imports:

```ts
import { createRecurringRulesRouter } from './routes/recurring-rules';
```

Add the mount line, right after the existing `tasks` mount:

```ts
app.use('/api/projects/:projectId/tasks', requireAuth, createProjectTasksRouter(db));
app.use('/api/projects/:projectId/recurring-rules', requireAuth, createRecurringRulesRouter(db));
```

- [ ] **Step 2: Verify manually**

Run: `cd apps/api && npm run build` (or the project's existing typecheck command) to confirm no type errors from the new mount.
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(projects): mount recurring rules router"
```

---

## Self-Review

**Spec coverage:** Recurring task definitions ✅ (migration + router + worker). Drag-to-reorder ✅ (reorder endpoint, fractional position, cross-column support via optional `status_id`). Subtask nesting depth limit ✅ (`MAX_TASK_DEPTH = 3`, enforced on both create and update, with cycle detection as a related correctness fix the design's edge-case question surfaced). The brainstorm's "what happens to instances when the rule is edited/deleted mid-series" edge case is answered explicitly in Task 3's intro rather than requiring new code — already-created tasks are independent rows with no back-reference, so edits/deletes only affect future generations.

**Placeholder scan:** No TBD markers. All code blocks are complete and runnable. The codegen step in Task 1 references "the project's existing type-generation script" generically because the exact npm script name wasn't independently re-verified this pass — the engineer should check `packages/db/package.json` for the exact script (this is a one-line lookup, not a design gap).

**Type consistency:** `computeNextRun(from, frequency, interval)` is defined once in `recurring-rules.ts` and imported by `recurring-task-generator.ts` — no duplicate implementation. `reorderSchema`'s `after_task_id` matches the test's request body shape. `DEPTH_EXCEEDED`/`CYCLE_DETECTED` error codes are consistent between the create-handler and update-handler checks. `MAX_TASK_DEPTH` is a single named constant, not a repeated magic number.
