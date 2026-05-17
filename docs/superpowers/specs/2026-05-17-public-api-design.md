# Public REST API — Design Spec

**Date:** 2026-05-17
**Feature:** Phase 3 — Public REST API with API key auth and webhook delivery

---

## Context

Most of the infrastructure is already built:

- **API key table + middleware** — `api_keys` table, SHA256 hashing, `createRequireApiKey` middleware, CRUD routes at `/api/api-keys`
- **v1 public routes** — contacts, companies, deals, tasks, servers, alerts, websites (list + create + update + soft-delete)
- **Webhook subscription CRUD** — `webhook_subscriptions` table, SSRF-protected POST/GET/DELETE at `/api/webhooks/subscriptions`
- **Webhook delivery table** — `webhook_deliveries` with retry fields (status, attempts, next_attempt_at, last_error, delivered_at)
- **`queueWebhook()` helper** — writes delivery rows for all matching subscriptions
- **`deal.stage_changed` event** — already wired in deals PATCH route

**What is missing:**

1. Webhook delivery worker (queue populates, nothing consumes it)
2. More webhook events (contact, deal created, task, alert)
3. Webhook HMAC-SHA256 signature on delivery
4. `GET /:id` endpoints on v1 routes
5. Delivery history endpoint

---

## Architecture

Three work streams, no new infrastructure required.

### 1. Webhook Delivery Worker

New file: `apps/api/src/workers/webhook-delivery.ts`

**Poll loop** — every 10 seconds:
```sql
SELECT wd.*, ws.target_url, ws.secret, ws.event
FROM webhook_deliveries wd
JOIN webhook_subscriptions ws ON ws.id = wd.subscription_id
WHERE wd.status = 'pending'
  AND wd.next_attempt_at <= NOW()
LIMIT 20
FOR UPDATE OF wd SKIP LOCKED
```

**Per delivery:**
1. Parse `payload` (stored as JSON string)
2. Compute HMAC-SHA256 signature: `sha256=HMAC(secret, rawBodyString)`
3. HTTP POST to `target_url` with 10s timeout
4. **Success (2xx):** set `status='delivered'`, `delivered_at=NOW()`
5. **Failure:** increment `attempts`, compute `next_attempt_at` via exponential backoff, set `last_error` to response status/error message
   - If `attempts >= 5`: set `status='failed'`

**Exponential backoff schedule:**

| Attempt | Delay |
|---------|-------|
| 1 (first retry) | 30 seconds |
| 2 | 5 minutes |
| 3 | 30 minutes |
| 4 | 2 hours |
| 5 (final) | mark failed |

**Delivery HTTP request headers:**
```
Content-Type: application/json
X-Vantage-Signature: sha256=<hmac>
X-Vantage-Event: <event_name>
X-Vantage-Delivery: <delivery_id>
```

Worker registers with the same pattern as `website-checker.ts` and `task-due-notifier.ts`.

---

### 2. Webhook Event Wiring

Call `queueWebhook(db, workspaceId, event, payload)` at the appropriate points in existing routes.

#### contacts.ts
- **POST** (after insert): `contact.created` — payload: `{ contact_id, name, email, status, workspace_id, timestamp }`
- **PATCH** (after update): `contact.updated` — payload: `{ contact_id, name, email, status, workspace_id, timestamp }`

#### deals.ts (additions to existing logic)
- **POST** (after insert): `deal.created` — payload: `{ deal_id, name, value, stage, workspace_id, timestamp }`
- **PATCH** when new stage name is `'won'`: `deal.won` — payload: `{ deal_id, name, value, workspace_id, timestamp }`
- **PATCH** when new stage name is `'lost'`: `deal.lost` — payload: `{ deal_id, name, value, workspace_id, timestamp }`
- `deal.stage_changed` already fires for all stage changes (keep it)

#### tasks.ts
- **POST** (after insert): `task.created` — payload: `{ task_id, title, due_date, assignee_id, workspace_id, timestamp }`
- **PATCH** when `status` changes to `'done'`: `task.completed` — payload: `{ task_id, title, assignee_id, workspace_id, timestamp }`

#### routes/agent.ts (server ping route)
- **After `db.insertInto('alerts')` succeeds**: `alert.created` — payload: `{ alert_id, severity, message, resource_type, resource_id, workspace_id, timestamp }`

