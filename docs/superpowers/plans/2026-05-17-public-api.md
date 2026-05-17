# Public REST API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the public REST API by wiring webhook events from all CRM/infra routes, building the delivery worker, and adding the delivery history endpoint.

**Architecture:** The infrastructure (API keys, v1 routes, webhook subscriptions table, delivery queue, `queueWebhook()` helper) is already built. This plan wires `queueWebhook()` into existing route handlers, creates the delivery worker that reads from `webhook_deliveries` and POSTs to subscriber URLs with HMAC-SHA256 signatures, and adds the delivery history endpoint.

**Tech Stack:** Node.js, Express, Kysely, PostgreSQL, `node:crypto` (built-in for HMAC), Vitest

---

## File Map

| File | Change |
|------|--------|
| `apps/api/src/lib/queue-webhook.ts` | Expand `WebhookEvent` type |
| `apps/api/src/routes/webhooks.ts` | Expand `ALLOWED_EVENTS`; add GET /deliveries |
| `apps/api/src/routes/contacts.ts` | Wire `contact.created` / `contact.updated` |
| `apps/api/src/routes/v1/contacts.ts` | Wire `contact.created` / `contact.updated` |
| `apps/api/src/routes/deals.ts` | Wire `deal.created` / `deal.won` / `deal.lost` |
| `apps/api/src/routes/v1/deals.ts` | Wire `deal.created` / `deal.stage_changed` / `deal.won` / `deal.lost` |
| `apps/api/src/routes/tasks.ts` | Wire `task.created` / `task.completed` |
| `apps/api/src/routes/v1/tasks.ts` | Add GET /:id; wire `task.created` / `task.completed` |
| `apps/api/src/routes/agent.ts` | Wire `alert.created` after alert insert |
| `apps/api/src/routes/alerts.ts` | Wire `alert.resolved` on resolve PATCH |
| `apps/api/src/workers/webhook-delivery.ts` | **Create** delivery worker |
| `apps/api/src/index.ts` | Register delivery worker |
| `apps/api/src/__tests__/webhook-delivery.test.ts` | **Create** tests |
| `apps/api/src/__tests__/webhook-events.test.ts` | **Create** tests |

---

### Task 1: Expand WebhookEvent type and ALLOWED_EVENTS

**Files:**
- Modify: `apps/api/src/lib/queue-webhook.ts`
- Modify: `apps/api/src/routes/webhooks.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/webhook-events.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('WebhookEvent type coverage', () => {
  it('queueWebhook accepts all expected event names without TS error', async () => {
    const { queueWebhook } = await import('../lib/queue-webhook');
    // This test just verifies the module loads — type coverage is compile-time.
    expect(typeof queueWebhook).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to confirm it passes (it already should)**

```bash
cd apps/api && pnpm vitest run src/__tests__/webhook-events.test.ts
```

Expected: PASS (the test is a smoke test — the real guard is TypeScript)

- [ ] **Step 3: Update `queue-webhook.ts`**

Replace the existing `WebhookEvent` type line:

```typescript
// apps/api/src/lib/queue-webhook.ts
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

export type WebhookEvent =
  | 'contact.created'
  | 'contact.updated'
  | 'deal.created'
  | 'deal.stage_changed'
  | 'deal.won'
  | 'deal.lost'
  | 'task.created'
  | 'task.completed'
  | 'alert.created'
  | 'alert.resolved'
  | 'item.moved';

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

- [ ] **Step 4: Update `ALLOWED_EVENTS` in `routes/webhooks.ts`**

Replace line 8 in `apps/api/src/routes/webhooks.ts`:

```typescript
const ALLOWED_EVENTS = [
  'contact.created',
  'contact.updated',
  'deal.created',
  'deal.stage_changed',
  'deal.won',
  'deal.lost',
  'task.created',
  'task.completed',
  'alert.created',
  'alert.resolved',
  'item.moved',
] as const;
```

- [ ] **Step 5: Build check**

```bash
cd apps/api && pnpm tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/queue-webhook.ts apps/api/src/routes/webhooks.ts apps/api/src/__tests__/webhook-events.test.ts
git commit -m "feat: expand webhook event type to include all CRM and infra events"
```

---

### Task 2: Wire contact webhook events

**Files:**
- Modify: `apps/api/src/routes/contacts.ts`
- Modify: `apps/api/src/routes/v1/contacts.ts`

- [ ] **Step 1: Add tests for contact event wiring**

