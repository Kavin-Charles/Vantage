# Push Notification Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side push notification infrastructure — DB table, API endpoints, send utility, and triggers on alert creation and daily task reminders.

**Architecture:** New `push_tokens` table stores Expo push tokens per user. A `push-notify.ts` lib wraps expo-server-sdk. Alert creation in `agent.ts` fires push notifications fire-and-forget alongside existing in-app notifications. A midnight cron scans tasks due today and pushes per-user reminders.

**Tech Stack:** `expo-server-sdk` (npm), Kysely migrations, Express router, existing pnpm/tsx/Node.js stack.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/db/migrations/20240112_001_push_tokens.ts` | Create | Kysely migration — `push_tokens` table |
| `packages/db/src/schema.ts` | Modify | Add `PushTokenTable` + `push_tokens` to `Database` |
| `apps/api/src/lib/push-notify.ts` | Create | `sendPush(tokens, title, body)` utility |
| `apps/api/src/routes/push-token.ts` | Create | POST/DELETE/PATCH `/api/me/push-token` router |
| `apps/api/src/index.ts` | Modify | Mount push-token router + install expo-server-sdk |
| `apps/api/src/routes/agent.ts` | Modify | Fire push after alert insert (additive only) |
| `apps/api/src/workers/task-due-notifier.ts` | Create | Midnight cron → push task reminders |
| `apps/api/src/index.ts` | Modify | Start task-due-notifier worker |
| `apps/api/package.json` | Modify | Add `expo-server-sdk` dependency |

---

### Task 1: DB migration — `push_tokens` table

**Files:**
- Create: `packages/db/migrations/20240112_001_push_tokens.ts`

- [ ] **Step 1: Create the migration file**

```typescript
// packages/db/migrations/20240112_001_push_tokens.ts
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('push_tokens')
    .addColumn('id', 'uuid', col =>
      col.primaryKey().defaultTo(db.fn('gen_random_uuid', [])),
    )
    .addColumn('user_id', 'uuid', col =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('token', 'text', col => col.notNull())
    .addColumn('platform', 'varchar(10)', col => col.notNull())
    .addColumn('preferences', 'jsonb', col =>
      col.notNull().defaultTo('{}'),
    )
    .addColumn('created_at', 'timestamptz', col =>
      col.notNull().defaultTo(db.fn('now', [])),
    )
    .addColumn('updated_at', 'timestamptz', col =>
      col.notNull().defaultTo(db.fn('now', [])),
    )
    .execute();

  await db.schema
    .createIndex('push_tokens_user_id_idx')
    .on('push_tokens')
    .column('user_id')
    .execute();

  // Unique constraint: one token per user (allows device switch)
  await db.schema
    .createIndex('push_tokens_user_token_unique')
    .on('push_tokens')
    .columns(['user_id', 'token'])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('push_tokens').ifExists().execute();
}
```

- [ ] **Step 2: Run the migration**

```bash
cd D:/Projects/Vantage/packages/db
pnpm db:migrate
```

Expected output: `✓ 20240112_001_push_tokens`

- [ ] **Step 3: Commit**

```bash
git add packages/db/migrations/20240112_001_push_tokens.ts
git commit -m "feat(db): add push_tokens migration"
```

---

### Task 2: Update DB schema types

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Add `PushTokenTable` interface**

After the last table interface definition (before the `Database` interface), add:

```typescript
export interface PushTokenTable {
  id: Generated<string>;
  user_id: string;
  workspace_id: string;
  token: string;
  platform: string;
  preferences: Generated<Record<string, boolean>>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
```

- [ ] **Step 2: Add `push_tokens` to `Database` interface**

In the `Database` interface (around line 448, after `emails: EmailTable;`), add:

```typescript
  push_tokens: PushTokenTable;
```

- [ ] **Step 3: Add convenience types** (after the existing `Email` types)

```typescript
export type PushToken = Selectable<PushTokenTable>;
export type NewPushToken = Insertable<PushTokenTable>;
export type PushTokenUpdate = Updateable<PushTokenTable>;
```

- [ ] **Step 4: Build the db package to verify**

```bash
cd D:/Projects/Vantage/packages/db
pnpm build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat(db): add PushTokenTable to schema"
```

---

### Task 3: Install expo-server-sdk and create push-notify utility

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/lib/push-notify.ts`

- [ ] **Step 1: Install expo-server-sdk in API**

```bash
cd D:/Projects/Vantage/apps/api
pnpm add expo-server-sdk
```

Expected: `expo-server-sdk` appears in `apps/api/package.json` dependencies.

- [ ] **Step 2: Create `apps/api/src/lib/push-notify.ts`**

```typescript
// apps/api/src/lib/push-notify.ts
import Expo from 'expo-server-sdk';
import { logger } from './logger';

const expo = new Expo();

export interface PushPreferences {
  alerts_critical?: boolean;
  alerts_warning?: boolean;
  tasks_due?: boolean;
  deals_assigned?: boolean;
  contacts_assigned?: boolean;
}

/**
 * Send a push notification to a list of Expo push tokens.
 * Silently skips invalid tokens. Logs errors but never throws —
 * push failures must not affect the caller's response.
 */
export async function sendPush(
  tokens: string[],
  title: string,
  body: string,
): Promise<void> {
  const validTokens = tokens.filter(t => Expo.isExpoPushToken(t));
  if (validTokens.length === 0) return;

  const messages = validTokens.map(to => ({
    to,
    title,
    body,
    sound: 'default' as const,
  }));

  try {
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      receipts.forEach((receipt, i) => {
        if (receipt.status === 'error') {
          logger.warn({ token: validTokens[i], error: receipt.message }, '[push] delivery error');
        }
      });
    }
  } catch (err) {
    logger.error({ err }, '[push] sendPush failed');
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json apps/api/src/lib/push-notify.ts
git commit -m "feat(api): add expo-server-sdk and push-notify utility"
```

---

### Task 4: Push token API endpoints

**Files:**
- Create: `apps/api/src/routes/push-token.ts`

Three endpoints on `/api/me/push-token`:
- `POST` — upsert token (called on login)
- `DELETE` — remove token (called on logout)
- `PATCH` — update preferences (called from settings screen)

- [ ] **Step 1: Create `apps/api/src/routes/push-token.ts`**

```typescript
// apps/api/src/routes/push-token.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const pushPreferencesSchema = z.object({
  alerts_critical: z.boolean().optional(),
  alerts_warning: z.boolean().optional(),
  tasks_due: z.boolean().optional(),
  deals_assigned: z.boolean().optional(),
  contacts_assigned: z.boolean().optional(),
});

export function createPushTokenRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // POST /api/me/push-token — upsert token on login
  router.post('/', async (req, res, next) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest;
      const { token, platform } = z
        .object({
          token: z.string().min(1),
          platform: z.enum(['ios', 'android']),
        })
        .parse(req.body);

      // Upsert: if this (user, token) pair already exists, update updated_at
      await db
        .insertInto('push_tokens')
        .values({
          user_id: user.id,
          workspace_id: workspace.id,
          token,
          platform,
          preferences: JSON.stringify({}),
        })
        .onConflict(oc =>
          oc.columns(['user_id', 'token']).doUpdateSet({
            platform,
            updated_at: new Date().toISOString(),
          }),
        )
        .execute();

      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/me/push-token — remove token on logout
  router.delete('/', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const { token } = z.object({ token: z.string().min(1) }).parse(req.body);

      await db
        .deleteFrom('push_tokens')
        .where('user_id', '=', user.id)
        .where('token', '=', token)
        .execute();

      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/me/push-token — update notification preferences
  router.patch('/', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const { token, preferences } = z
        .object({
          token: z.string().min(1),
          preferences: pushPreferencesSchema,
        })
        .parse(req.body);

      await db
        .updateTable('push_tokens')
        .set({
          preferences: JSON.stringify(preferences),
          updated_at: new Date().toISOString(),
        })
        .where('user_id', '=', user.id)
        .where('token', '=', token)
        .execute();

      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/push-token.ts
git commit -m "feat(api): add push token endpoints"
```

---

### Task 5: Mount push-token router in index.ts

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add import**

In `apps/api/src/index.ts`, add after the existing me import:

```typescript
import { createPushTokenRouter } from './routes/push-token';
```

- [ ] **Step 2: Mount the router**

After the existing me route:
```typescript
app.use('/api/me', requireAuth, createMeRouter());
```

Add:
```typescript
app.use('/api/me/push-token', requireAuth, createPushTokenRouter(db));
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): mount push-token router at /api/me/push-token"
```

---

### Task 6: Fire push on alert creation

**Files:**
- Modify: `apps/api/src/routes/agent.ts`

When an alert is inserted, fetch push tokens for all workspace users who have the relevant preference enabled and send a push.

- [ ] **Step 1: Add import to `agent.ts`**

At the top of `apps/api/src/routes/agent.ts`, add:

```typescript
import { sendPush } from '../lib/push-notify';
```

- [ ] **Step 2: Add push send inside the fire-and-forget block**

In `apps/api/src/routes/agent.ts`, inside the existing `void (async () => { ... })()` block (lines ~116–149), after the `sendAlertEmail(...)` call, add:

```typescript
// Push notifications
const pushTokenRows = await db
  .selectFrom('push_tokens')
  .where('workspace_id', '=', server.workspace_id)
  .select(['token', 'preferences'])
  .execute();

const prefKey = severity === 'critical' ? 'alerts_critical' : 'alerts_warning';
const pushTokens = pushTokenRows
  .filter(row => {
    const prefs = (row.preferences ?? {}) as Record<string, boolean>;
    return prefs[prefKey] !== false; // default on
  })
  .map(row => row.token);

const emoji = severity === 'critical' ? '🔴' : '🟡';
await sendPush(
  pushTokens,
  `${emoji} Alert`,
  `${server.name}: ${metric.prefix} at ${Math.round(metric.value)}%`,
);
```

- [ ] **Step 3: Verify the agent.ts file still compiles**

```bash
cd D:/Projects/Vantage/apps/api
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/agent.ts
git commit -m "feat(api): fire push notifications on alert creation"
```

---

### Task 7: Midnight cron for task-due push notifications

**Files:**
- Create: `apps/api/src/workers/task-due-notifier.ts`
- Modify: `apps/api/src/index.ts`

Each day at midnight UTC: find all tasks with `due_date = today` and `status = 'todo'`, grouped by assignee. Send one push per task.

- [ ] **Step 1: Create `apps/api/src/workers/task-due-notifier.ts`**

```typescript
// apps/api/src/workers/task-due-notifier.ts
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { sendPush } from '../lib/push-notify';
import { logger } from '../lib/logger';

async function runDueTaskNotifications(db: Kysely<Database>): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  const dueTasks = await db
    .selectFrom('tasks')
    .where('due_date', '=', today)
    .where('status', '=', 'todo')
    .select(['id', 'title', 'assignee_id', 'workspace_id'])
    .execute();

  if (dueTasks.length === 0) return;

  // Group by assignee
  const byAssignee = new Map<string, typeof dueTasks>();
  for (const task of dueTasks) {
    if (!task.assignee_id) continue;
    const existing = byAssignee.get(task.assignee_id) ?? [];
    existing.push(task);
    byAssignee.set(task.assignee_id, existing);
  }

  for (const [assigneeId, tasks] of byAssignee) {
    const tokenRows = await db
      .selectFrom('push_tokens')
      .where('user_id', '=', assigneeId)
      .select(['token', 'preferences'])
      .execute();

    const eligibleTokens = tokenRows
      .filter(row => {
        const prefs = (row.preferences ?? {}) as Record<string, boolean>;
        return prefs['tasks_due'] !== false; // default on
      })
      .map(row => row.token);

    if (eligibleTokens.length === 0) continue;

    for (const task of tasks) {
      await sendPush(eligibleTokens, '📋 Task due today', task.title);
    }
  }

  logger.info({ count: dueTasks.length }, '[task-due-notifier] sent push for due tasks');
}

function msUntilNextMidnightUtc(): number {
  const now = new Date();
  const nextMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return nextMidnight.getTime() - now.getTime();
}

export function startTaskDueNotifier(db: Kysely<Database>): void {
  const scheduleNext = () => {
    const delay = msUntilNextMidnightUtc();
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
  };

  scheduleNext();
  logger.info('[task-due-notifier] started — fires at midnight UTC daily');
}
```

- [ ] **Step 2: Import and start in `apps/api/src/index.ts`**

Add import:
```typescript
import { startTaskDueNotifier } from './workers/task-due-notifier';
```

After `startWebsiteChecker(db);`, add:
```typescript
startTaskDueNotifier(db);
```

- [ ] **Step 3: Type-check**

```bash
cd D:/Projects/Vantage/apps/api
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/workers/task-due-notifier.ts apps/api/src/index.ts
git commit -m "feat(api): add midnight cron for task-due push notifications"
```