#### routes/alerts.ts
- **PATCH `/:id/resolve`** (after update): `alert.resolved` — payload: `{ alert_id, severity, message, workspace_id, timestamp }`

#### Supported events enum update
`webhook_subscriptions.event` column currently allows only `deal.stage_changed` and `item.moved`. Update the Zod schema in `routes/webhooks.ts` to allow all new events.

---

### 3. v1 Route Completeness

#### GET /:id endpoints

Add to each v1 router:

- `GET /v1/contacts/:id` — returns single contact (workspace-scoped, 404 if not found or deleted)
- `GET /v1/companies/:id` — returns single company
- `GET /v1/deals/:id` — returns single deal (404 if deleted)
- `GET /v1/tasks/:id` — returns single task

Both `read` and `read_write` scoped keys can access GET endpoints.

#### Delivery history endpoint

`GET /api/webhooks/deliveries` — authenticated via cookie JWT (dashboard use).

Query params: `subscription_id` (required), `status` (optional: pending/delivered/failed), `page` (default 1), `per_page` (default 25, max 100).

Response: `{ data: DeliveryRecord[], total, page, per_page }`

Each record: `{ id, subscription_id, event, status, attempts, last_error, delivered_at, next_attempt_at, created_at }` (no payload — avoid leaking data in logs).

---

## Signature Verification (for consumers)

Webhook consumers verify authenticity by computing HMAC-SHA256 of the raw request body using the subscription secret (returned at creation time, stored by consumer):

```js
const expected = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(rawBody)
  .digest('hex');

const isValid = crypto.timingSafeEqual(
  Buffer.from(request.headers['x-vantage-signature']),
  Buffer.from(expected)
);
```

---

## Data Flow

```
Route handler
  └─ queueWebhook(db, workspaceId, event, payload)
       └─ INSERT INTO webhook_deliveries (status='pending', next_attempt_at=NOW())
            for each matching subscription

webhook-delivery worker (every 10s)
  └─ SELECT deliveries WHERE status='pending' AND next_attempt_at <= NOW() FOR UPDATE SKIP LOCKED
       └─ per delivery:
            sign payload → HTTP POST → success → mark delivered
                                      failure → increment attempts → exp backoff → mark failed at 5
```

---

## Files Touched

| File | Change |
|------|--------|
| `apps/api/src/workers/webhook-delivery.ts` | **Create** — delivery worker |
| `apps/api/src/routes/v1/contacts.ts` | Add GET /:id; call queueWebhook on POST/PATCH |
| `apps/api/src/routes/v1/companies.ts` | Add GET /:id |
| `apps/api/src/routes/v1/deals.ts` | Add GET /:id; call queueWebhook on POST; add deal.won/deal.lost |
| `apps/api/src/routes/v1/tasks.ts` | Add GET /:id; call queueWebhook on POST/PATCH |
| `apps/api/src/routes/contacts.ts` | Call queueWebhook on POST/PATCH |
| `apps/api/src/routes/deals.ts` | Call queueWebhook on POST; add deal.won/deal.lost |
| `apps/api/src/routes/tasks.ts` | Call queueWebhook on POST/PATCH |
| `apps/api/src/routes/agent.ts` | Call queueWebhook after alert insert |
| `apps/api/src/routes/alerts.ts` | Call queueWebhook on resolve |
| `apps/api/src/routes/webhooks.ts` | Update event enum; add GET /deliveries |
| `apps/api/src/index.ts` | Register webhook-delivery worker |

---

## Error Handling

- **Target URL unreachable / timeout:** treated as failure, retry with backoff
- **Non-2xx response:** treated as failure, retry with backoff; `last_error` stores status code
- **Malformed payload in DB:** log and mark failed immediately (no retry)
- **SKIP LOCKED:** ensures multiple worker instances (if ever scaled) don't double-deliver

---

## Testing

- Unit tests for HMAC signature computation
- Unit tests for backoff schedule logic
- Integration tests for each new event (mock `queueWebhook`, verify called with correct event + payload)
- Integration tests for GET /:id (found, not found, wrong workspace)
- Integration test for delivery worker: mock `fetch`, verify delivery marked delivered/retried/failed