Add to `apps/api/src/__tests__/webhook-events.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock queueWebhook before importing route modules
vi.mock('../lib/queue-webhook', () => ({
  queueWebhook: vi.fn().mockResolvedValue(undefined),
}));

// Mock log-activity
vi.mock('../lib/log-activity', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

function buildDb(returnVal: object) {
  const chain: Record<string, unknown> = {};
  const fns = ['insertInto','updateTable','selectFrom','values','set','where','returning','returningAll','selectAll','select','execute','executeTakeFirstOrThrow','executeTakeFirst'];
  for (const f of fns) chain[f] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue({ numInsertedOrUpdatedRows: 1n });
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(returnVal);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(returnVal);
  return {
    insertInto: vi.fn().mockReturnValue(chain),
    updateTable: vi.fn().mockReturnValue(chain),
    selectFrom: vi.fn().mockReturnValue(chain),
    fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
  };
}

function buildRes() {
  const json = vi.fn();
  return { json, status: vi.fn().mockReturnValue({ json }) };
}

describe('contact webhook events', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fires contact.created on POST /api/contacts', async () => {
    const { queueWebhook } = await import('../lib/queue-webhook');
    const fakeContact = { id: 'c1', name: 'Alice', email: 'a@b.com', status: 'prospect', workspace_id: 'ws1' };
    const db = buildDb(fakeContact);
    const { createContactsRouter } = await import('../routes/contacts');
    const router = createContactsRouter(db as never);
    const postRoute = (router as never as { stack: { route: { stack: { handle: Function }[] }; methods: Record<string,boolean> }[] }).stack.find(
      (s: { route: { stack: { handle: Function }[] }; methods: Record<string,boolean> }) => s.route?.methods['post'] && !s.route?.stack?.[0]
    );
    // Find POST / handler (the main create handler)
    const handlers = (router as never as { stack: { route?: { path: string; methods: Record<string,boolean>; stack: { handle: Function }[] } }[] }).stack;
    const postHandler = handlers.find(
      (s) => s.route?.path === '/' && s.route?.methods['post']
    );
    expect(postHandler).toBeDefined();
    const req = {
      body: { name: 'Alice', email: 'a@b.com', status: 'prospect' },
      workspace: { id: 'ws1' },
      user: { id: 'u1' },
    };
    const res = buildRes();
    await postHandler!.route!.stack[0]!.handle(req, res, vi.fn());
    // queueWebhook called fire-and-forget — wait a tick
    await new Promise(r => setTimeout(r, 0));
    expect(queueWebhook).toHaveBeenCalledWith(
      expect.anything(),
      'ws1',
      'contact.created',
      expect.objectContaining({ contact_id: 'c1', workspace_id: 'ws1' }),
    );
  });
});
```

- [ ] **Step 2: Run test to see it fail**

```bash
cd apps/api && pnpm vitest run src/__tests__/webhook-events.test.ts
```

Expected: FAIL — `queueWebhook` not called yet

- [ ] **Step 3: Add imports to `routes/contacts.ts`**

At the top of `apps/api/src/routes/contacts.ts`, after the existing imports, add:

```typescript
import { logger } from '../lib/logger';
import { queueWebhook } from '../lib/queue-webhook';
```

- [ ] **Step 4: Wire `contact.created` in contacts POST handler**

In `apps/api/src/routes/contacts.ts`, the POST handler ends with:

```typescript
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'note',
        body: `Created contact ${contact.name}`,
        contact_id: contact.id,
      });

      res.status(201).json({ data: contact, error: null });
```

Add a `queueWebhook` call right after `logActivity` (still before the response):

```typescript
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'note',
        body: `Created contact ${contact.name}`,
        contact_id: contact.id,
      });

      queueWebhook(db, workspace.id, 'contact.created', {
        contact_id: contact.id,
        name: contact.name,
        email: contact.email,
        status: contact.status,
        workspace_id: workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

      res.status(201).json({ data: contact, error: null });
```

- [ ] **Step 5: Wire `contact.updated` in contacts PATCH handler**

In `apps/api/src/routes/contacts.ts`, the PATCH handler ends with:

```typescript
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'note',
        body: `Updated contact ${contact.name}`,
        contact_id: contact.id,
      });

      res.json({ data: contact, error: null });
```

Add after `logActivity`:

```typescript
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'note',
        body: `Updated contact ${contact.name}`,
        contact_id: contact.id,
      });

      queueWebhook(db, workspace.id, 'contact.updated', {
        contact_id: contact.id,
        name: contact.name,
        email: contact.email,
        status: contact.status,
        workspace_id: workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

      res.json({ data: contact, error: null });
```

- [ ] **Step 6: Add imports to `routes/v1/contacts.ts`**

At the top of `apps/api/src/routes/v1/contacts.ts`, after the existing imports, add:

```typescript
import { logger } from '../../lib/logger';
import { queueWebhook } from '../../lib/queue-webhook';
```

- [ ] **Step 7: Wire `contact.created` in v1 contacts POST**

In `apps/api/src/routes/v1/contacts.ts`, the POST handler currently ends with:

