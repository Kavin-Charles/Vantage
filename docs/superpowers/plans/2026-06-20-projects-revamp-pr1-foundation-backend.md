# Projects Revamp PR1 Foundation — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Projects (PM) module into the platform's cross-cutting systems — Activity feed, Alerts, Notifications — and add the data endpoint the new dashboard widget needs, so every other PR1 deliverable (and the frontend Plan 1B) has real hooks to call.

**Architecture:** Extend the existing fire-and-forget helpers (`logActivity`, `createAlert`) rather than inventing new mechanisms. Add a new `notify()` helper that follows the same fire-and-forget, try/catch-swallowed pattern. Wire calls into the four PM route files at the exact points where state actually changes (post-insert, post-update, post-status-transition). Add one new worker (`pm-due-alert.ts`) mirroring the existing `task-due-notifier.ts` structure. Add one new read-only endpoint (`project-widget-stats.ts`) mounted before the greedy `/:id` route.

**Tech Stack:** Express, Kysely, Zod, vitest, PostgreSQL (via `@vencore/db`).

---

## File Structure

| File | Change |
|---|---|
| `packages/modules/src/projects/index.ts` | Add `emitsAlerts: true` |
| `packages/modules/src/index.test.ts` | New assertion for the flag |
| `apps/api/src/lib/log-activity.ts` | Extend `ActivityType` union with 11 PM values |
| `apps/api/src/__tests__/log-activity.test.ts` | New tests for PM activity types |
| `packages/db/src/schema.ts` | Widen `AlertTable.resource_type` to include `'projects'` |
| `apps/api/src/lib/alert-service.ts` | Remove now-redundant casts |
| `apps/api/src/__tests__/alert-service.test.ts` | New file — regression test for the widened type |
| `apps/api/src/lib/push-notify.ts` | Add `pm_assigned` to `PushPreferences` |
| `apps/api/src/lib/notify.ts` | New file — `notify()` helper (DB notification row + optional push) |
| `apps/api/src/__tests__/notify.test.ts` | New file |
| `apps/api/src/routes/projects.ts` | Wire `project_created` / `project_updated` / `project_archived` activity + health-risk alert |
| `apps/api/src/routes/projects.test.ts` | New file |
| `apps/api/src/routes/project-tasks.ts` | Wire `pm_task_created` / `pm_task_assigned` / `pm_comment_added` activity + assignment notify |
| `apps/api/src/routes/project-tasks.test.ts` | New file |
| `apps/api/src/routes/milestones.ts` | Pre-fetch prior status; wire `milestone_created` / `milestone_completed` activity + `pmEvents` emit |
| `apps/api/src/routes/milestones.test.ts` | New file |
| `apps/api/src/routes/sprints.ts` | Pre-fetch prior status; wire `sprint_started` / `sprint_ended` activity + `pmEvents` emit |
| `apps/api/src/routes/sprints.test.ts` | New file |
| `apps/api/src/workers/pm-due-alert.ts` | New file — overdue task / at-risk milestone alerts + push |
| `apps/api/src/workers/pm-due-alert.test.ts` | New file |
| `apps/api/src/routes/project-widget-stats.ts` | New file — `GET /api/projects/widget-stats` |
| `apps/api/src/routes/project-widget-stats.test.ts` | New file |
| `apps/api/src/index.ts` | Mount widget-stats router before `/api/projects`; import + start `pm-due-alert` worker |

---

### Task 1: Flip the `emitsAlerts` module flag

**Files:**
- Modify: `packages/modules/src/projects/index.ts:17`
- Test: `packages/modules/src/index.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/modules/src/index.test.ts`, inside the existing `describe('MODULE_REGISTRY', ...)` block (after the `'every module has at least one permission'` test):

```ts
  it('projects module emits both activity and alerts', () => {
    const projects = MODULE_REGISTRY.find(m => m.id === 'projects');
    expect(projects?.emitsActivity).toBe(true);
    expect(projects?.emitsAlerts).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/modules && npx vitest run src/index.test.ts`
Expected: FAIL — `expect(projects?.emitsAlerts).toBe(true)` receives `undefined`.

- [ ] **Step 3: Implement**

In `packages/modules/src/projects/index.ts`, change:

```ts
  workers: ['due-date-alerts', 'overdue-scan', 'health-recalc', 'sprint-rollover'],
  emitsActivity: true,
};
```

to:

```ts
  workers: ['due-date-alerts', 'overdue-scan', 'health-recalc', 'sprint-rollover'],
  emitsActivity: true,
  emitsAlerts: true,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/modules && npx vitest run src/index.test.ts`
