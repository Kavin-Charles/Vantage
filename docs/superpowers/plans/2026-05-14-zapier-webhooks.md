# Zapier Webhook Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fire webhooks to Zapier (or any HTTP consumer) when deals change stage or items move between groups, with a DB-backed 3-attempt retry queue.

**Architecture:** REST hooks pattern. API routes enqueue delivery rows into `webhook_deliveries`. Existing worker loop picks up pending rows, POSTs to target URLs with HMAC signature, retries up to 3× with exponential backoff.

**Tech Stack:** Node.js 18+, TypeScript, Kysely, PostgreSQL, pnpm monorepo, Express.

---

## File Map

| File | Action |
|------|--------|
| `packages/db/migrations/20240107_001_webhooks.ts` | Create — `webhook_subscriptions` + `webhook_deliveries` tables + index |
| `packages/db/src/schema.ts` | Modify — add `WebhookSubscriptionTable`, `WebhookDeliveryTable`, extend `Database` |
| `packages/types/src/index.ts` | Modify — export `WebhookSubscription`, `WebhookDelivery` types |
| `apps/api/src/lib/queue-webhook.ts` | Create — `queueWebhook()` helper |
| `apps/api/src/routes/webhooks.ts` | Create — subscription CRUD (POST, GET, DELETE) |
| `apps/api/src/routes/deals.ts` | Modify — call `queueWebhook` after stage change |
| `apps/api/src/routes/items.ts` | Modify — call `queueWebhook` after group convert |
| `apps/api/src/index.ts` | Modify — register `/api/webhooks` router |
| `apps/worker/src/jobs/webhook-delivery.ts` | Create — delivery + retry job |
| `apps/worker/src/index.ts` | Modify — add `runWebhookDelivery` to loop |

---

### Task 1: DB migration + schema + types