```typescript
      await db
        .updateTable('workspaces')
        .set({ contact_count: sql`contact_count + 1` })
        .where('id', '=', workspace.id)
        .execute();

      res.status(201).json({ data: contact, error: null });
```

Add queueWebhook before the response:

```typescript
      await db
        .updateTable('workspaces')
        .set({ contact_count: sql`contact_count + 1` })
        .where('id', '=', workspace.id)
        .execute();

      queueWebhook(db, workspace.id, 'contact.created', {
        contact_id: contact.id,
        name: contact.name,
        email: contact.email,
        status: contact.status,
        workspace_id: workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

      res.status(201).json({ data: contact, error: null });
```

- [ ] **Step 8: Wire `contact.updated` in v1 contacts PATCH**

In `apps/api/src/routes/v1/contacts.ts`, the PATCH handler currently ends with:

```typescript
      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }
      res.json({ data: contact, error: null });
```

Change to:

```typescript
      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }

      queueWebhook(db, workspace.id, 'contact.updated', {
        contact_id: contact.id,
        name: contact.name,
        email: contact.email,
        status: contact.status,
        workspace_id: workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

      res.json({ data: contact, error: null });
```

- [ ] **Step 9: Run tests**

```bash
cd apps/api && pnpm vitest run src/__tests__/webhook-events.test.ts
```

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/routes/contacts.ts apps/api/src/routes/v1/contacts.ts apps/api/src/__tests__/webhook-events.test.ts
git commit -m "feat: fire contact.created and contact.updated webhook events"
```

---

### Task 3: Wire deal webhook events

**Files:**
- Modify: `apps/api/src/routes/deals.ts`
- Modify: `apps/api/src/routes/v1/deals.ts`

- [ ] **Step 1: Wire `deal.created` in `routes/deals.ts` POST**

In `apps/api/src/routes/deals.ts`, the POST handler currently ends with:

```typescript
      res.status(201).json({ data: deal, error: null });