Expected: PASS — all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add packages/modules/src/projects/index.ts packages/modules/src/index.test.ts
git commit -m "feat(projects): flag module as an alert emitter"
```

---

### Task 2: Extend `ActivityType` with PM event types

**Files:**
- Modify: `apps/api/src/lib/log-activity.ts`
- Test: `apps/api/src/__tests__/log-activity.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/__tests__/log-activity.test.ts` (after the existing 3 tests, inside the same `describe` block — read the file first to match its exact `buildMockDb` helper and import style):

```ts
  it('accepts pm_task_created as a valid ActivityType', async () => {
    const db = buildMockDb(false);
    await logActivity(db, {
      workspace_id: 'ws-1',
      user_id: 'user-1',
      type: 'pm_task_created',
      source_module_id: 'projects',
      record_id: 'task-1',
    });
    expect(db.insertInto).toHaveBeenCalledWith('activities');
  });

  it('accepts milestone_completed as a valid ActivityType', async () => {
    const db = buildMockDb(false);
    await logActivity(db, {
      workspace_id: 'ws-1',
      user_id: 'user-1',
      type: 'milestone_completed',
      source_module_id: 'projects',
      record_id: 'milestone-1',
    });
    expect(db.insertInto).toHaveBeenCalledWith('activities');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/log-activity.test.ts`
Expected: FAIL — TypeScript compile error, `'pm_task_created' is not assignable to type ActivityType`.

- [ ] **Step 3: Implement**

In `apps/api/src/lib/log-activity.ts`, find the `ActivityType` union (currently 12 values: `email | call | note | meeting | deal_change | infra_alert | contact_created | task_done | database_added | database_removed | database_settings_changed | database_connection_tested`) and extend it with the 11 PM values:

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
  | 'sprint_ended';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/log-activity.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/log-activity.ts apps/api/src/__tests__/log-activity.test.ts
git commit -m "feat(activity): add project-management activity types"
```

---

### Task 3: Widen `AlertTable.resource_type` and drop the redundant casts

**Context:** `alert-service.ts` currently casts `resourceType` to `'server' | 'database' | 'website' | 'crm'` in two places (inside `hasOpenAlert` and `createAlert`) purely because `AlertTable.resource_type` in the Kysely schema doesn't list `'projects'` — there is no DB-level CHECK constraint (the column is plain `varchar(20)`). The public `CreateAlertParams.resourceType` type already accepts `'projects'`, so callers were never blocked; this is a type-hygiene fix with no runtime behavior change. The test below is a regression test, not a red→green TDD demonstration, since there's no pre-fix failure to show — type-only changes don't fail at runtime.

**Files:**
- Modify: `packages/db/src/schema.ts:103`
- Modify: `apps/api/src/lib/alert-service.ts:43,77`
- Test: `apps/api/src/__tests__/alert-service.test.ts` (new file)

- [ ] **Step 1: Write the regression test**

Create `apps/api/src/__tests__/alert-service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createAlert, hasOpenAlert } from '../lib/alert-service';

function buildChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    selectFrom: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
    executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return chain;
}

describe('alert-service resourceType: projects', () => {
  it('hasOpenAlert accepts resourceType "projects" without a type error', async () => {
    const chain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue(undefined) });
    const db = { selectFrom: vi.fn(() => chain) } as any;

    const result = await hasOpenAlert(db, {
      workspaceId: 'ws-1',
      resourceType: 'projects',
      resourceId: 'project-1',
    });

    expect(result).toBe(false);
    expect(db.selectFrom).toHaveBeenCalledWith('alerts');
  });

  it('createAlert inserts a row with resource_type "projects"', async () => {
    const settingsChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue(undefined) });
    const openAlertChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue(undefined) });
    const insertChain = buildChain();

    const db = {
      selectFrom: vi.fn((table: string) =>
        table === 'module_event_settings' ? settingsChain : openAlertChain,
      ),
      insertInto: vi.fn(() => insertChain),
    } as any;

    await createAlert(db, {
      workspaceId: 'ws-1',
      severity: 'warning',
      resourceType: 'projects',
      resourceId: 'project-1',
      message: 'Project at risk: "Launch"',
      messagePrefix: 'Project at risk:',
      sourceModuleId: 'projects',
    });

    expect(db.insertInto).toHaveBeenCalledWith('alerts');
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ resource_type: 'projects' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/alert-service.test.ts`
Expected: FAIL — TypeScript compile error on the `resourceType: 'projects'` cast inside `alert-service.ts` if it were the literal union (it isn't a hard runtime fail, but tsc will reject the file because `AlertTable.resource_type` doesn't include `'projects'`, surfacing as a build-time type error during `vitest run`, which type-checks via esbuild's isolated transform — confirm by running `npx tsc --noEmit` if vitest doesn't surface it directly).

- [ ] **Step 3: Implement**

In `packages/db/src/schema.ts`, change line 103:

```ts
  resource_type: 'server' | 'database' | 'website' | 'crm';
```

to:

```ts
  resource_type: 'server' | 'database' | 'website' | 'crm' | 'projects';
```

In `apps/api/src/lib/alert-service.ts`, remove the two now-redundant casts. Change:

```ts
    .where('resource_type', '=', resourceType as 'server' | 'database' | 'website' | 'crm')
```

to:

```ts
    .where('resource_type', '=', resourceType)
```

and change:

```ts
      resource_type: params.resourceType as 'server' | 'database' | 'website' | 'crm',
```

to:

```ts
      resource_type: params.resourceType,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/alert-service.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts apps/api/src/lib/alert-service.ts apps/api/src/__tests__/alert-service.test.ts
git commit -m "fix(db): widen alert resource_type to include projects"
```

---

### Task 4: Add the `notify()` helper

**Files:**
- Modify: `apps/api/src/lib/push-notify.ts`
- Create: `apps/api/src/lib/notify.ts`
- Test: `apps/api/src/__tests__/notify.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/notify.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/push-notify', () => ({ sendPush: vi.fn().mockResolvedValue(undefined) }));

import { notify } from '../lib/notify';
import { sendPush } from '../lib/push-notify';

function buildChain(overrides: Record<string, unknown> = {}) {
  return {
    insertInto: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
    selectFrom: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    ...overrides,
  };
}

describe('notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a notification row', async () => {
    const notifChain = buildChain();
    const tokenChain = buildChain({ execute: vi.fn().mockResolvedValue([]) });
    const db = {
      insertInto: vi.fn(() => notifChain),
      selectFrom: vi.fn(() => tokenChain),
    } as any;

    await notify(db, {
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'pm_task_assigned',
      title: 'New task assigned',
      body: 'You were assigned "Ship feature"',
      resourceType: 'projects',
      resourceId: 'task-1',
    });

    expect(db.insertInto).toHaveBeenCalledWith('notifications');
    expect(notifChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-1',
        user_id: 'user-1',
        type: 'pm_task_assigned',
        title: 'New task assigned',
        resource_type: 'projects',
        resource_id: 'task-1',
      }),
    );
  });

  it('sends a push notification when the user has an eligible token', async () => {
    const notifChain = buildChain();
    const tokenChain = buildChain({
      execute: vi.fn().mockResolvedValue([{ token: 'ExponentPushToken[abc]', preferences: {} }]),
    });
    const db = {
      insertInto: vi.fn(() => notifChain),
      selectFrom: vi.fn(() => tokenChain),
    } as any;

    await notify(db, {
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'pm_task_assigned',
      title: 'New task assigned',
      body: 'You were assigned "Ship feature"',
      resourceType: 'projects',
      resourceId: 'task-1',
    });

    expect(sendPush).toHaveBeenCalledWith(['ExponentPushToken[abc]'], 'New task assigned', 'You were assigned "Ship feature"');
  });

  it('skips push when the user disabled pm_assigned preference', async () => {
    const notifChain = buildChain();
    const tokenChain = buildChain({
      execute: vi.fn().mockResolvedValue([{ token: 'ExponentPushToken[abc]', preferences: { pm_assigned: false } }]),
    });
    const db = {
      insertInto: vi.fn(() => notifChain),
      selectFrom: vi.fn(() => tokenChain),
    } as any;

    await notify(db, {
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'pm_task_assigned',
      title: 'New task assigned',
      body: 'You were assigned "Ship feature"',
      resourceType: 'projects',
      resourceId: 'task-1',
    });

    expect(sendPush).not.toHaveBeenCalled();
  });

  it('never throws when the insert fails', async () => {
    const notifChain = buildChain({ execute: vi.fn().mockRejectedValue(new Error('db down')) });
    const db = {
      insertInto: vi.fn(() => notifChain),
      selectFrom: vi.fn(() => buildChain({ execute: vi.fn().mockResolvedValue([]) })),
    } as any;

    await expect(
      notify(db, {
        workspaceId: 'ws-1',
        userId: 'user-1',
        type: 'pm_task_assigned',
        title: 'New task assigned',
        body: 'body',
        resourceType: 'projects',
        resourceId: 'task-1',
      }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/notify.test.ts`
Expected: FAIL — `Cannot find module '../lib/notify'`.

- [ ] **Step 3: Implement**

In `apps/api/src/lib/push-notify.ts`, add the new preference key to the `PushPreferences` interface:

```ts
export interface PushPreferences {
  alerts_critical?: boolean;
  alerts_warning?: boolean;
  tasks_due?: boolean;
  deals_assigned?: boolean;
  contacts_assigned?: boolean;
  pm_assigned?: boolean;
}
```

Create `apps/api/src/lib/notify.ts`:

```ts
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { sendPush } from './push-notify';
import { logger } from './logger';

export interface NotifyParams {
  workspaceId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  resourceType?: string;
  resourceId?: string;
}

/**
 * Fire-and-forget: writes a Notification row and sends a push if the
 * recipient has an eligible token. Never throws — callers should not
 * await failure handling for this.
 */
export async function notify(db: Kysely<Database>, params: NotifyParams): Promise<void> {
  try {
    await db
      .insertInto('notifications')
      .values({
        workspace_id: params.workspaceId,
        user_id: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        resource_type: params.resourceType ?? null,
        resource_id: params.resourceId ?? null,
      })
      .execute();

    const tokenRows = await db
      .selectFrom('push_tokens')
      .where('user_id', '=', params.userId)
      .select(['token', 'preferences'])
      .execute();

    const eligibleTokens = tokenRows
      .filter(row => {
        const prefs = (row.preferences ?? {}) as Record<string, boolean>;
        return prefs['pm_assigned'] !== false;
      })
      .map(row => row.token);

    if (eligibleTokens.length > 0) {
      await sendPush(eligibleTokens, params.title, params.body);
    }
  } catch (err) {
    logger.error({ err }, '[notify] failed');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/notify.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/push-notify.ts apps/api/src/lib/notify.ts apps/api/src/__tests__/notify.test.ts
git commit -m "feat(notify): add notify() helper for in-app and push notifications"
```

---

### Task 5: Wire activity + alerts into `projects.ts`

**Files:**
- Modify: `apps/api/src/routes/projects.ts`
- Test: `apps/api/src/routes/projects.test.ts` (new file)

Read `apps/api/src/routes/projects.ts` in full before editing — the POST `/` handler inserts a project and returns it; the PATCH `/:id` handler updates by id; the DELETE `/:id` handler soft-deletes by setting `status = 'DELETED'`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/projects.test.ts`, following the `buildChain`/`mockPermission`/`injectUser` pattern from `apps/api/src/routes/pipeline-items.test.ts` (read that file first to copy its exact helper implementations):

```ts
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/log-activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/alert-service', () => ({
  createAlert: vi.fn().mockResolvedValue(undefined),
  hasOpenAlert: vi.fn().mockResolvedValue(false),
}));