**Files:**
- Create: `packages/db/migrations/20240107_001_webhooks.ts`
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/types/src/index.ts`

Context: Follow the pattern of existing migrations in `packages/db/migrations/`. The `Database` interface in `schema.ts` maps table names to their table interfaces. Types in `packages/types/src/index.ts` are plain interfaces used by the web app — never include DB-internal fields like `secret` in the exported type.

- [ ] **Step 1: Create the migration file**

Create `packages/db/migrations/20240107_001_webhooks.ts`:

```typescript
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('webhook_subscriptions')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('target_url', 'text', col => col.notNull())
    .addColumn('event', 'text', col => col.notNull())
    .addColumn('secret', 'text', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('webhook_deliveries')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('subscription_id', 'uuid', col =>
      col.notNull().references('webhook_subscriptions.id').onDelete('cascade'),
    )
    .addColumn('event', 'text', col => col.notNull())
    .addColumn('payload', 'jsonb', col => col.notNull())
    .addColumn('status', 'text', col => col.notNull().defaultTo('pending'))
    .addColumn('attempts', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('next_attempt_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('last_error', 'text')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('delivered_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_webhook_deliveries_status_next')
    .on('webhook_deliveries')
    .columns(['status', 'next_attempt_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_webhook_deliveries_status_next').execute();
  await db.schema.dropTable('webhook_deliveries').execute();
  await db.schema.dropTable('webhook_subscriptions').execute();
}
```

- [ ] **Step 2: Add table interfaces to `packages/db/src/schema.ts`**

Open `packages/db/src/schema.ts`. Add these two interfaces before the closing `export interface Database` block (or near the end of the file, before `Database`):

```typescript
export interface WebhookSubscriptionTable {
  id: Generated<string>;
  workspace_id: string;
  target_url: string;
  event: string;
  secret: string;
  created_at: Generated<string>;
}

export interface WebhookDeliveryTable {
  id: Generated<string>;
  subscription_id: string;
  event: string;
  payload: unknown;
  status: Generated<string>;
  attempts: Generated<number>;
  next_attempt_at: Generated<string>;
  last_error: string | null;
  created_at: Generated<string>;
  delivered_at: string | null;
}
```

Then find the `Database` interface and add:

```typescript
  webhook_subscriptions: WebhookSubscriptionTable;
  webhook_deliveries: WebhookDeliveryTable;
```

- [ ] **Step 3: Export types from `packages/types/src/index.ts`**

Add at the end of `packages/types/src/index.ts`:

```typescript
export interface WebhookSubscription {
  id: string;
  workspace_id: string;
  target_url: string;
  event: string;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  subscription_id: string;
  event: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd D:\Projects\Vantage
pnpm --filter @vantage/db exec tsc --noEmit
pnpm --filter @vantage/types exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/20240107_001_webhooks.ts packages/db/src/schema.ts packages/types/src/index.ts
git commit -m "feat: add webhook_subscriptions and webhook_deliveries schema"
```

---

### Task 2: `queueWebhook` helper

**Files:**
- Create: `apps/api/src/lib/queue-webhook.ts`

Context: This helper is called from API routes (fire-and-forget with `void`). It fetches all subscriptions matching the workspace+event, then inserts one delivery row per subscription. The `payload` is stored as jsonb — pass it as a plain object.

- [ ] **Step 1: Create `apps/api/src/lib/queue-webhook.ts`**

```typescript
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

export type WebhookEvent = 'deal.stage_changed' | 'item.moved';

export async function queueWebhook(
  db: Kysely<Database>,
  workspaceId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const subscriptions = await db
    .selectFrom('webhook_subscriptions')
    .select(['id'])
    .where('workspace_id', '=', workspaceId)
    .where('event', '=', event)
    .execute();

  if (subscriptions.length === 0) return;

  const now = new Date().toISOString();
  await db
    .insertInto('webhook_deliveries')
    .values(
      subscriptions.map(sub => ({
        subscription_id: sub.id,
        event,
        payload: JSON.stringify(payload),
        next_attempt_at: now,
      })),
    )
    .execute();
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:\Projects\Vantage
pnpm --filter api exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/queue-webhook.ts
git commit -m "feat: add queueWebhook helper for webhook delivery"
```

---

### Task 3: Webhook subscription API routes

**Files:**
- Create: `apps/api/src/routes/webhooks.ts`

Context: Three routes — POST to subscribe, GET to list, DELETE to unsubscribe. Secret is generated with `randomBytes(32).toString('hex')` on create, returned only in the POST response, never in GET. All routes are workspace-scoped via `AuthenticatedRequest`. Follow the pattern in `apps/api/src/routes/alerts.ts` for auth middleware usage.

- [ ] **Step 1: Create `apps/api/src/routes/webhooks.ts`**

```typescript
import { randomBytes } from 'crypto';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const ALLOWED_EVENTS = ['deal.stage_changed', 'item.moved'] as const;

const createSchema = z.object({
  target_url: z.string().url(),
  event: z.enum(ALLOWED_EVENTS),
});

export function createWebhooksRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // POST /api/webhooks/subscriptions
  router.post('/subscriptions', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      const secret = randomBytes(32).toString('hex');
      const sub = await db
        .insertInto('webhook_subscriptions')
        .values({
          workspace_id: workspace.id,
          target_url: parsed.data.target_url,
          event: parsed.data.event,
          secret,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: sub, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/webhooks/subscriptions
  router.get('/subscriptions', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const subs = await db
        .selectFrom('webhook_subscriptions')
        .select(['id', 'workspace_id', 'target_url', 'event', 'created_at'])
        .where('workspace_id', '=', workspace.id)
        .orderBy('created_at', 'asc')
        .execute();

      res.json({ data: subs, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/webhooks/subscriptions/:id
  router.delete('/subscriptions/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const deleted = await db
        .deleteFrom('webhook_subscriptions')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id'])
        .executeTakeFirst();

      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
        return;
      }

      res.json({ data: { id: deleted.id }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Register route in `apps/api/src/index.ts`**

Add the import near the other route imports:

```typescript
import { createWebhooksRouter } from './routes/webhooks';
```

Add the route registration in the authenticated routes section (after `/api/analytics`):

```typescript
app.use('/api/webhooks', requireAuth, createWebhooksRouter(db));
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:\Projects\Vantage
pnpm --filter api exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/webhooks.ts apps/api/src/index.ts
git commit -m "feat: add webhook subscription CRUD routes"
```

---

### Task 4: Trigger `deal.stage_changed` from deals PATCH

**Files:**
- Modify: `apps/api/src/routes/deals.ts`

Context: The PATCH `/:id` handler (around line 235) updates a deal. When `parsed.data.stage_id` is present, it may change the stage. Read the deal's current `stage_id` **before** the update. After the update, if the stage changed, fire `void queueWebhook(...)`. The `targetStage` object (fetched inside the existing `if (parsed.data.stage_id)` block) has `.name` for the stage name. Also need the deal's `name` and `value` — read those from the pre-update fetch.

- [ ] **Step 1: Add import to `apps/api/src/routes/deals.ts`**

Find the imports at the top of `apps/api/src/routes/deals.ts`. Add:

```typescript
import { queueWebhook } from '../lib/queue-webhook';
```

- [ ] **Step 2: Read deal before update**

In the PATCH `/:id` handler, before the `if (parsed.data.stage_id)` block (currently around line 246), add a read of the current deal to capture `old_stage_id`, `name`, and `value`:

```typescript
      // Read current deal to detect stage change for webhooks
      const currentDeal = await db
        .selectFrom('deals')
        .select(['stage_id', 'name', 'value', 'owner_id'])
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
```

Place this BEFORE the existing `if (parsed.data.stage_id) {` block.

- [ ] **Step 3: Fire webhook after update**

In the PATCH handler, after the `if (Object.keys(updatePayload).length > 0)` update block and before the field_values upsert, add:

```typescript
      // Fire webhook if stage changed
      if (
        parsed.data.stage_id &&
        currentDeal &&
        parsed.data.stage_id !== currentDeal.stage_id
      ) {
        void queueWebhook(db, workspace.id, 'deal.stage_changed', {
          deal_id: req.params['id']!,
          deal_name: currentDeal.name,
          old_stage_id: currentDeal.stage_id,
          new_stage_id: parsed.data.stage_id,
          new_stage_name: targetStage?.name ?? null,
          value: currentDeal.value,
          owner_id: currentDeal.owner_id,
          workspace_id: workspace.id,
          timestamp: new Date().toISOString(),
        });
      }
```

Note: `targetStage` is already declared in the outer scope of the handler (inside `if (parsed.data.stage_id)` block) but TypeScript may complain about scope. If so, declare `let targetStage` outside the `if` block and assign inside.

The full corrected pattern for `targetStage` scoping:

Find:
```typescript
      if (parsed.data.stage_id) {
        const targetStage = await db
```

Replace with:
```typescript
      let targetStage: { id: string; name: string; color: string; position: number; is_won: boolean; is_lost: boolean; pipeline_id: string; created_at: Date; updated_at: Date } | undefined;
      if (parsed.data.stage_id) {
        targetStage = await db
```

- [ ] **Step 4: TypeScript check**

```bash
cd D:\Projects\Vantage
pnpm --filter api exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/deals.ts
git commit -m "feat: fire deal.stage_changed webhook on deal stage update"
```

---

### Task 5: Trigger `item.moved` from items convert

**Files:**
- Modify: `apps/api/src/routes/items.ts`

Context: The `POST /:id/convert` handler (around line 247) moves an item to a different group. `source` has `.group_id` (old) and `.title` (item name). `parsed.target_group_id` is the new group ID. The `targetGroup` query only selects `id` — extend it to also select `name`. Fire `void queueWebhook(...)` after the new item is created.

- [ ] **Step 1: Add import to `apps/api/src/routes/items.ts`**

Add at the top with other imports:

```typescript
import { queueWebhook } from '../lib/queue-webhook';
```

- [ ] **Step 2: Extend targetGroup query to fetch name**

Find:
```typescript
      const targetGroup = await db
        .selectFrom('item_groups')
        .where('id', '=', parsed.target_group_id)
        .where('workspace_id', '=', auth.workspace.id)
        .where('pipeline_id', '=', sourceGroup.pipeline_id)
        .select('id')
        .executeTakeFirst();
```

Replace with:
```typescript
      const targetGroup = await db
        .selectFrom('item_groups')
        .where('id', '=', parsed.target_group_id)
        .where('workspace_id', '=', auth.workspace.id)
        .where('pipeline_id', '=', sourceGroup.pipeline_id)
        .select(['id', 'name'])
        .executeTakeFirst();
```

- [ ] **Step 3: Fire webhook after convert**

After `res.status(201).json({ data: newItem, error: null });` and before the closing `} catch`, add:

```typescript
      void queueWebhook(db, auth.workspace.id, 'item.moved', {
        item_id: newItem.id,
        item_name: source.title,
        old_group_id: source.group_id,
        new_group_id: parsed.target_group_id,
        new_group_name: targetGroup.name,
        workspace_id: auth.workspace.id,
        timestamp: new Date().toISOString(),
      });
```

Place this AFTER the `res.status(201).json(...)` line.

- [ ] **Step 4: TypeScript check**

```bash
cd D:\Projects\Vantage
pnpm --filter api exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/items.ts
git commit -m "feat: fire item.moved webhook on item group convert"
```

---

### Task 6: Worker delivery job

**Files:**
- Create: `apps/worker/src/jobs/webhook-delivery.ts`
- Modify: `apps/worker/src/index.ts`

Context: The worker loop in `index.ts` runs every 60s. Each job is an async function that takes `db: Kysely<Database>`. See `apps/worker/src/jobs/server-staleness.ts` for the pattern. The delivery job fetches pending rows, POSTs to target URLs with an HMAC-SHA256 signature header, and updates status. Backoff: attempt 1 fails → +2min; attempt 2 fails → +8min; attempt 3 fails → status=`failed`.

- [ ] **Step 1: Create `apps/worker/src/jobs/webhook-delivery.ts`**

```typescript
import { createHmac } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { logger } from '../lib/logger';

const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

// Backoff: attempts=1 → 2min, attempts=2 → 8min
function nextAttemptOffset(attempts: number): number {
  return attempts * attempts * 2 * 60 * 1000;
}

export async function runWebhookDelivery(db: Kysely<Database>): Promise<void> {
  const now = new Date().toISOString();

  const pending = await db
    .selectFrom('webhook_deliveries as wd')
    .innerJoin('webhook_subscriptions as ws', 'ws.id', 'wd.subscription_id')
    .select([
      'wd.id',
      'wd.subscription_id',
      'wd.event',
      'wd.payload',
      'wd.attempts',
      'ws.target_url',
      'ws.secret',
    ])
    .where('wd.status', '=', 'pending')
    .where('wd.next_attempt_at', '<=', now)
    .limit(50)
    .execute();

  if (pending.length === 0) return;

  logger.info({ count: pending.length }, 'processing webhook deliveries');

  for (const row of pending) {
    const body = JSON.stringify({
      event: row.event,
      payload: row.payload,
      created_at: new Date().toISOString(),
    });

    const signature = 'sha256=' + createHmac('sha256', row.secret).update(body).digest('hex');

    let success = false;
    let errorMessage: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

      const response = await fetch(row.target_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vantage-Signature': signature,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      success = response.ok;
      if (!success) {
        errorMessage = `HTTP ${response.status}`;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    const newAttempts = row.attempts + 1;

    if (success) {
      await db
        .updateTable('webhook_deliveries')
        .set({ status: 'delivered', delivered_at: new Date().toISOString() })
        .where('id', '=', row.id)
        .execute();
    } else if (newAttempts >= MAX_ATTEMPTS) {
      await db
        .updateTable('webhook_deliveries')
        .set({ status: 'failed', attempts: newAttempts, last_error: errorMessage })
        .where('id', '=', row.id)
        .execute();
      logger.warn({ id: row.id, target_url: row.target_url, error: errorMessage }, 'webhook delivery permanently failed');
    } else {
      const nextAt = new Date(Date.now() + nextAttemptOffset(newAttempts)).toISOString();
      await db
        .updateTable('webhook_deliveries')
        .set({ attempts: newAttempts, next_attempt_at: nextAt, last_error: errorMessage })
        .where('id', '=', row.id)
        .execute();
      logger.warn({ id: row.id, attempts: newAttempts, next_at: nextAt }, 'webhook delivery failed, will retry');
    }
  }
}
```

- [ ] **Step 2: Wire into `apps/worker/src/index.ts`**

Add import:

```typescript
import { runWebhookDelivery } from './jobs/webhook-delivery';
```

Inside the `setInterval` job loop, add `runWebhookDelivery(db)` **unconditionally** (not inside `if (config.features.infra)`):

Find:
```typescript
      await runWebsitePing();
      await runAlertEval();
      if (config.features.infra) {
        await runDbHealth(db);
        await runServerStaleness(db);
      }
```

Replace with:
```typescript
      await runWebsitePing();
      await runAlertEval();
      await runWebhookDelivery(db);
      if (config.features.infra) {
        await runDbHealth(db);
        await runServerStaleness(db);
      }
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:\Projects\Vantage
pnpm --filter worker exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/jobs/webhook-delivery.ts apps/worker/src/index.ts
git commit -m "feat: add webhook delivery worker job with 3-attempt retry backoff"
```

---

## Post-implementation verification

After all tasks complete, verify end-to-end:

1. Run migration: `pnpm --filter api exec tsx src/lib/migrate.ts` (or however migrations are applied in this project)
2. `POST /api/webhooks/subscriptions` with `{ "target_url": "https://webhook.site/...", "event": "deal.stage_changed" }` — should return 201 with `secret`
3. `GET /api/webhooks/subscriptions` — should list the subscription without `secret`
4. Move a deal to a different stage via `PATCH /api/deals/:id` with `{ "stage_id": "<new-id>" }` — a `webhook_deliveries` row should be inserted
5. Wait for worker loop (up to 60s) — delivery row should change to `delivered`; webhook.site should show the payload
6. `DELETE /api/webhooks/subscriptions/:id` — should return 200