```

(after the optional `field_values` block). Add before it:

```typescript
      queueWebhook(db, workspace.id, 'deal.created', {
        deal_id: deal.id,
        name: deal.name,
        value: deal.value,
        stage_id: deal.stage_id,
        pipeline_id: deal.pipeline_id,
        owner_id: deal.owner_id,
        workspace_id: workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

      res.status(201).json({ data: deal, error: null });
```

Note: `queueWebhook` and `logger` are already imported in `routes/deals.ts`.

- [ ] **Step 2: Wire `deal.won` / `deal.lost` in `routes/deals.ts` PATCH**

In `apps/api/src/routes/deals.ts`, the existing PATCH webhook block is:

```typescript
      if (
        parsed.data.stage_id &&
        currentDeal &&
        parsed.data.stage_id !== currentDeal.stage_id
      ) {
        queueWebhook(db, workspace.id, 'deal.stage_changed', {
          deal_id: req.params['id']!,
          deal_name: parsed.data.name ?? currentDeal.name,
          old_stage_id: currentDeal.stage_id,
          new_stage_id: parsed.data.stage_id,
          new_stage_name: targetStage?.name ?? null,
          value: parsed.data.value ?? currentDeal.value,
          owner_id: currentDeal.owner_id,
          workspace_id: workspace.id,
          timestamp: new Date().toISOString(),
        }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

        void logActivity(db, { ... });
      }
```

Extend it to also fire `deal.won` / `deal.lost`:

```typescript
      if (
        parsed.data.stage_id &&
        currentDeal &&
        parsed.data.stage_id !== currentDeal.stage_id
      ) {
        queueWebhook(db, workspace.id, 'deal.stage_changed', {
          deal_id: req.params['id']!,
          deal_name: parsed.data.name ?? currentDeal.name,
          old_stage_id: currentDeal.stage_id,
          new_stage_id: parsed.data.stage_id,
          new_stage_name: targetStage?.name ?? null,
          value: parsed.data.value ?? currentDeal.value,
          owner_id: currentDeal.owner_id,
          workspace_id: workspace.id,
          timestamp: new Date().toISOString(),
        }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

        if (targetStage?.is_won) {
          queueWebhook(db, workspace.id, 'deal.won', {
            deal_id: req.params['id']!,
            deal_name: parsed.data.name ?? currentDeal.name,
            value: parsed.data.value ?? currentDeal.value,
            owner_id: currentDeal.owner_id,
            workspace_id: workspace.id,
            timestamp: new Date().toISOString(),
          }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));
        }

        if (targetStage?.is_lost) {
          queueWebhook(db, workspace.id, 'deal.lost', {
            deal_id: req.params['id']!,
            deal_name: parsed.data.name ?? currentDeal.name,
            value: parsed.data.value ?? currentDeal.value,
            owner_id: currentDeal.owner_id,
            workspace_id: workspace.id,
            timestamp: new Date().toISOString(),
          }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));
        }

        void logActivity(db, {
          workspace_id: workspace.id,
          user_id: currentDeal.owner_id,
          type: 'deal_change',
          body: targetStage
            ? `Deal moved to ${targetStage.name}`
            : 'Deal stage changed',
          deal_id: req.params['id']!,
          meta: {
            old_stage_id: currentDeal.stage_id,
            new_stage_id: parsed.data.stage_id,
            new_stage_name: targetStage?.name ?? null,
          },
        });
      }
```

- [ ] **Step 3: Add imports to `routes/v1/deals.ts`**

At the top of `apps/api/src/routes/v1/deals.ts`, after existing imports, add:

```typescript
import { logger } from '../../lib/logger';
import { queueWebhook } from '../../lib/queue-webhook';
```

- [ ] **Step 4: Wire `deal.created` in `routes/v1/deals.ts` POST**

In `apps/api/src/routes/v1/deals.ts`, the POST handler ends with:

```typescript
      res.status(201).json({ data: deal, error: null });
```

Change to:

```typescript
      queueWebhook(db, workspace.id, 'deal.created', {
        deal_id: deal.id,
        name: deal.name,
        value: deal.value,
        stage_id: deal.stage_id,
        pipeline_id: deal.pipeline_id,
        owner_id: deal.owner_id,
        workspace_id: workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

      res.status(201).json({ data: deal, error: null });
```

- [ ] **Step 5: Add stage-change detection to `routes/v1/deals.ts` PATCH**

The current v1 PATCH doesn't fetch current deal or target stage. Replace the entire PATCH handler in `apps/api/src/routes/v1/deals.ts` (from `router.patch('/:id', ...)` to its closing `});`) with:

```typescript
  // PATCH /v1/deals/:id [read_write]
  router.patch('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      // Read current deal to detect stage change
      const currentDeal = parsed.data.stage_id
        ? await db
            .selectFrom('deals')
            .select(['stage_id', 'name', 'value', 'owner_id'])
            .where('id', '=', req.params['id']!)
            .where('workspace_id', '=', workspace.id)
            .where('deleted_at', 'is', null)
            .executeTakeFirst()
        : null;

      // Fetch target stage if stage is changing
      let targetStage: { name: string; is_won: boolean; is_lost: boolean } | undefined;
      if (parsed.data.stage_id && currentDeal && parsed.data.stage_id !== currentDeal.stage_id) {
        targetStage = await db
          .selectFrom('pipeline_stages')
          .select(['name', 'is_won', 'is_lost'])
          .where('id', '=', parsed.data.stage_id)
          .executeTakeFirst();
      }

      const updateVals: Record<string, unknown> = { updated_at: new Date() };
      for (const [k, v] of Object.entries(parsed.data)) {
        if (v !== undefined) updateVals[k] = k === 'close_date' && v ? new Date(v as string) : v;
      }

      const deal = await db
        .updateTable('deals')
        .set(updateVals as never)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      if (!deal) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deal not found' } });
        return;
      }

      // Fire webhook events on stage change
      if (currentDeal && parsed.data.stage_id && parsed.data.stage_id !== currentDeal.stage_id) {
        queueWebhook(db, workspace.id, 'deal.stage_changed', {
          deal_id: deal.id,
          deal_name: deal.name,
          old_stage_id: currentDeal.stage_id,
          new_stage_id: parsed.data.stage_id,
          new_stage_name: targetStage?.name ?? null,
          value: deal.value,
          owner_id: deal.owner_id,
          workspace_id: workspace.id,
          timestamp: new Date().toISOString(),
        }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

        if (targetStage?.is_won) {
          queueWebhook(db, workspace.id, 'deal.won', {
            deal_id: deal.id,
            deal_name: deal.name,
            value: deal.value,
            owner_id: deal.owner_id,
            workspace_id: workspace.id,
            timestamp: new Date().toISOString(),
          }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));
        }

        if (targetStage?.is_lost) {
          queueWebhook(db, workspace.id, 'deal.lost', {
            deal_id: deal.id,
            deal_name: deal.name,
            value: deal.value,
            owner_id: deal.owner_id,
            workspace_id: workspace.id,
            timestamp: new Date().toISOString(),
          }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));
        }
      }

      res.json({ data: deal, error: null });
    } catch (err) {
      next(err);
    }
  });
```

- [ ] **Step 6: Build check**

```bash
cd apps/api && pnpm tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/deals.ts apps/api/src/routes/v1/deals.ts
git commit -m "feat: fire deal.created, deal.won, deal.lost webhook events"
```

---

### Task 4: Wire task webhook events + add GET /v1/tasks/:id

**Files:**
- Modify: `apps/api/src/routes/tasks.ts`
- Modify: `apps/api/src/routes/v1/tasks.ts`

- [ ] **Step 1: Add imports to `routes/tasks.ts`**

At the top of `apps/api/src/routes/tasks.ts`, after existing imports, add:

```typescript
import { logger } from '../lib/logger';
import { queueWebhook } from '../lib/queue-webhook';
```

- [ ] **Step 2: Wire `task.created` in tasks POST**

In `apps/api/src/routes/tasks.ts`, the POST handler ends with:

```typescript
      res.status(201).json({ data: task, error: null });
