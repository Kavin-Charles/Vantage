# Projects Revamp PR3 Power Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the already-built-but-stubbed time tracking and custom fields routes with the missing aggregate endpoints they need (time summary, automation logs), extend the automation engine with two new action types (`create_task`, `set_custom_field`), and add `pm_time_logged` to the Activity feed.

**Architecture:** `time-summary` and `automation-logs` are new read-only aggregate endpoints, added as new exported router factories alongside the existing per-resource routers in `time-logs.ts` and `automation.ts` (following the file's existing pattern of exporting multiple router factories from one file, as `custom-fields.ts` already does with `createCustomFieldsRouter`/`createTaskFieldValuesRouter`). The two new automation action types extend the existing discriminated-union `actionSchema` and slot into `executeActions`'s existing if/else chain in `automation-engine.ts` — no new dispatch mechanism needed, the engine already iterates and matches by `act.type`.

**Tech Stack:** Express, Kysely, Zod, vitest + supertest (mirroring the route-test pattern established in Plan 1A/2A's test files).

> **Build order note:** This plan assumes Plan 1A (PR1 backend) is already merged — it adds the 11 PM-prefixed `ActivityType` literals this plan's Task 1 extends, and the `logActivity`/`notify` mocking conventions this plan's tests follow.

---

## File Structure

| File | Change |
|---|---|
| `apps/api/src/lib/log-activity.ts` | Add `pm_time_logged` to `ActivityType` |
| `apps/api/src/__tests__/log-activity.test.ts` | Append one test |
| `apps/api/src/routes/time-logs.ts` | Wire `pm_time_logged` activity log into POST `/`; add `createTimeSummaryRouter` |
| `apps/api/src/routes/time-logs.test.ts` | New file |
| `apps/api/src/routes/automation.ts` | Add `create_task`/`set_custom_field` to `actionSchema`; add `createAutomationLogsRouter` |
| `apps/api/src/routes/automation.test.ts` | New file |
| `apps/api/src/lib/automation-engine.ts` | Export `executeActions`; implement `create_task`/`set_custom_field` |
| `apps/api/src/lib/automation-engine.test.ts` | New file |
| `apps/api/src/index.ts` | Mount `time-summary` and `automation-logs` routers |

---

### Task 1: Add `pm_time_logged` to `ActivityType`

**Files:**
- Modify: `apps/api/src/lib/log-activity.ts`
- Test: `apps/api/src/__tests__/log-activity.test.ts`

- [ ] **Step 1: Write the failing test**

Read `apps/api/src/__tests__/log-activity.test.ts` first to match its exact `buildMockDb` helper and import style (it was created by Plan 1A). Append this test inside the same `describe` block, after the `pm_comment_added`/`milestone_completed` tests:

```ts
  it('accepts pm_time_logged as a valid ActivityType', async () => {
    const db = buildMockDb(false);
    await logActivity(db, {
      workspace_id: 'ws-1',
      user_id: 'user-1',
      type: 'pm_time_logged',
      source_module_id: 'projects',
      record_id: 'task-1',
      body: 'Logged 45 min',
    });
    expect(db.insertInto).toHaveBeenCalledWith('activities');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/log-activity.test.ts`
Expected: FAIL — TypeScript compile error, `'pm_time_logged' is not assignable to type ActivityType`.

- [ ] **Step 3: Implement**

In `apps/api/src/lib/log-activity.ts`, add `pm_time_logged` to the end of the `ActivityType` union (after Plan 1A's `sprint_ended`):

```ts
export type ActivityType =
  | 'email'
  | 'call'
  | 'note'
  | 'meeting'
  | 'deal_change'
  | 'infra_alert'
  | 'contact_created'
  | 'task_done'
  | 'database_added'
  | 'database_removed'
  | 'database_settings_changed'
  | 'database_connection_tested'
  | 'project_created'
  | 'project_updated'
  | 'project_archived'
  | 'pm_task_created'
  | 'pm_task_assigned'
  | 'pm_task_status_changed'
  | 'pm_comment_added'
  | 'milestone_created'
  | 'milestone_completed'
  | 'sprint_started'
  | 'sprint_ended'
  | 'pm_time_logged';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/log-activity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/log-activity.ts apps/api/src/__tests__/log-activity.test.ts
git commit -m "feat(activity): add pm_time_logged activity type"
```

---

### Task 2: Wire `pm_time_logged` into `time-logs.ts`'s POST handler

**Files:**
- Modify: `apps/api/src/routes/time-logs.ts`
- Test: `apps/api/src/routes/time-logs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/time-logs.test.ts`:

```ts
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
    (req as any).user = { id: USER_ID, role: 'admin' }
    (req as any).workspace = { id: WORKSPACE_ID }
    next()
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/time-logs.test.ts`
Expected: FAIL — `logActivity` was not called (the route doesn't call it yet).

- [ ] **Step 3: Implement**

In `apps/api/src/routes/time-logs.ts`, add the import at the top:

```ts
import { logActivity } from '../lib/log-activity'
```

In the POST `/` handler, after the `log` is inserted (right after the `.executeTakeFirstOrThrow()` call that creates `log`, before the `return res.status(201)...` line), add:

```ts
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'pm_time_logged',
        source_module_id: 'projects',
        record_id: taskId,
        body: `Logged ${parsed.data.minutes} min`,
      })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/routes/time-logs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/time-logs.ts apps/api/src/routes/time-logs.test.ts
git commit -m "feat(projects): log pm_time_logged activity when time is logged"
```

---

### Task 3: Time-summary endpoint

**Files:**
- Modify: `apps/api/src/routes/time-logs.ts`
- Test: `apps/api/src/routes/time-logs.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/routes/time-logs.test.ts`:

```ts
describe('GET /api/projects/:projectId/time-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('aggregates total minutes by task and by user', async () => {
    const projectChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ id: PROJECT_ID }) })
    const byTaskChain = {
      selectFrom: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      execute: vi.fn()
        .mockResolvedValueOnce([{ task_id: TASK_ID, title: 'Ship feature', total_minutes: 90 }])
        .mockResolvedValueOnce([{ user_id: USER_ID, user_name: 'Ada', total_minutes: 90 }]),
    }
    const db = {
      selectFrom: vi.fn((table: string) => (table === 'projects' ? projectChain : byTaskChain)),
      fn: { sum: vi.fn(() => ({ as: vi.fn((alias: string) => alias) })) },
    } as unknown as Kysely<Database>

    const { createTimeSummaryRouter } = await import('./time-logs')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects/:projectId/time-summary', createTimeSummaryRouter(db))

    const res = await request(app).get(`/api/projects/${PROJECT_ID}/time-summary`)

    expect(res.status).toBe(200)
    expect(res.body.data.total_minutes).toBe(90)
    expect(res.body.data.by_task).toEqual([{ task_id: TASK_ID, title: 'Ship feature', total_minutes: 90 }])
    expect(res.body.data.by_user).toEqual([{ user_id: USER_ID, user_name: 'Ada', total_minutes: 90 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/time-logs.test.ts`
Expected: FAIL — `createTimeSummaryRouter is not a function`.

- [ ] **Step 3: Implement**

Add this new export to `apps/api/src/routes/time-logs.ts`, after `createTimeLogsRouter`:

```ts
export function createTimeSummaryRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const byTask = await db.selectFrom('time_logs as l')
        .innerJoin('project_tasks as t', 't.id', 'l.task_id')
        .select(['t.id as task_id', 't.title', db.fn.sum<number>('l.minutes').as('total_minutes')])
        .where('t.project_id', '=', projectId)
        .groupBy(['t.id', 't.title'])
        .orderBy('total_minutes', 'desc')
        .execute()

      const byUser = await db.selectFrom('time_logs as l')
        .innerJoin('project_tasks as t', 't.id', 'l.task_id')
        .leftJoin('users as u', 'u.id', 'l.user_id')
        .select(['l.user_id', 'u.name as user_name', db.fn.sum<number>('l.minutes').as('total_minutes')])
        .where('t.project_id', '=', projectId)
        .groupBy(['l.user_id', 'u.name'])
        .orderBy('total_minutes', 'desc')
        .execute()

      const totalMinutes = byTask.reduce((sum, row) => sum + Number(row.total_minutes), 0)

      return res.json({
        data: {
          total_minutes: totalMinutes,
          by_task: byTask.map(r => ({ task_id: r.task_id, title: r.title, total_minutes: Number(r.total_minutes) })),
          by_user: byUser.map(r => ({ user_id: r.user_id, user_name: r.user_name, total_minutes: Number(r.total_minutes) })),
        },
        error: null,
      })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  return router
}
```

In `apps/api/src/index.ts`, add the import and mount line right after the existing `time-logs` mount (line 276):

```ts
import { createTimeLogsRouter, createTimeSummaryRouter } from './routes/time-logs';
```

(This replaces the existing `import { createTimeLogsRouter } from './routes/time-logs';` line — same file, one extra named export.)

```ts
app.use('/api/projects/:projectId/tasks/:taskId/time-logs', requireAuth, createTimeLogsRouter(db));
app.use('/api/projects/:projectId/time-summary', requireAuth, createTimeSummaryRouter(db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/routes/time-logs.test.ts`
Expected: PASS (both describe blocks).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/time-logs.ts apps/api/src/routes/time-logs.test.ts apps/api/src/index.ts
git commit -m "feat(projects): add time-summary endpoint"
```

---

### Task 4: Automation-logs endpoint

**Files:**
- Modify: `apps/api/src/routes/automation.ts`
- Test: `apps/api/src/routes/automation.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/automation.test.ts`:

```ts
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
    (req as any).workspace = { id: WORKSPACE_ID }
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/automation.test.ts`
Expected: FAIL — `createAutomationLogsRouter is not a function`.

- [ ] **Step 3: Implement**

Add this new export to `apps/api/src/routes/automation.ts`, after `createAutomationRouter`:

```ts
export function createAutomationLogsRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const logs = await db.selectFrom('automation_logs as l')
        .innerJoin('automation_rules as r', 'r.id', 'l.rule_id')
        .select(['l.id', 'l.rule_id', 'r.name as rule_name', 'l.triggered_at', 'l.success', 'l.detail'])
        .where('r.project_id', '=', projectId)
        .orderBy('l.triggered_at', 'desc')
        .limit(100)
        .execute()

      return res.json({ data: logs, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  return router
}
```

In `apps/api/src/index.ts`, update the import and add the mount line right after the existing `automations` mount (line 273):

```ts
import { createAutomationRouter, createAutomationLogsRouter } from './routes/automation';
```

```ts
app.use('/api/projects/:projectId/automations', requireAuth, createAutomationRouter(db));
app.use('/api/projects/:projectId/automation-logs', requireAuth, createAutomationLogsRouter(db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/routes/automation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/automation.ts apps/api/src/routes/automation.test.ts apps/api/src/index.ts
git commit -m "feat(projects): add automation-logs endpoint"
```

---

### Task 5: New automation action types — `create_task` and `set_custom_field`

**Files:**
- Modify: `apps/api/src/routes/automation.ts`
- Modify: `apps/api/src/lib/automation-engine.ts`
- Test: `apps/api/src/lib/automation-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/automation-engine.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { executeActions } from './automation-engine'

function buildChain(overrides: Record<string, unknown> = {}) {
  return {
    selectFrom: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflict: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    executeTakeFirstOrThrow: vi.fn().mockResolvedValue({}),
    ...overrides,
  }
}

describe('executeActions: create_task', () => {
  it('creates a task using the project default status when none is specified', async () => {
    const statusChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ id: 'status-todo' }) })
    const taskChain = buildChain({ executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'task-new-1' }) })
    const workspaceChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ workspace_id: 'ws-1' }) })
    const activityChain = buildChain()

    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'project_task_statuses') return statusChain
        if (table === 'projects') return workspaceChain
        return buildChain()
      }),
      insertInto: vi.fn((table: string) => {
        if (table === 'project_tasks') return taskChain
        if (table === 'activities') return activityChain
        return buildChain()
      }),
    } as unknown as Kysely<Database>

    await executeActions(
      db, 'rule-1', 'project-1',
      [{ type: 'create_task', title: 'Auto-generated review' }],
      { type: 'milestone_completed', projectId: 'project-1', milestoneId: 'm-1' },
      'creator-1',
    )

    expect(taskChain.values).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1', status_id: 'status-todo', title: 'Auto-generated review', created_by: 'creator-1',
    }))
  })

  it('assigns the listed users when assignee_ids is set', async () => {
    const taskChain = buildChain({ executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'task-new-1' }) })
    const assigneeChain = buildChain()
    const workspaceChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ workspace_id: 'ws-1' }) })

    const db = {
      selectFrom: vi.fn((table: string) => (table === 'projects' ? workspaceChain : buildChain())),
      insertInto: vi.fn((table: string) => {
        if (table === 'project_tasks') return taskChain
        if (table === 'project_task_assignees') return assigneeChain
        return buildChain()
      }),
    } as unknown as Kysely<Database>

    await executeActions(
      db, 'rule-1', 'project-1',
      [{ type: 'create_task', title: 'Review release', status_id: 'status-1', assignee_ids: ['user-2'] }],
      { type: 'milestone_completed', projectId: 'project-1', milestoneId: 'm-1' },
      'creator-1',
    )

    expect(assigneeChain.values).toHaveBeenCalledWith({ task_id: 'task-new-1', user_id: 'user-2' })
  })
})

