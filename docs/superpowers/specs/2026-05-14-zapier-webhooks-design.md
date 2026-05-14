# Zapier Webhook Integration — Design Spec

**Goal:** Fire webhooks to Zapier (or any HTTP consumer) when kanban items move — deal stage changes and item group changes. Subscriptions are managed via REST hooks. Delivery uses a DB-backed retry queue with 3-attempt exponential backoff.

**Architecture:** REST hooks pattern. API handles subscription CRUD + enqueues delivery rows. Existing worker loop handles delivery and retries. No new infrastructure beyond two DB tables.

**Tech stack:** Node.js/Express, Kysely, PostgreSQL, existing worker process.

---

## 1. Events

| Event | Trigger |
|---|---|
| `deal.stage_changed` | Deal PATCH where `stage_id` changes |
| `item.moved` | Item PATCH where `group_id` changes |

---

## 2. Data Layer

### Migration — `packages/db/migrations/20240107_001_webhooks.ts`

**`webhook_subscriptions`**
```sql
id          uuid PK default gen_random_uuid()
workspace_id uuid NOT NULL FK → workspaces(id) ON DELETE CASCADE
target_url  text NOT NULL
event       text NOT NULL   -- 'deal.stage_changed' | 'item.moved'
secret      text NOT NULL   -- HMAC-SHA256 signing secret (random 32 bytes hex)
created_at  timestamptz NOT NULL default now()
```

**`webhook_deliveries`**
```sql
id               uuid PK default gen_random_uuid()
subscription_id  uuid NOT NULL FK → webhook_subscriptions(id) ON DELETE CASCADE
event            text NOT NULL
payload          jsonb NOT NULL
status           text NOT NULL default 'pending'  -- 'pending' | 'delivered' | 'failed'
attempts         integer NOT NULL default 0
next_attempt_at  timestamptz NOT NULL default now()
last_error       text
created_at       timestamptz NOT NULL default now()
delivered_at     timestamptz
```

Index: `webhook_deliveries(status, next_attempt_at)` — worker query performance.

### Schema additions — `packages/db/src/schema.ts`

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

Add to `Database` interface:
```typescript
webhook_subscriptions: WebhookSubscriptionTable;
webhook_deliveries: WebhookDeliveryTable;
```

### Types — `packages/types/src/index.ts`

```typescript
export interface WebhookSubscription {
  id: string;
  workspace_id: string;
  target_url: string;
  event: string;
  created_at: string;
  // secret NOT exported — never returned to client
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

---

## 3. API

### Routes — `apps/api/src/routes/webhooks.ts`

All routes require `requireAuth`. Scoped to `workspace_id` from authenticated request.

```
POST   /api/webhooks/subscriptions        Register subscription
GET    /api/webhooks/subscriptions        List subscriptions (no secret in response)
DELETE /api/webhooks/subscriptions/:id   Delete subscription
```

**POST body:**
```json
{ "target_url": "https://hooks.zapier.com/...", "event": "deal.stage_changed" }
```
Validated with Zod. `event` must be one of `['deal.stage_changed', 'item.moved']`. Generates random 32-byte hex `secret` on creation. Returns subscription (with `secret` — only time it's exposed).

**GET response:**
```json
{ "data": [{ "id": "...", "target_url": "...", "event": "...", "created_at": "..." }] }
```
Secret omitted.

**DELETE:** 404 if subscription not found or belongs to different workspace.

### Queue helper — `apps/api/src/lib/queue-webhook.ts`

```typescript
export async function queueWebhook(
  db: Kysely<Database>,
  workspaceId: string,
  event: 'deal.stage_changed' | 'item.moved',
  payload: Record<string, unknown>,
): Promise<void>
```

- Selects all `webhook_subscriptions` matching `workspace_id + event`
- Inserts one `webhook_deliveries` row per subscription (`status: 'pending'`, `next_attempt_at: now()`)
- Fire-and-forget from calling route (not awaited in request path — use `void queueWebhook(...)`)

### Event payload shapes

**`deal.stage_changed`:**
```json
{
  "event": "deal.stage_changed",
  "deal_id": "uuid",
  "deal_name": "Acme Corp",
  "old_stage_id": "uuid",
  "new_stage_id": "uuid",
  "new_stage_name": "Closing",
  "value": 12000,
  "owner_id": "uuid",
  "workspace_id": "uuid",
  "timestamp": "ISO8601"
}
```

**`item.moved`:**
```json
{
  "event": "item.moved",
  "item_id": "uuid",
  "item_name": "Deploy v2",
  "old_group_id": "uuid",
  "new_group_id": "uuid",
  "new_group_name": "Done",
  "workspace_id": "uuid",
  "timestamp": "ISO8601"
}
```

### Trigger points

**`apps/api/src/routes/deals.ts` — PATCH `/:id`:**
After updating deal, if `body.stage_id` differs from previous `stage_id`, call:
```typescript
void queueWebhook(db, workspace.id, 'deal.stage_changed', { ... });
```
Requires reading old `stage_id` before the update and new stage name after.

**`apps/api/src/routes/items.ts` — PATCH `/:id`:**
After updating item, if `body.group_id` differs from previous `group_id`, call:
```typescript
void queueWebhook(db, workspace.id, 'item.moved', { ... });
```
Requires reading old `group_id` before the update and new group name after.

---

## 4. Worker Delivery Job

### `apps/worker/src/jobs/webhook-delivery.ts`

Runs every 60s as part of the existing worker loop.

**Algorithm:**
1. Query: `SELECT ... FROM webhook_deliveries WHERE status = 'pending' AND next_attempt_at <= now() LIMIT 50`
2. For each delivery:
   a. Fetch `webhook_subscriptions` row (to get `target_url`, `secret`)
   b. Build body: `JSON.stringify({ event, payload, created_at })`
   c. Sign: `X-Vantage-Signature: sha256=<hex(hmac-sha256(secret, body))>`
   d. POST with 10s timeout
   e. **On 2xx:** UPDATE `status = 'delivered'`, `delivered_at = now()`
   f. **On failure (non-2xx or network error):**
      - Increment `attempts`
      - If `attempts < 3`: `next_attempt_at = now() + attempts² × 2 minutes` (2min, 8min)
      - If `attempts >= 3`: `status = 'failed'`, `last_error = <message>`

**Backoff schedule:**
| Attempt | next_attempt_at offset |
|---|---|
| 1 → 2 | +2 min |
| 2 → 3 | +8 min |
| 3 | status = failed |

### `apps/worker/src/index.ts`

Add `runWebhookDelivery(db)` to the 60s loop (runs unconditionally, not behind `config.features.infra`):

```typescript
await runWebhookDelivery(db);
```

---

## 5. File Map

| File | Action |
|---|---|
| `packages/db/migrations/20240107_001_webhooks.ts` | Create |
| `packages/db/src/schema.ts` | Modify — add 2 tables |
| `packages/types/src/index.ts` | Modify — export 2 types |
| `apps/api/src/lib/queue-webhook.ts` | Create |
| `apps/api/src/routes/webhooks.ts` | Create |
| `apps/api/src/routes/deals.ts` | Modify — trigger on stage change |
| `apps/api/src/routes/items.ts` | Modify — trigger on group change |
| `apps/api/src/index.ts` | Modify — register `/api/webhooks` |
| `apps/worker/src/jobs/webhook-delivery.ts` | Create |
| `apps/worker/src/index.ts` | Modify — add `runWebhookDelivery` |