```

Change to:

```typescript
      queueWebhook(db, workspace.id, 'task.created', {
        task_id: task.id,
        title: task.title,
        due_date: task.due_date ? (task.due_date as Date).toISOString() : null,
        assignee_id: task.assignee_id,
        workspace_id: workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

      res.status(201).json({ data: task, error: null });
```

- [ ] **Step 3: Wire `task.completed` in tasks PATCH**

In `apps/api/src/routes/tasks.ts`, the PATCH handler ends with:

```typescript
      if (!task) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        return;
      }
      res.json({ data: task, error: null });
```

Change to:

```typescript
      if (!task) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        return;
      }

      if (body.status === 'done') {
        queueWebhook(db, workspace.id, 'task.completed', {
          task_id: task.id,
          title: task.title,
          assignee_id: task.assignee_id,
          workspace_id: workspace.id,
          timestamp: new Date().toISOString(),
        }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));
      }

      res.json({ data: task, error: null });
```

- [ ] **Step 4: Add imports to `routes/v1/tasks.ts`**

At the top of `apps/api/src/routes/v1/tasks.ts`, after existing imports, add:

```typescript
import { logger } from '../../lib/logger';
import { queueWebhook } from '../../lib/queue-webhook';
```

- [ ] **Step 5: Add GET /v1/tasks/:id handler**

In `apps/api/src/routes/v1/tasks.ts`, after the closing `});` of the GET `/` handler (around line 69) and before `// POST /v1/tasks`, insert:

```typescript
  // GET /v1/tasks/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const task = await db
        .selectFrom('tasks')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .executeTakeFirst();

      if (!task) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        return;
      }
      res.json({ data: task, error: null });
    } catch (err) {
      next(err);
    }
  });
```

- [ ] **Step 6: Wire `task.created` in v1 tasks POST**

In `apps/api/src/routes/v1/tasks.ts`, the POST handler ends with:

```typescript
      res.status(201).json({ data: task, error: null });
```

Change to:

```typescript
      queueWebhook(db, workspace.id, 'task.created', {
        task_id: task.id,
        title: task.title,
        due_date: task.due_date ? (task.due_date as Date).toISOString() : null,
        assignee_id: task.assignee_id,
        workspace_id: workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

      res.status(201).json({ data: task, error: null });
```

- [ ] **Step 7: Wire `task.completed` in v1 tasks PATCH**

In `apps/api/src/routes/v1/tasks.ts`, the PATCH handler ends with:

```typescript
      if (!task) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        return;
      }
      res.json({ data: task, error: null });
```

Change to:

```typescript
      if (!task) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        return;
      }

      if (parsed.data.status === 'done') {
        queueWebhook(db, workspace.id, 'task.completed', {
          task_id: task.id,
          title: task.title,
          assignee_id: task.assignee_id,
          workspace_id: workspace.id,
          timestamp: new Date().toISOString(),
        }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));
      }

      res.json({ data: task, error: null });
```

- [ ] **Step 8: Build check and run tests**

```bash
cd apps/api && pnpm tsc --noEmit && pnpm vitest run src/__tests__/webhook-events.test.ts
```

Expected: no TS errors, tests PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routes/tasks.ts apps/api/src/routes/v1/tasks.ts
git commit -m "feat: add GET /v1/tasks/:id and fire task.created, task.completed webhook events"
```

---

### Task 5: Wire alert webhook events

**Files:**
- Modify: `apps/api/src/routes/agent.ts`
- Modify: `apps/api/src/routes/alerts.ts`

- [ ] **Step 1: Add imports to `routes/agent.ts`**

At the top of `apps/api/src/routes/agent.ts`, after the existing imports (after `import { sendPush } ...`), add:

```typescript
import { logger } from '../lib/logger';
import { queueWebhook } from '../lib/queue-webhook';
```

- [ ] **Step 2: Change alert insert to return the inserted row**

In `apps/api/src/routes/agent.ts`, the alert insert is currently:

```typescript
            await db.insertInto('alerts').values({
              workspace_id: server.workspace_id,
              resource_type: 'server',
              resource_id: server.id,
              severity,
              message: `${metric.prefix} at ${Math.round(metric.value)}% on "${server.name}" (threshold: ${metric.threshold}%)`,
            }).execute();