describe('executeActions: set_custom_field', () => {
  it('upserts a custom field value for the event task', async () => {
    const fieldChain = buildChain()
    const db = { insertInto: vi.fn(() => fieldChain) } as unknown as Kysely<Database>

    await executeActions(
      db, 'rule-1', 'project-1',
      [{ type: 'set_custom_field', custom_field_id: 'field-1', value: 'High' }],
      { type: 'task_status_changed', projectId: 'project-1', taskId: 'task-1', to_status_id: 'status-done' },
      'creator-1',
    )

    expect(fieldChain.values).toHaveBeenCalledWith({ task_id: 'task-1', custom_field_id: 'field-1', value: 'High' })
  })

  it('does nothing when the event has no taskId', async () => {
    const fieldChain = buildChain()
    const db = { insertInto: vi.fn(() => fieldChain) } as unknown as Kysely<Database>

    await executeActions(
      db, 'rule-1', 'project-1',
      [{ type: 'set_custom_field', custom_field_id: 'field-1', value: 'High' }],
      { type: 'milestone_completed', projectId: 'project-1', milestoneId: 'm-1' },
      'creator-1',
    )

    expect(fieldChain.values).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/automation-engine.test.ts`
Expected: FAIL — `executeActions` is not exported from `automation-engine.ts`, and the action types don't exist on `actionSchema`.

- [ ] **Step 3: Implement**

In `apps/api/src/routes/automation.ts`, extend `actionSchema` with the two new variants:

```ts
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('send_notification'), user_ids: z.array(z.string().uuid()), message: z.string() }),
  z.object({ type: z.literal('change_task_status'), status_id: z.string().uuid() }),
  z.object({ type: z.literal('assign_task'), user_id: z.string().uuid() }),
  z.object({ type: z.literal('mark_milestone_complete'), milestone_id: z.string().uuid() }),
  z.object({ type: z.literal('send_webhook'), url: z.string().url(), payload: z.record(z.unknown()).optional() }),
  z.object({
    type: z.literal('create_task'),
    title: z.string().min(1).max(500),
    status_id: z.string().uuid().optional(),
    assignee_ids: z.array(z.string().uuid()).optional(),
  }),
  z.object({
    type: z.literal('set_custom_field'),
    custom_field_id: z.string().uuid(),
    value: z.string(),
  }),
])
```

In `apps/api/src/lib/automation-engine.ts`, export `executeActions` and add a `createdBy` parameter, then add the two new branches to its if/else chain:

```ts
export async function executeActions(
  db: Kysely<Database>,
  ruleId: string,
  projectId: string,
  actions: ParsedAction[],
  event: PMEvent,
  createdBy: string,
): Promise<void> {
  for (const act of actions) {
    try {
      if (act.type === 'send_notification') {
        // ... unchanged ...
      } else if (act.type === 'change_task_status') {
        // ... unchanged ...
      } else if (act.type === 'assign_task') {
        // ... unchanged ...
      } else if (act.type === 'mark_milestone_complete') {
        // ... unchanged ...
      } else if (act.type === 'send_webhook') {
        // ... unchanged ...
      } else if (act.type === 'create_task') {
        let statusId = act.status_id
        if (!statusId) {
          const defaultStatus = await db.selectFrom('project_task_statuses')
            .select('id')
            .where('project_id', '=', projectId)
            .orderBy('position', 'asc')
            .executeTakeFirst()
          if (!defaultStatus) continue
          statusId = defaultStatus.id
        }

        const created = await db.insertInto('project_tasks').values({
          project_id: projectId,
          status_id: statusId,
          title: act.title,
          created_by: createdBy,
        }).returningAll().executeTakeFirstOrThrow()

        if (act.assignee_ids) {
          for (const userId of act.assignee_ids) {
            await db.insertInto('project_task_assignees')
              .values({ task_id: created.id, user_id: userId })
              .execute()
          }
        }

        const workspaceRow = await db.selectFrom('projects').select('workspace_id')
          .where('id', '=', projectId).executeTakeFirst()
        if (workspaceRow) {
          await db.insertInto('activities').values({
            workspace_id: workspaceRow.workspace_id,
            user_id: createdBy,
            type: 'pm_task_created',
            body: `Created task "${act.title}" via automation`,
            meta: { source: 'automation', rule_id: ruleId },
          }).execute()
        }
      } else if (act.type === 'set_custom_field') {
        if ('taskId' in event) {
          const taskId = (event as { taskId: string }).taskId
          await db.insertInto('custom_field_values')
            .values({ task_id: taskId, custom_field_id: act.custom_field_id, value: act.value })
            .onConflict(oc => oc.columns(['task_id', 'custom_field_id']).doUpdateSet({ value: act.value }))
            .execute()
        }
      }
    } catch (err) {
      logger.error({ err, ruleId, action: act.type }, 'automation action error')
      throw err
    }
  }
}
```

(Only the function signature and the two new `else if` branches are new — every other branch's body is unchanged from the existing file. Keep `create_task`'s `type: 'pm_task_created'` activity insert as a direct `db.insertInto('activities')` call, matching the existing `send_notification` branch's style in this same file, rather than importing the `logActivity` helper — this file has no such import today and the existing pattern here is a raw insert.)

Update the single call site inside `initAutomationEngine` (the `await executeActions(db, rule.id, rule.project_id, actionsParsed.data, event)` line) to pass the rule's creator:

```ts
        try {
          await executeActions(db, rule.id, rule.project_id, actionsParsed.data, event, rule.created_by)
        } catch (err) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/automation-engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/automation.ts apps/api/src/lib/automation-engine.ts apps/api/src/lib/automation-engine.test.ts