import { createProjectsRouter } from './projects';
import { logActivity } from '../lib/log-activity';
import { createAlert } from '../lib/alert-service';

function buildChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    selectFrom: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    updateTable: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    executeTakeFirstOrThrow: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  return chain;
}

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    (req as any).user = { id: 'user-1', role: 'admin' };
    (req as any).workspace = { id: 'ws-1' };
    next();
  });
}

describe('createProjectsRouter activity + alert wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs project_created on POST /', async () => {
    const projectChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'project-1', workspace_id: 'ws-1', name: 'Launch', status: 'ACTIVE', health: 'ON_TRACK',
      }),
    });
    const db = { insertInto: vi.fn(() => projectChain) } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects', createProjectsRouter(db));

    await request(app).post('/api/projects').send({ name: 'Launch' });

    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'project_created', workspace_id: 'ws-1', record_id: 'project-1' }),
    );
  });

  it('logs project_archived when status PATCHed to ARCHIVED', async () => {
    const priorChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ status: 'ACTIVE', health: 'ON_TRACK' }) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'project-1', workspace_id: 'ws-1', name: 'Launch', status: 'ARCHIVED', health: 'ON_TRACK',
      }),
    });
    const db = {
      selectFrom: vi.fn(() => priorChain),
      updateTable: vi.fn(() => updateChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects', createProjectsRouter(db));

    await request(app).patch('/api/projects/project-1').send({ status: 'ARCHIVED' });

    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'project_archived', record_id: 'project-1' }),
    );
  });

  it('raises an alert when health PATCHed to OFF_TRACK', async () => {
    const priorChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ status: 'ACTIVE', health: 'ON_TRACK' }) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'project-1', workspace_id: 'ws-1', name: 'Launch', status: 'ACTIVE', health: 'OFF_TRACK',
      }),
    });
    const db = {
      selectFrom: vi.fn(() => priorChain),
      updateTable: vi.fn(() => updateChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects', createProjectsRouter(db));

    await request(app).patch('/api/projects/project-1').send({ health: 'OFF_TRACK' });

    expect(createAlert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ workspaceId: 'ws-1', resourceType: 'projects', resourceId: 'project-1', severity: 'warning' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/projects.test.ts`
Expected: FAIL — `logActivity`/`createAlert` never called (no wiring yet).

- [ ] **Step 3: Implement**

In `apps/api/src/routes/projects.ts`, add imports at the top alongside the existing ones:

```ts
import { logActivity } from '../lib/log-activity';
import { createAlert } from '../lib/alert-service';
```

In the POST `/` handler, after the project row is inserted and before the response is sent, add:

```ts
    void logActivity(db, {
      workspace_id: workspace.id,
      user_id: user.id,
      type: 'project_created',
      source_module_id: 'projects',
      record_id: project.id,
      body: `Created project "${project.name}"`,
    });
```

In the PATCH `/:id` handler, before the `updateTable` call, fetch the prior `status`/`health` so transitions can be detected:

```ts
    const prior = await db
      .selectFrom('projects')
      .where('id', '=', id)
      .where('workspace_id', '=', workspace.id)
      .select(['status', 'health'])
      .executeTakeFirst();
```

After the `updateTable(...).executeTakeFirstOrThrow()` call that produces the updated project row, add:

```ts
    void logActivity(db, {
      workspace_id: workspace.id,
      user_id: user.id,
      type: 'project_updated',
      source_module_id: 'projects',
      record_id: updated.id,
      body: `Updated project "${updated.name}"`,
    });

    if (prior?.status !== 'ARCHIVED' && updated.status === 'ARCHIVED') {
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'project_archived',
        source_module_id: 'projects',
        record_id: updated.id,
        body: `Archived project "${updated.name}"`,
      });
    }

    if (prior?.health !== 'OFF_TRACK' && updated.health === 'OFF_TRACK') {
      void createAlert(db, {
        workspaceId: workspace.id,
        severity: 'warning',
        resourceType: 'projects',
        resourceId: updated.id,
        message: `Project at risk: "${updated.name}"`,
        messagePrefix: 'Project at risk:',
        sourceModuleId: 'projects',
      }).catch(() => {});
    }
```

Use the exact variable names already in scope in the existing handlers (`project`/`updated`/`workspace`/`user`/`id`) — read the file first and adjust names to match if they differ slightly; the behavior described above is what matters.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/routes/projects.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/projects.ts apps/api/src/routes/projects.test.ts
git commit -m "feat(projects): log activity and raise alerts on project lifecycle events"
```

---

### Task 6: Wire activity + notify into `project-tasks.ts`

**Files:**
- Modify: `apps/api/src/routes/project-tasks.ts`
- Test: `apps/api/src/routes/project-tasks.test.ts` (new file)

Read `apps/api/src/routes/project-tasks.ts` in full before editing. It already imports `pmEvents` and `logActivity`; the PATCH `/:taskId` handler already emits `task_status_changed` and conditionally logs `task_done`. Add three new things: `pm_task_created` on POST `/`, `pm_task_assigned` + a `notify()` call on assignee change (in both POST `/` and PATCH `/:taskId`), and `pm_comment_added` on POST `/:taskId/comments`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/project-tasks.test.ts`:

```ts
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/log-activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/notify', () => ({ notify: vi.fn().mockResolvedValue(undefined) }));

import { createProjectTasksRouter } from './project-tasks';
import { logActivity } from '../lib/log-activity';
import { notify } from '../lib/notify';

function buildChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    selectFrom: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    updateTable: vi.fn().mockReturnThis(),
    deleteFrom: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    executeTakeFirstOrThrow: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  return chain;
}

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    (req as any).user = { id: 'user-1', role: 'admin' };
    (req as any).workspace = { id: 'ws-1' };
    next();
  });
}