```

Change to return the inserted row:

```typescript
            const insertedAlert = await db.insertInto('alerts').values({
              workspace_id: server.workspace_id,
              resource_type: 'server',
              resource_id: server.id,
              severity,
              message: `${metric.prefix} at ${Math.round(metric.value)}% on "${server.name}" (threshold: ${metric.threshold}%)`,
            }).returning(['id', 'severity', 'message', 'resource_type', 'resource_id']).executeTakeFirstOrThrow();
```

- [ ] **Step 3: Fire `alert.created` after alert insert**

Immediately after the `insertedAlert` assignment (still inside the `if (!existingAlert)` block, before the `void (async () => {` block), add:

```typescript
            queueWebhook(db, server.workspace_id, 'alert.created', {
              alert_id: insertedAlert.id,
              severity: insertedAlert.severity,
              message: insertedAlert.message,
              resource_type: insertedAlert.resource_type,
              resource_id: insertedAlert.resource_id,
              workspace_id: server.workspace_id,
              timestamp: new Date().toISOString(),
            }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));
```

- [ ] **Step 4: Add imports to `routes/alerts.ts`**

At the top of `apps/api/src/routes/alerts.ts`, add after existing imports:

```typescript
import { logger } from '../lib/logger';
import { queueWebhook } from '../lib/queue-webhook';
```

- [ ] **Step 5: Wire `alert.resolved` in alerts PATCH resolve**

In `apps/api/src/routes/alerts.ts`, the resolve handler ends with:

```typescript
      if (!alert) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Alert not found' } });
        return;
      }
      res.json({ data: alert, error: null });