git commit -m "feat(automation): add create_task and set_custom_field action types"
```

---

## Self-Review

**Spec coverage:** Time-summary endpoint ✅, automation-logs endpoint ✅, new automation action types ✅ (`create_task` + `set_custom_field`, as specified — `set_custom_field` was the locked scope name and matches the existing `custom_field_values` table exactly), `pm_time_logged` ActivityType ✅ (added and wired into the one place time is logged).

**Placeholder scan:** No TBD markers. Task 5's implementation step shows `// ... unchanged ...` for the five pre-existing branches — this is a standard "don't repeat code that isn't changing" convention, not a placeholder; all five of those branches' real bodies are already shown verbatim earlier in this same plan (under Key Technical Concepts research, and they are simply the file's current, unmodified content) and Task 5's instructions are explicit that only the two new branches are additions.

**Type consistency:** `executeActions`'s new `createdBy: string` parameter is threaded through to its one call site in `initAutomationEngine`, using `rule.created_by` (a field that already exists on every `automation_rules` row, set at creation time in `automation.ts`'s POST handler). `create_task`'s Zod shape (`title`, `status_id?`, `assignee_ids?`) matches exactly what the implementation reads off `act`. `set_custom_field`'s Zod shape (`custom_field_id`, `value`) matches the existing `custom_field_values` table's columns (`task_id`, `custom_field_id`, `value`) with no naming drift. `createTimeSummaryRouter`'s response shape (`total_minutes`, `by_task: [{task_id, title, total_minutes}]`, `by_user: [{user_id, user_name, total_minutes}]`) is self-contained to this plan — Plan 3B's `TimeTrackingPage` will need to match these exact field names when it consumes this endpoint. `createAutomationLogsRouter`'s response shape (`id`, `rule_id`, `rule_name`, `triggered_at`, `success`, `detail`) is likewise the contract Plan 3B's `AutomationLogViewer` must match.
