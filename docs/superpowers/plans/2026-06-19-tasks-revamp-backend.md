# Tasks Revamp — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `GET /api/tasks/unified` endpoint that merges CRM tasks and project tasks into a normalized, bucketed response; extend the overdue worker to create alerts.

**Architecture:** A new Express router (`tasks-unified.ts`) queries both the `tasks` table (CRM) and `project_tasks` table (via assignees join), normalizes rows to `UnifiedTask`, buckets by due date server-side, and returns grouped JSON. The existing `task-due-notifier.ts` worker gets a second pass that creates `alerts` records for overdue CRM tasks using the existing `createAlert` service.

**Tech Stack:** TypeScript, Kysely (query builder), Express, Zod, existing `createAlert` / `logActivity` libs.

---

### Task 1: Create `tasks-unified.ts` router

**Files:**
- Create: `apps/api/src/routes/tasks-unified.ts`

- [ ] **Step 1: Create the file with types, schema, and bucketing helpers**

```typescript
// apps/api/src/routes/tasks-unified.ts
import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'

const querySchema = z.object({
  status: z.enum(['todo', 'done', 'all']).default('all'),
  source: z.enum(['general', 'contact', 'project', 'all']).default('all'),
  priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']).optional(),
  show_all: z.coerce.boolean().default(false),
  q: z.string().optional(),
})

export interface UnifiedTask {
  id: string
  source: 'general' | 'contact' | 'project'
  title: string
  status: 'todo' | 'done'
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  due_date: string | null
  assignee_id: string | null
  assignee_name: string | null
  contact_id: string | null
  contact_name: string | null
  project_id: string | null
  project_name: string | null
  status_label: string | null
  status_color: string | null
  done_status_id: string | null
  todo_status_id: string | null
  source_url: string | null
  created_at: string
  updated_at: string
}

export interface UnifiedTasksBuckets {
  overdue: UnifiedTask[]
  today: UnifiedTask[]
  this_week: UnifiedTask[]
  later: UnifiedTask[]
  no_due_date: UnifiedTask[]
}

type DueBucket = keyof UnifiedTasksBuckets

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4,
}

function getBucket(dueDate: string | null): DueBucket {
  if (!dueDate) return 'no_due_date'
  const now = new Date()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const d = new Date(dueDate)
  const dueUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const diff = dueUtc - todayUtc
  const DAY = 86_400_000
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 7 * DAY) return 'this_week'
  return 'later'
}

function sortByPriority(tasks: UnifiedTask[]): UnifiedTask[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 4
    const pb = PRIORITY_ORDER[b.priority] ?? 4
    if (pa !== pb) return pa - pb
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

export function createUnifiedTasksRouter(db: Kysely<Database>): Router {
  const router = Router()

  router.get('/', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest
      const parsed = querySchema.safeParse(req.query)
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } })
        return
      }
      const { status, source, priority, show_all, q } = parsed.data
      const showAll = show_all && user.role === 'admin'

      // ── 1. CRM tasks ────────────────────────────────────────────────────────
      let crmQ = db
        .selectFrom('tasks as t')
        .leftJoin('contacts as c', 'c.id', 't.contact_id')
        .leftJoin('users as u', 'u.id', 't.assignee_id')
        .select([
          't.id', 't.title', 't.status', 't.due_date',
          't.assignee_id', 't.contact_id', 't.created_at', 't.updated_at',
          'c.name as contact_name',
          'u.name as assignee_name',
        ])
        .where('t.workspace_id', '=', workspace.id)

      if (!showAll) crmQ = crmQ.where('t.assignee_id', '=', user.id)
      if (status !== 'all') crmQ = crmQ.where('t.status', '=', status as 'todo' | 'done')

      const crmRows = await crmQ.execute()

      // ── 2. Project tasks (assigned to user) ─────────────────────────────────
      let ptQ = db
        .selectFrom('project_task_assignees as a')
        .innerJoin('project_tasks as t', 't.id', 'a.task_id')
        .innerJoin('projects as p', 'p.id', 't.project_id')
        .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
        .leftJoin('users as u', 'u.id', 'a.user_id')
        .select([
          't.id', 't.title', 't.project_id', 't.due_date', 't.priority',
          't.created_at', 't.updated_at',
          'p.name as project_name',
          's.name as status_name', 's.color as status_color', 's.is_done',
          'a.user_id as assignee_id', 'u.name as assignee_name',
        ])
        .where('p.workspace_id', '=', workspace.id)
        .where('p.status', '!=', 'DELETED' as never)

      if (!showAll) ptQ = ptQ.where('a.user_id', '=', user.id)
      if (status === 'done') ptQ = ptQ.where('s.is_done', '=', true)
      if (status === 'todo') ptQ = ptQ.where('s.is_done', '=', false)

      const ptRows = await ptQ.execute()

      // ── 3. Resolve done/todo status IDs per project ─────────────────────────
      const projectIds = [...new Set(ptRows.map(r => r.project_id))]
      const allStatuses = projectIds.length > 0
        ? await db
            .selectFrom('project_task_statuses')
            .select(['project_id', 'id', 'is_done', 'position'])
            .where('project_id', 'in', projectIds)
            .orderBy('position', 'asc')
            .execute()
        : []

      const doneStatusMap: Record<string, string> = {}
      const todoStatusMap: Record<string, string> = {}
      for (const s of allStatuses) {
        if (s.is_done && !doneStatusMap[s.project_id]) doneStatusMap[s.project_id] = s.id
        if (!s.is_done && !todoStatusMap[s.project_id]) todoStatusMap[s.project_id] = s.id
      }

      // ── 4. Normalize ─────────────────────────────────────────────────────────
      const unified: UnifiedTask[] = []

      for (const t of crmRows) {
        unified.push({
          id: t.id,
          source: t.contact_id ? 'contact' : 'general',
          title: t.title,
          status: t.status as 'todo' | 'done',
          priority: 'NONE',
          due_date: t.due_date ? (t.due_date as Date).toISOString() : null,
          assignee_id: t.assignee_id ?? null,
          assignee_name: (t as Record<string, unknown>)['assignee_name'] as string | null ?? null,
          contact_id: t.contact_id ?? null,
          contact_name: (t as Record<string, unknown>)['contact_name'] as string | null ?? null,
          project_id: null,
          project_name: null,
          status_label: null,
          status_color: null,
          done_status_id: null,
          todo_status_id: null,
          source_url: null,
          created_at: (t.created_at as Date).toISOString(),
          updated_at: (t.updated_at as Date).toISOString(),
        })
      }

      for (const t of ptRows) {
        const r = t as Record<string, unknown>
        unified.push({
          id: t.id,
          source: 'project',
          title: t.title,
          status: t.is_done ? 'done' : 'todo',
          priority: (t.priority as UnifiedTask['priority']) ?? 'NONE',
          due_date: t.due_date ? (t.due_date as Date).toISOString() : null,
          assignee_id: t.assignee_id ?? null,
          assignee_name: r['assignee_name'] as string | null ?? null,
          contact_id: null,
          contact_name: null,
          project_id: t.project_id,
          project_name: r['project_name'] as string | null ?? null,
          status_label: r['status_name'] as string | null ?? null,
          status_color: r['status_color'] as string | null ?? null,
          done_status_id: doneStatusMap[t.project_id] ?? null,
          todo_status_id: todoStatusMap[t.project_id] ?? null,
          source_url: `/projects/${t.project_id}/tasks`,
          created_at: (t.created_at as Date).toISOString(),
          updated_at: (t.updated_at as Date).toISOString(),
        })
      }

      // ── 5. Client-side filters ───────────────────────────────────────────────
      let filtered = unified
      if (source !== 'all') filtered = filtered.filter(t => t.source === source)
      if (priority) filtered = filtered.filter(t => t.priority === priority)
      if (q) {
        const lower = q.toLowerCase()
        filtered = filtered.filter(t => t.title.toLowerCase().includes(lower))
      }

      // ── 6. Bucket + sort ─────────────────────────────────────────────────────
      const buckets: UnifiedTasksBuckets = {
        overdue: [], today: [], this_week: [], later: [], no_due_date: [],
      }
      for (const t of filtered) buckets[getBucket(t.due_date)].push(t)
      for (const key of Object.keys(buckets) as DueBucket[]) {
        buckets[key] = sortByPriority(buckets[key])
      }

      res.json({ data: buckets, total: filtered.length, error: null })
    } catch (err) {
      next(err)
    }
  })

  return router
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/api && rtk tsc --noEmit 2>&1 | head -40
```
Expected: no errors in `tasks-unified.ts`.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/api/src/routes/tasks-unified.ts
rtk git commit -m "feat(tasks): add unified tasks endpoint"
```

---

### Task 2: Mount unified router in `index.ts`

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add import after the existing tasks import (line ~32)**

Find this line in `apps/api/src/index.ts`:
```typescript
import { createTasksRouter } from './routes/tasks';
```
Add immediately after:
```typescript
import { createUnifiedTasksRouter } from './routes/tasks-unified';
```

- [ ] **Step 2: Mount BEFORE the existing `/api/tasks` mount**

Find this line (around line 259):
```typescript
app.use('/api/tasks', requireAuth, requireModule('tasks'), createTasksRouter(db, requirePermission));
```
Add this line IMMEDIATELY BEFORE it:
```typescript
app.use('/api/tasks/unified', requireAuth, requireModule('tasks'), createUnifiedTasksRouter(db));
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api && rtk tsc --noEmit 2>&1 | head -20
```
Expected: no new errors.

- [ ] **Step 4: Smoke test — start API and hit the endpoint**

```bash
cd apps/api && pnpm dev &
sleep 3
# Get a token first from your local dev session, then:
curl -s -H "Authorization: Bearer <your-dev-token>" http://localhost:3001/api/tasks/unified | head -c 500
```
Expected: JSON with `{ data: { overdue: [], today: [], this_week: [], later: [], no_due_date: [] }, total: 0, error: null }` shape (counts depend on your dev data).

- [ ] **Step 5: Commit**

```bash
rtk git add apps/api/src/index.ts
rtk git commit -m "feat(tasks): mount unified tasks router"
```

---

### Task 3: Extend task-due-notifier with overdue alerts

**Files:**
- Modify: `apps/api/src/workers/task-due-notifier.ts`

- [ ] **Step 1: Add import for `createAlert` at the top of the file**

Find the existing imports at the top:
```typescript
import { sendPush } from '../lib/push-notify';
import { logger } from '../lib/logger';
```
Replace with:
```typescript
import { sendPush } from '../lib/push-notify';
import { logger } from '../lib/logger';
import { createAlert } from '../lib/alert-service';
```

- [ ] **Step 2: Add `createOverdueAlerts` function before `startTaskDueNotifier`**

Add this function after the closing `}` of `runDueTaskNotifications` and before `msUntilNextMidnightUtc`:

```typescript
async function createOverdueAlerts(db: Kysely<Database>): Promise<void> {
  const now = new Date()
  // Tasks are overdue if due_date < start of today UTC (i.e., at least 1 full day ago)
  const startOfTodayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )

  const overdueTasks = await db
    .selectFrom('tasks')
    .where('due_date', '<', startOfTodayUtc)
    .where('status', '=', 'todo')
    .select(['id', 'title', 'workspace_id'])
    .execute()

  for (const task of overdueTasks) {
    await createAlert(db, {
      workspaceId: task.workspace_id,
      severity: 'warning',
      resourceType: 'crm',
      resourceId: task.id,
      message: `Task overdue: "${task.title}"`,
      messagePrefix: 'Task overdue:',
      sourceModuleId: 'tasks',
    }).catch((err: unknown) => logger.error({ err }, '[task-due-notifier] createAlert failed'))
  }

  if (overdueTasks.length > 0) {
    logger.info({ count: overdueTasks.length }, '[task-due-notifier] created overdue alerts')
  }
}
```

- [ ] **Step 3: Call `createOverdueAlerts` inside the existing scheduler**

Find inside `startTaskDueNotifier` the setTimeout callback where `runDueTaskNotifications` is called:
```typescript
setTimeout(() => {
  void runDueTaskNotifications(db).catch(err =>
    logger.error({ err }, '[task-due-notifier] run failed'),
  );
  // Schedule next day
  setInterval(() => {
    void runDueTaskNotifications(db).catch(err =>
      logger.error({ err }, '[task-due-notifier] run failed'),
    );
  }, 24 * 60 * 60 * 1000);
}, delay);
```

Replace with:
```typescript
setTimeout(() => {
  void runDueTaskNotifications(db).catch(err =>
    logger.error({ err }, '[task-due-notifier] run failed'),
  );
  void createOverdueAlerts(db).catch(err =>
    logger.error({ err }, '[task-due-notifier] overdue alerts failed'),
  );
  setInterval(() => {
    void runDueTaskNotifications(db).catch(err =>
      logger.error({ err }, '[task-due-notifier] run failed'),
    );
    void createOverdueAlerts(db).catch(err =>
      logger.error({ err }, '[task-due-notifier] overdue alerts failed'),
    );
  }, 24 * 60 * 60 * 1000);
}, delay);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/api && rtk tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/api/src/workers/task-due-notifier.ts
rtk git commit -m "feat(tasks): create overdue alerts in due-notifier worker"
```

---

### Task 4: Activity hook on CRM task completion

The existing `PATCH /api/tasks/:id` in `tasks.ts` already fires a webhook on completion. We add an activity log call alongside it.

**Files:**
- Modify: `apps/api/src/routes/tasks.ts`

- [ ] **Step 1: Add `logActivity` import**

Find at the top of `tasks.ts`:
```typescript
import { logger } from '../lib/logger';
import { queueWebhook } from '../lib/queue-webhook';
```
Replace with:
```typescript
import { logger } from '../lib/logger';
import { queueWebhook } from '../lib/queue-webhook';
import { logActivity } from '../lib/log-activity';
```

- [ ] **Step 2: Log activity when a CRM task is toggled to done**

In the `router.patch('/:id', ...)` handler, find the existing block that fires the webhook on completion:
```typescript
if (body.status === 'done' && currentTask?.status !== 'done') {
  queueWebhook(db, workspace.id, 'task.completed', {
    task_id: task.id,
    title: task.title,
    assignee_id: task.assignee_id,
    workspace_id: workspace.id,
    timestamp: new Date().toISOString(),
  }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));
}
```

Replace with:
```typescript
if (body.status === 'done' && currentTask?.status !== 'done') {
  queueWebhook(db, workspace.id, 'task.completed', {
    task_id: task.id,
    title: task.title,
    assignee_id: task.assignee_id,
    workspace_id: workspace.id,
    timestamp: new Date().toISOString(),
  }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

  void logActivity(db, {
    workspace_id: workspace.id,
    user_id: task.assignee_id ?? null,
    type: 'task_done',
    source_module_id: 'tasks',
    body: `Task completed: "${task.title}"`,
    contact_id: task.contact_id ?? undefined,
    record_id: task.id,
  }).catch((err: unknown) => logger.error({ err }, 'logActivity failed'));
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api && rtk tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/api/src/routes/tasks.ts
rtk git commit -m "feat(tasks): log activity when CRM task is completed"
```