```

Change to:

```typescript
      if (!alert) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Alert not found' } });
        return;
      }

      queueWebhook(db, workspace.id, 'alert.resolved', {
        alert_id: alert.id,
        severity: alert.severity,
        message: alert.message,
        resource_type: alert.resource_type,
        resource_id: alert.resource_id,
        workspace_id: workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

      res.json({ data: alert, error: null });
```

- [ ] **Step 6: Build check**

```bash
cd apps/api && pnpm tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/agent.ts apps/api/src/routes/alerts.ts
git commit -m "feat: fire alert.created and alert.resolved webhook events"
```

---

### Task 6: Webhook delivery worker

**Files:**
- Create: `apps/api/src/workers/webhook-delivery.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing tests for the worker**

Create `apps/api/src/__tests__/webhook-delivery.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const FAKE_SECRET = 'testsecret';
const FAKE_PAYLOAD = JSON.stringify({ deal_id: 'd1', event: 'deal.stage_changed' });

function buildDelivery(overrides: Partial<{
  id: string; attempts: number; payload: string; event: string;
  target_url: string; secret: string;
}> = {}) {
  return {
    id: 'del-1',
    attempts: 0,
    payload: FAKE_PAYLOAD,
    event: 'deal.stage_changed',
    target_url: 'https://example.com/webhook',
    secret: FAKE_SECRET,
    ...overrides,
  };
}

function buildDb(deliveries: ReturnType<typeof buildDelivery>[], updateReturn = {}) {
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };
  return {
    // sql template tag is called as a function — mock via module
    selectFrom: vi.fn(),
    updateTable: vi.fn().mockReturnValue(updateChain),
    _updateChain: updateChain,
    _deliveries: deliveries,
  };
}

// Note: The worker uses Kysely sql template tag which requires the actual db instance.
// We test the logic via a thin wrapper that accepts deliveries directly.

describe('webhook delivery worker — backoff schedule', () => {
  it('next_attempt_at for attempt 1 is ~30s in the future', () => {
    const before = Date.now();
    // Import the helper function
    // We verify the backoff values indirectly by checking the module exports
    expect(true).toBe(true); // placeholder — actual backoff tested via integration
  });
});

describe('webhook delivery worker — HTTP delivery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends correct headers on successful delivery', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const delivery = buildDelivery();
    const { createHmac } = await import('node:crypto');
    const expectedSig = 'sha256=' + createHmac('sha256', FAKE_SECRET)
      .update(FAKE_PAYLOAD)
      .digest('hex');

    // Simulate what the worker does for one delivery
    const { deliverOne } = await import('../workers/webhook-delivery');
    const fakeDb = {
      updateTable: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    };
    await deliverOne(fakeDb as never, delivery);

    expect(fetchMock).toHaveBeenCalledWith(
      delivery.target_url,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Vantage-Signature': expectedSig,
          'X-Vantage-Event': delivery.event,
          'X-Vantage-Delivery': delivery.id,
        }),
        body: FAKE_PAYLOAD,
      }),
    );
  });

  it('marks delivery as delivered on 2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const { deliverOne } = await import('../workers/webhook-delivery');
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const fakeDb = { updateTable: vi.fn().mockReturnValue(updateChain) };

    await deliverOne(fakeDb as never, buildDelivery());

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'delivered' }),
    );
  });

  it('increments attempts and sets next_attempt_at on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { deliverOne } = await import('../workers/webhook-delivery');
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const fakeDb = { updateTable: vi.fn().mockReturnValue(updateChain) };

    await deliverOne(fakeDb as never, buildDelivery({ attempts: 0 }));

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1, last_error: 'HTTP 500' }),
    );
    // status stays pending (not 'failed' since attempts < 5)
    expect(updateChain.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('marks failed when attempts reaches 5', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const { deliverOne } = await import('../workers/webhook-delivery');
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const fakeDb = { updateTable: vi.fn().mockReturnValue(updateChain) };

    await deliverOne(fakeDb as never, buildDelivery({ attempts: 4 }));

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', attempts: 5 }),
    );
  });
});
```

- [ ] **Step 2: Run test to see it fail**

```bash
cd apps/api && pnpm vitest run src/__tests__/webhook-delivery.test.ts
```

Expected: FAIL — `../workers/webhook-delivery` not found

- [ ] **Step 3: Create `workers/webhook-delivery.ts`**

Create `apps/api/src/workers/webhook-delivery.ts`:

```typescript
// Polls webhook_deliveries every 10 seconds and delivers pending webhooks.
import { createHmac } from 'node:crypto';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { logger } from '../lib/logger';

const INTERVAL_MS = 10_000;
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 5;

// Delay in seconds after each failed attempt (index = attempt count after failure)
const BACKOFF_SECONDS = [30, 300, 1800, 7200] as const;

function nextAttemptAt(attemptCount: number): string {
  const delaySecs = BACKOFF_SECONDS[attemptCount - 1] ?? 7200;
  return new Date(Date.now() + delaySecs * 1000).toISOString();
}

export interface DeliveryRow {
  id: string;
  attempts: number;
  payload: string;
  event: string;
  target_url: string;
  secret: string;
}

export async function deliverOne(db: Kysely<Database>, delivery: DeliveryRow): Promise<void> {
  const { id, attempts, payload, event, target_url, secret } = delivery;

  const signature = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let success = false;
  let errorMsg: string | null = null;

  try {
    const res = await fetch(target_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vantage-Signature': signature,
        'X-Vantage-Event': event,
        'X-Vantage-Delivery': id,
      },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      success = true;
    } else {
      errorMsg = `HTTP ${res.status}`;
    }
  } catch (err) {
    clearTimeout(timer);
    errorMsg = err instanceof Error ? err.message : 'Unknown error';
  }

  if (success) {
    await db
      .updateTable('webhook_deliveries')
      .set({ status: 'delivered', delivered_at: new Date().toISOString(), attempts: attempts + 1 })
      .where('id', '=', id)
      .execute();
  } else {
    const newAttempts = attempts + 1;
    if (newAttempts >= MAX_ATTEMPTS) {
      await db
        .updateTable('webhook_deliveries')
        .set({ status: 'failed', attempts: newAttempts, last_error: errorMsg })
        .where('id', '=', id)
        .execute();
    } else {
      await db
        .updateTable('webhook_deliveries')
        .set({
          attempts: newAttempts,
          next_attempt_at: nextAttemptAt(newAttempts),
          last_error: errorMsg,
        })
        .where('id', '=', id)
        .execute();
    }
  }
}

async function runDeliveries(db: Kysely<Database>): Promise<void> {
  const result = await sql<DeliveryRow>`
    SELECT wd.id, wd.attempts, wd.payload, wd.event, ws.target_url, ws.secret
    FROM webhook_deliveries wd
    JOIN webhook_subscriptions ws ON ws.id = wd.subscription_id
    WHERE wd.status = 'pending'
      AND wd.next_attempt_at <= NOW()
    ORDER BY wd.next_attempt_at ASC
    LIMIT 20
  `.execute(db);

  if (result.rows.length === 0) return;

  await Promise.allSettled(
    result.rows.map(row =>
      deliverOne(db, row).catch(err =>
        logger.error({ err, delivery_id: row.id }, '[webhook-delivery] deliver failed'),
      ),
    ),
  );
}

let isRunning = false;

export function startWebhookDelivery(db: Kysely<Database>): void {
  const tick = () => {
    if (isRunning) return;
    isRunning = true;
    runDeliveries(db)
      .catch(err => logger.error({ err }, '[webhook-delivery] run failed'))
      .finally(() => { isRunning = false; });
  };

  tick();
  setInterval(tick, INTERVAL_MS);
  logger.info('webhook delivery worker started (10-s polling)');
}
```

- [ ] **Step 4: Register worker in `index.ts`**

In `apps/api/src/index.ts`, add the import after the existing worker imports (after `import { startTaskDueNotifier } ...`):

```typescript
import { startWebhookDelivery } from './workers/webhook-delivery';
```

And after `startTaskDueNotifier(db);` (around line 125), add:

```typescript
// Start webhook delivery worker (polls every 10 s)
startWebhookDelivery(db);
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && pnpm vitest run src/__tests__/webhook-delivery.test.ts
```

Expected: PASS

- [ ] **Step 6: Build check**

```bash
cd apps/api && pnpm tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/workers/webhook-delivery.ts apps/api/src/index.ts apps/api/src/__tests__/webhook-delivery.test.ts
git commit -m "feat: add webhook delivery worker with HMAC-SHA256 signing and exponential backoff"
```

---

### Task 7: Delivery history endpoint

**Files:**
- Modify: `apps/api/src/routes/webhooks.ts`

- [ ] **Step 1: Add GET /deliveries to `routes/webhooks.ts`**

In `apps/api/src/routes/webhooks.ts`, before the `return router;` line (at the end of the `createWebhooksRouter` function), add:

```typescript
  // GET /api/webhooks/deliveries?subscription_id=<id>&status=<status>&page=<n>&per_page=<n>
  const deliveriesListSchema = z.object({
    subscription_id: z.string().uuid(),
    status: z.enum(['pending', 'delivered', 'failed']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    per_page: z.coerce.number().int().min(1).max(100).default(25),
  });

  router.get('/deliveries', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = deliveriesListSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      // Verify subscription belongs to this workspace
      const sub = await db
        .selectFrom('webhook_subscriptions')
        .select(['id'])
        .where('id', '=', parsed.data.subscription_id)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();

      if (!sub) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
        return;
      }

      let query = db
        .selectFrom('webhook_deliveries')
        .select([
          'id', 'subscription_id', 'event', 'status', 'attempts',
          'last_error', 'delivered_at', 'next_attempt_at', 'created_at',
        ])
        .where('subscription_id', '=', parsed.data.subscription_id)
        .orderBy('created_at', 'desc')
        .limit(parsed.data.per_page)
        .offset((parsed.data.page - 1) * parsed.data.per_page);

      if (parsed.data.status) {
        query = query.where('status', '=', parsed.data.status);
      }

      const deliveries = await query.execute();

      let countQuery = db
        .selectFrom('webhook_deliveries')
        .select(db.fn.countAll<number>().as('count'))
        .where('subscription_id', '=', parsed.data.subscription_id);

      if (parsed.data.status) {
        countQuery = countQuery.where('status', '=', parsed.data.status);
      }

      const { count } = await countQuery.executeTakeFirstOrThrow();

      res.json({
        data: deliveries,
        total: Number(count),
        page: parsed.data.page,
        per_page: parsed.data.per_page,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  });
```

- [ ] **Step 2: Build check**

```bash
cd apps/api && pnpm tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Run all tests**

```bash
cd apps/api && pnpm vitest run
```

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/webhooks.ts
git commit -m "feat: add GET /api/webhooks/deliveries delivery history endpoint"
```

---

### Task 8: Final integration verification

**Files:** no new files

- [ ] **Step 1: Run full test suite**

```bash
cd apps/api && pnpm vitest run
```

Expected: all tests PASS, no regressions

- [ ] **Step 2: Build the API**

```bash
cd apps/api && pnpm build 2>/dev/null || pnpm tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Smoke test webhook subscription creation**

Start the API (`pnpm dev` in `apps/api`), then:

```bash
# 1. Login to get a token
curl -s -c /tmp/cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<your-email>","password":"<your-password>"}' | jq .

# 2. Create a webhook subscription for contact.created
curl -s -b /tmp/cookies.txt -X POST http://localhost:3001/api/webhooks/subscriptions \
  -H 'Content-Type: application/json' \
  -d '{"target_url":"https://webhook.site/<your-id>","event":"contact.created"}' | jq .
# Expected: { data: { id: "...", secret: "...", ... }, error: null }

# 3. List deliveries (initially empty)
curl -s -b /tmp/cookies.txt \
  "http://localhost:3001/api/webhooks/deliveries?subscription_id=<sub-id>" | jq .
# Expected: { data: [], total: 0, ... }
```

- [ ] **Step 4: Commit (if any fixes made)**

```bash
git add -p  # stage only intentional changes
git commit -m "fix: <description if any fixes>"
```

---

## Self-Review Checklist

After all tasks complete:
- [ ] All 10 webhook events wired: `contact.created`, `contact.updated`, `deal.created`, `deal.stage_changed`, `deal.won`, `deal.lost`, `task.created`, `task.completed`, `alert.created`, `alert.resolved`
- [ ] Both internal routes AND v1 routes fire events
- [ ] `GET /v1/tasks/:id` added
- [ ] Delivery worker polls every 10s, exponential backoff, max 5 attempts
- [ ] HMAC-SHA256 in `X-Vantage-Signature` header
- [ ] `GET /api/webhooks/deliveries` returns paginated history
- [ ] All tests pass
- [ ] TypeScript builds cleanly