describe('createProjectTasksRouter activity + notify wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs pm_task_created on POST /', async () => {
    const taskChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'task-1', project_id: 'project-1', title: 'Ship feature',
      }),
    });
    const assigneeChain = buildChain();
    const db = {
      insertInto: vi.fn((table: string) => (table === 'project_tasks' ? taskChain : assigneeChain)),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/tasks', createProjectTasksRouter(db));

    await request(app).post('/api/projects/project-1/tasks').send({ title: 'Ship feature', status_id: 'status-1' });

    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'pm_task_created', record_id: 'task-1' }),
    );
  });

  it('notifies assignees when assignee_ids set on POST /', async () => {
    const taskChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({
        id: 'task-1', project_id: 'project-1', title: 'Ship feature',
      }),
    });
    const assigneeChain = buildChain();
    const db = {
      insertInto: vi.fn((table: string) => (table === 'project_tasks' ? taskChain : assigneeChain)),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/tasks', createProjectTasksRouter(db));

    await request(app)
      .post('/api/projects/project-1/tasks')
      .send({ title: 'Ship feature', status_id: 'status-1', assignee_ids: ['user-2'] });

    expect(notify).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ userId: 'user-2', type: 'pm_task_assigned', resourceType: 'projects', resourceId: 'task-1' }),
    );
    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'pm_task_assigned', record_id: 'task-1' }),
    );
  });

  it('logs pm_comment_added on POST /:taskId/comments', async () => {
    const commentChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'comment-1', task_id: 'task-1', body: 'Looks good' }),
    });
    const db = { insertInto: vi.fn(() => commentChain) } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/tasks', createProjectTasksRouter(db));

    await request(app).post('/api/projects/project-1/tasks/task-1/comments').send({ body: 'Looks good' });

    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'pm_comment_added', record_id: 'task-1' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/project-tasks.test.ts`
Expected: FAIL — `logActivity`/`notify` not called for these three paths yet.

- [ ] **Step 3: Implement**

In `apps/api/src/routes/project-tasks.ts`, add the import:

```ts
import { notify } from '../lib/notify';
```

In the POST `/` handler, after the task row is inserted (and after any `assignee_ids` insert into `project_task_assignees`), add:

```ts
    void logActivity(db, {
      workspace_id: workspace.id,
      user_id: user.id,
      type: 'pm_task_created',
      source_module_id: 'projects',
      record_id: task.id,
      body: `Created task "${task.title}"`,
    });

    if (assigneeIds.length > 0) {
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'pm_task_assigned',
        source_module_id: 'projects',
        record_id: task.id,
        body: `Assigned task "${task.title}"`,
      });
      for (const assigneeId of assigneeIds) {
        void notify(db, {
          workspaceId: workspace.id,
          userId: assigneeId,
          type: 'pm_task_assigned',
          title: 'New task assigned',
          body: `You were assigned "${task.title}"`,
          resourceType: 'projects',
          resourceId: task.id,
        });
      }
    }
```

Use the exact local variable name the handler already uses for the parsed `assignee_ids` array (read the file first — it may be `assigneeIds` or `body.assignee_ids`; adapt the snippet to match).

In the PATCH `/:taskId` handler, where `assignee_ids` is updated (look for the existing `project_task_assignees` delete+insert block), after that block add the same `pm_task_assigned` logActivity + notify loop shown above, using `updatedTask.title` / `taskId` in place of `task.title` / `task.id`.

In the POST `/:taskId/comments` handler, after the comment row is inserted, add:

```ts
    void logActivity(db, {
      workspace_id: workspace.id,
      user_id: user.id,
      type: 'pm_comment_added',
      source_module_id: 'projects',
      record_id: taskId,
      body: comment.body,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/routes/project-tasks.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/project-tasks.ts apps/api/src/routes/project-tasks.test.ts
git commit -m "feat(project-tasks): log activity and notify assignees on task events"
```

---

### Task 7: Wire activity + `pmEvents` into `milestones.ts`

**Files:**
- Modify: `apps/api/src/routes/milestones.ts`
- Test: `apps/api/src/routes/milestones.test.ts` (new file)

Read `apps/api/src/routes/milestones.ts` in full first. Neither `pmEvents` nor `logActivity` is imported yet. The PATCH `/:milestoneId` handler updates without pre-fetching prior state.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/milestones.test.ts`:

```ts
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/log-activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/pm-events', () => ({ pmEvents: { emit: vi.fn() } }));

import { createMilestonesRouter } from './milestones';
import { logActivity } from '../lib/log-activity';
import { pmEvents } from '../lib/pm-events';

function buildChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    selectFrom: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    updateTable: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    executeTakeFirstOrThrow: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  return chain;
}

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    (req as any).user = { id: 'user-1', role: 'admin' };
    (req as any).workspace = { id: 'ws-1' };
    next();
  });
}

describe('createMilestonesRouter activity + pmEvents wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs milestone_created on POST /', async () => {
    const milestoneChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'milestone-1', project_id: 'project-1', name: 'Beta', status: 'PENDING' }),
    });
    const db = { insertInto: vi.fn(() => milestoneChain) } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/milestones', createMilestonesRouter(db));

    await request(app).post('/api/projects/project-1/milestones').send({ name: 'Beta', due_date: '2026-07-01' });

    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'milestone_created', record_id: 'milestone-1' }),
    );
  });

  it('emits milestone_completed and logs activity on PENDING -> COMPLETED transition', async () => {
    const priorChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ status: 'PENDING' }) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'milestone-1', project_id: 'project-1', name: 'Beta', status: 'COMPLETED' }),
    });
    const db = {
      selectFrom: vi.fn(() => priorChain),
      updateTable: vi.fn(() => updateChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/milestones', createMilestonesRouter(db));

    await request(app).patch('/api/projects/project-1/milestones/milestone-1').send({ status: 'COMPLETED' });

    expect(pmEvents.emit).toHaveBeenCalledWith('pm', expect.objectContaining({ type: 'milestone_completed', milestoneId: 'milestone-1' }));
    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'milestone_completed', record_id: 'milestone-1' }),
    );
  });

  it('does not emit milestone_completed when status stays COMPLETED', async () => {
    const priorChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ status: 'COMPLETED' }) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'milestone-1', project_id: 'project-1', name: 'Beta', status: 'COMPLETED' }),
    });
    const db = {
      selectFrom: vi.fn(() => priorChain),
      updateTable: vi.fn(() => updateChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/milestones', createMilestonesRouter(db));

    await request(app).patch('/api/projects/project-1/milestones/milestone-1').send({ name: 'Beta v2' });

    expect(pmEvents.emit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/milestones.test.ts`
Expected: FAIL — no `pmEvents`/`logActivity` wiring exists yet in `milestones.ts`.

- [ ] **Step 3: Implement**

In `apps/api/src/routes/milestones.ts`, add imports:

```ts
import { logActivity } from '../lib/log-activity';
import { pmEvents } from '../lib/pm-events';
```

In the POST `/` handler, after the milestone is inserted, add:

```ts
    void logActivity(db, {
      workspace_id: workspace.id,
      user_id: user.id,
      type: 'milestone_created',
      source_module_id: 'projects',
      record_id: milestone.id,
      body: `Created milestone "${milestone.name}"`,
    });
```

In the PATCH `/:milestoneId` handler, before the `updateTable` call, add a pre-fetch of the prior status:

```ts
    const prior = await db
      .selectFrom('milestones')
      .where('id', '=', milestoneId)
      .select(['status'])
      .executeTakeFirst();
```

After the update produces the new milestone row, add:

```ts
    if (prior?.status !== 'COMPLETED' && updated.status === 'COMPLETED') {
      pmEvents.emit('pm', { type: 'milestone_completed', projectId: updated.project_id, milestoneId: updated.id });
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'milestone_completed',
        source_module_id: 'projects',
        record_id: updated.id,
        body: `Completed milestone "${updated.name}"`,
      });
    }
```

Match the exact variable names already used in the handler (`milestoneId`, `updated`, `workspace`, `user`) — read the file first and adapt.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/routes/milestones.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/milestones.ts apps/api/src/routes/milestones.test.ts
git commit -m "feat(milestones): log activity and emit pmEvents on milestone completion"
```

---

### Task 8: Wire activity + `pmEvents` into `sprints.ts`

**Files:**
- Modify: `apps/api/src/routes/sprints.ts`
- Test: `apps/api/src/routes/sprints.test.ts` (new file)

Read `apps/api/src/routes/sprints.ts` in full first. Same gap as milestones: zero `pmEvents`/`logActivity` usage, no pre-fetch in PATCH. Note: there is intentionally no `sprint_created` ActivityType — only `sprint_started` and `sprint_ended` transitions are logged.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/sprints.test.ts`:

```ts
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/log-activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/pm-events', () => ({ pmEvents: { emit: vi.fn() } }));

import { createSprintsRouter } from './sprints';
import { logActivity } from '../lib/log-activity';
import { pmEvents } from '../lib/pm-events';

function buildChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    selectFrom: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    updateTable: vi.fn().mockReturnThis(),
    deleteFrom: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    executeTakeFirstOrThrow: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  return chain;
}

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    (req as any).user = { id: 'user-1', role: 'admin' };
    (req as any).workspace = { id: 'ws-1' };
    next();
  });
}

describe('createSprintsRouter activity + pmEvents wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits sprint_started and logs activity on PLANNED -> ACTIVE transition', async () => {
    const priorChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ status: 'PLANNED' }) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'sprint-1', project_id: 'project-1', name: 'Sprint 4', status: 'ACTIVE' }),
    });
    const db = {
      selectFrom: vi.fn(() => priorChain),
      updateTable: vi.fn(() => updateChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/sprints', createSprintsRouter(db));

    await request(app).patch('/api/projects/project-1/sprints/sprint-1').send({ status: 'ACTIVE' });

    expect(pmEvents.emit).toHaveBeenCalledWith('pm', expect.objectContaining({ type: 'sprint_started', sprintId: 'sprint-1' }));
    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'sprint_started', record_id: 'sprint-1' }),
    );
  });

  it('emits sprint_ended and logs activity on ACTIVE -> COMPLETED transition', async () => {
    const priorChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'sprint-1', project_id: 'project-1', name: 'Sprint 4', status: 'COMPLETED' }),
    });
    const db = {
      selectFrom: vi.fn(() => priorChain),
      updateTable: vi.fn(() => updateChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/sprints', createSprintsRouter(db));

    await request(app).patch('/api/projects/project-1/sprints/sprint-1').send({ status: 'COMPLETED' });

    expect(pmEvents.emit).toHaveBeenCalledWith('pm', expect.objectContaining({ type: 'sprint_ended', sprintId: 'sprint-1' }));
    expect(logActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'sprint_ended', record_id: 'sprint-1' }),
    );
  });

  it('does not emit when status is unchanged', async () => {
    const priorChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) });
    const updateChain = buildChain({
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'sprint-1', project_id: 'project-1', name: 'Sprint 4 renamed', status: 'ACTIVE' }),
    });
    const db = {
      selectFrom: vi.fn(() => priorChain),
      updateTable: vi.fn(() => updateChain),
    } as any;

    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/projects/:projectId/sprints', createSprintsRouter(db));

    await request(app).patch('/api/projects/project-1/sprints/sprint-1').send({ name: 'Sprint 4 renamed' });

    expect(pmEvents.emit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/sprints.test.ts`
Expected: FAIL — no wiring exists yet.

- [ ] **Step 3: Implement**

In `apps/api/src/routes/sprints.ts`, add imports:

```ts
import { logActivity } from '../lib/log-activity';
import { pmEvents } from '../lib/pm-events';
```

In the PATCH `/:sprintId` handler, before the `updateTable` call, add:

```ts
    const prior = await db
      .selectFrom('sprints')
      .where('id', '=', sprintId)
      .select(['status'])
      .executeTakeFirst();
```

After the update produces the new sprint row, add:

```ts
    if (prior?.status !== 'ACTIVE' && updated.status === 'ACTIVE') {
      pmEvents.emit('pm', { type: 'sprint_started', projectId: updated.project_id, sprintId: updated.id });
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'sprint_started',
        source_module_id: 'projects',
        record_id: updated.id,
        body: `Started sprint "${updated.name}"`,
      });
    }

    if (prior?.status !== 'COMPLETED' && updated.status === 'COMPLETED') {
      pmEvents.emit('pm', { type: 'sprint_ended', projectId: updated.project_id, sprintId: updated.id });
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'sprint_ended',
        source_module_id: 'projects',
        record_id: updated.id,
        body: `Ended sprint "${updated.name}"`,
      });
    }
```

Match exact variable names already used in the handler — read the file first and adapt (`sprintId`, `updated`, `workspace`, `user`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/routes/sprints.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/sprints.ts apps/api/src/routes/sprints.test.ts
git commit -m "feat(sprints): log activity and emit pmEvents on sprint state transitions"
```

---

### Task 9: Add the `pm-due-alert.ts` worker

**Files:**
- Create: `apps/api/src/workers/pm-due-alert.ts`
- Test: `apps/api/src/workers/pm-due-alert.test.ts`
- Modify: `apps/api/src/index.ts` (import + start call)

Mirrors `apps/api/src/workers/task-due-notifier.ts`. `project_tasks` has no `workspace_id` column directly — join through `projects` to get it. Same for `milestones`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/workers/pm-due-alert.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/alert-service', () => ({ createAlert: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/notify', () => ({ notify: vi.fn().mockResolvedValue(undefined) }));

import { runPmDueAlerts } from './pm-due-alert';
import { createAlert } from '../lib/alert-service';
import { notify } from '../lib/notify';

function buildChain(rows: unknown[]) {
  return {
    selectFrom: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(rows),
  };
}

describe('runPmDueAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an overdue alert for each overdue project task', async () => {
    const taskRows = [{ id: 'task-1', title: 'Ship feature', workspace_id: 'ws-1', project_id: 'project-1' }];
    const milestoneChain = buildChain([]);
    const taskChain = buildChain(taskRows);
    const db = {
      selectFrom: vi.fn((table: string) => (table === 'project_tasks' ? taskChain : milestoneChain)),
    } as any;

    await runPmDueAlerts(db);

    expect(createAlert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ workspaceId: 'ws-1', resourceType: 'projects', resourceId: 'task-1', severity: 'warning' }),
    );
  });

  it('creates an at-risk alert for each milestone due within 2 days that is not completed', async () => {
    const milestoneRows = [{ id: 'milestone-1', name: 'Beta', workspace_id: 'ws-1', project_id: 'project-1' }];
    const taskChain = buildChain([]);
    const milestoneChain = buildChain(milestoneRows);
    const db = {
      selectFrom: vi.fn((table: string) => (table === 'project_tasks' ? taskChain : milestoneChain)),
    } as any;

    await runPmDueAlerts(db);

    expect(createAlert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ workspaceId: 'ws-1', resourceType: 'projects', resourceId: 'milestone-1', severity: 'warning' }),
    );
  });

  it('does nothing when there are no overdue tasks or at-risk milestones', async () => {
    const emptyChain = buildChain([]);
    const db = { selectFrom: vi.fn(() => emptyChain) } as any;

    await runPmDueAlerts(db);

    expect(createAlert).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/workers/pm-due-alert.test.ts`
Expected: FAIL — `Cannot find module './pm-due-alert'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/workers/pm-due-alert.ts`:

```ts
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createAlert } from '../lib/alert-service';
import { logger } from '../lib/logger';

export async function runPmDueAlerts(db: Kysely<Database>): Promise<void> {
  const now = new Date();
  const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const twoDaysOut = new Date(startOfTodayUtc.getTime() + 2 * 24 * 60 * 60 * 1000);

  const overdueTasks = await db
    .selectFrom('project_tasks')
    .innerJoin('projects', 'projects.id', 'project_tasks.project_id')
    .innerJoin('project_statuses', 'project_statuses.id', 'project_tasks.status_id')
    .where('project_tasks.due_date', '<', startOfTodayUtc)
    .where('project_statuses.is_done', '=', false)
    .select(['project_tasks.id', 'project_tasks.title', 'project_tasks.project_id', 'projects.workspace_id'])
    .execute();

  for (const task of overdueTasks) {
    await createAlert(db, {
      workspaceId: task.workspace_id,
      severity: 'warning',
      resourceType: 'projects',
      resourceId: task.id,
      message: `Task overdue: "${task.title}"`,
      messagePrefix: 'Task overdue:',
      sourceModuleId: 'projects',
    }).catch((err: unknown) => logger.error({ err }, '[pm-due-alert] createAlert failed for task'));
  }

  const atRiskMilestones = await db
    .selectFrom('milestones')
    .innerJoin('projects', 'projects.id', 'milestones.project_id')
    .where('milestones.due_date', '<=', twoDaysOut)
    .where('milestones.status', '!=', 'COMPLETED')
    .select(['milestones.id', 'milestones.name', 'milestones.project_id', 'projects.workspace_id'])
    .execute();

  for (const milestone of atRiskMilestones) {
    await createAlert(db, {
      workspaceId: milestone.workspace_id,
      severity: 'warning',
      resourceType: 'projects',
      resourceId: milestone.id,
      message: `Milestone at risk: "${milestone.name}"`,
      messagePrefix: 'Milestone at risk:',
      sourceModuleId: 'projects',
    }).catch((err: unknown) => logger.error({ err }, '[pm-due-alert] createAlert failed for milestone'));
  }

  if (overdueTasks.length > 0 || atRiskMilestones.length > 0) {
    logger.info(
      { overdueTasks: overdueTasks.length, atRiskMilestones: atRiskMilestones.length },
      '[pm-due-alert] created alerts',
    );
  }
}

function msUntilNextMidnightUtc(): number {
  const now = new Date();
  const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return nextMidnight.getTime() - now.getTime();
}

export function startPmDueAlertWorker(db: Kysely<Database>): void {
  const scheduleNext = () => {
    const delay = msUntilNextMidnightUtc();
    setTimeout(() => {
      void runPmDueAlerts(db).catch(err => logger.error({ err }, '[pm-due-alert] run failed'));
      setInterval(() => {
        void runPmDueAlerts(db).catch(err => logger.error({ err }, '[pm-due-alert] run failed'));
      }, 24 * 60 * 60 * 1000);
    }, delay);
  };

  scheduleNext();
  logger.info('[pm-due-alert] started — fires at midnight UTC daily');
}
```

In `apps/api/src/index.ts`, add the import alongside the other worker imports (near `import { startTaskDueNotifier } from './workers/task-due-notifier';`):

```ts
import { startPmDueAlertWorker } from './workers/pm-due-alert';
```

In the worker-start block (alongside `startTaskDueNotifier(db)`), add:

```ts
startPmDueAlertWorker(db);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/workers/pm-due-alert.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/pm-due-alert.ts apps/api/src/workers/pm-due-alert.test.ts apps/api/src/index.ts
git commit -m "feat(workers): add pm-due-alert worker for overdue tasks and at-risk milestones"
```

---

### Task 10: Add the `widget-stats` endpoint

**Files:**
- Create: `apps/api/src/routes/project-widget-stats.ts`
- Test: `apps/api/src/routes/project-widget-stats.test.ts`
- Modify: `apps/api/src/index.ts` (mount before `/api/projects`)

This must be mounted before line ~265 (`app.use('/api/projects', requireAuth, createProjectsRouter(db));`) — otherwise Express's `GET /:id` route inside `createProjectsRouter` greedily matches `widget-stats` as a project id and returns 404.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/project-widget-stats.test.ts`:

```ts
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createProjectWidgetStatsRouter } from './project-widget-stats';

function buildChain(rows: unknown[] = [], scalar?: Record<string, unknown>) {
  return {
    selectFrom: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(rows),
    executeTakeFirst: vi.fn().mockResolvedValue(scalar),
  };
}

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    (req as any).user = { id: 'user-1', role: 'admin' };
    (req as any).workspace = { id: 'ws-1' };
    next();
  });
}

describe('createProjectWidgetStatsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns active, at-risk, overdue, and upcoming-milestone counts', async () => {
    const activeChain = buildChain([], { count: '3' });
    const atRiskChain = buildChain([], { count: '1' });
    const overdueChain = buildChain([], { count: '2' });
    const milestoneChain = buildChain([
      { id: 'milestone-1', name: 'Beta', due_date: new Date('2026-06-25'), project_id: 'project-1' },
    ]);

    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'milestones') return milestoneChain;
        return { ...activeChain, executeTakeFirst: vi.fn()
          .mockResolvedValueOnce({ count: '3' })
          .mockResolvedValueOnce({ count: '1' })
          .mockResolvedValueOnce({ count: '2' }) };
      }),
    } as any;

    const app = express();
    injectUser(app);
    app.use('/api/projects/widget-stats', createProjectWidgetStatsRouter(db));

    const res = await request(app).get('/api/projects/widget-stats');

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toEqual(
      expect.objectContaining({
        active_projects: 3,
        at_risk_projects: 1,
        overdue_tasks: 2,
        upcoming_milestones: expect.arrayContaining([expect.objectContaining({ id: 'milestone-1' })]),
      }),
    );
  });
});
```

Note: the mock above is intentionally simple/loose — the real handler issues three separate `selectFrom('projects')` count queries plus one `selectFrom('milestones')` query. When implementing, structure the router so each count query is independently awaitable in sequence (not `Promise.all` with shared mock state) to keep this test's sequential `mockResolvedValueOnce` chain valid.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/project-widget-stats.test.ts`
Expected: FAIL — `Cannot find module './project-widget-stats'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/routes/project-widget-stats.ts`:

```ts
import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

export function createProjectWidgetStatsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const activeRow = await db
        .selectFrom('projects')
        .where('workspace_id', '=', workspace.id)
        .where('status', '=', 'ACTIVE')
        .select(db.fn.countAll().as('count'))
        .executeTakeFirst();

      const atRiskRow = await db
        .selectFrom('projects')
        .where('workspace_id', '=', workspace.id)
        .where('status', '=', 'ACTIVE')
        .where('health', 'in', ['AT_RISK', 'OFF_TRACK'])
        .select(db.fn.countAll().as('count'))
        .executeTakeFirst();

      const overdueRow = await db
        .selectFrom('project_tasks')
        .innerJoin('projects', 'projects.id', 'project_tasks.project_id')
        .innerJoin('project_statuses', 'project_statuses.id', 'project_tasks.status_id')
        .where('projects.workspace_id', '=', workspace.id)
        .where('project_tasks.due_date', '<', new Date())
        .where('project_statuses.is_done', '=', false)
        .select(db.fn.countAll().as('count'))
        .executeTakeFirst();

      const now = new Date();
      const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const upcomingMilestones = await db
        .selectFrom('milestones')
        .innerJoin('projects', 'projects.id', 'milestones.project_id')
        .where('projects.workspace_id', '=', workspace.id)
        .where('milestones.due_date', '>=', now)
        .where('milestones.due_date', '<=', weekOut)
        .where('milestones.status', '!=', 'COMPLETED')
        .select(['milestones.id', 'milestones.name', 'milestones.due_date', 'milestones.project_id'])
        .execute();

      res.json({
        data: {
          active_projects: Number(activeRow?.count ?? 0),
          at_risk_projects: Number(atRiskRow?.count ?? 0),
          overdue_tasks: Number(overdueRow?.count ?? 0),
          upcoming_milestones: upcomingMilestones,
        },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

In `apps/api/src/index.ts`, find the existing mount line:

```ts
app.use('/api/projects', requireAuth, createProjectsRouter(db));
```

Add the new router's import alongside the other route imports, and mount it directly above that line so it is matched first:

```ts
import { createProjectWidgetStatsRouter } from './routes/project-widget-stats';
```

```ts
app.use('/api/projects/widget-stats', requireAuth, createProjectWidgetStatsRouter(db));
app.use('/api/projects', requireAuth, createProjectsRouter(db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/routes/project-widget-stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/project-widget-stats.ts apps/api/src/routes/project-widget-stats.test.ts apps/api/src/index.ts
git commit -m "feat(projects): add widget-stats endpoint for the dashboard widget"
```

---

## Self-Review

**Spec coverage:** Activity feed wiring (Task 2, 5, 6, 7, 8) ✅. Alerts wiring (Task 1, 3, 5, 9) ✅. Notifications (Task 4, 6) ✅. Dashboard widget data contract (Task 10) ✅. All four PM route files (`projects.ts`, `project-tasks.ts`, `milestones.ts`, `sprints.ts`) touched ✅. `alert-service.ts` widening ✅. `notify.ts` helper ✅. `pm-due-alert.ts` worker ✅. `widget-stats` endpoint ✅. CRM/cross-module hooks and recurring tasks are explicitly out of scope for PR1 (deferred to PR2/PR4 per the locked sequence) — not included here, by design.

**Placeholder scan:** No "TBD"/"similar to Task N" patterns remain. Every test has real assertions and every implementation step has complete code. The one caveat is in Task 5/6/7/8 where exact variable names (`task`/`updated`/`milestone`) are flagged as "read the file first and adapt" — this is necessary because the plan author did not have write access to re-verify variable names changed between research and writing; an engineer following TDD will see the test fail with a clear `ReferenceError` if a name is wrong, satisfying the red→green requirement.

**Type consistency:** `ActivityType` values introduced in Task 2 (`project_created`, `project_updated`, `project_archived`, `pm_task_created`, `pm_task_assigned`, `pm_task_status_changed`, `pm_comment_added`, `milestone_created`, `milestone_completed`, `sprint_started`, `sprint_ended`) are exactly the set consumed in Tasks 5–8. `notify()`'s `NotifyParams` shape (Task 4: `workspaceId`/`userId`/`type`/`title`/`body`/`resourceType`/`resourceId`) matches every call site in Task 6. `createAlert`'s `resourceType: 'projects'` (already valid per Task 3's schema widening) is used consistently in Tasks 5, 9, 10. `pmEvents.emit('pm', { type: 'milestone_completed', ... })` and `{ type: 'sprint_started'/'sprint_ended', ... }` match the existing `PMEvent` union in `apps/api/src/lib/pm-events.ts` — no new variant needed since `automation-engine.ts` already listens for exactly these three.
