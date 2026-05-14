# Public API — Design Spec

**Goal:** Expose a versioned public REST API (`/v1`) with API key auth, giving external tools full CRUD on CRM data and read-only access to infra.

**Architecture:** New `api_keys` table stores hashed keys. Dedicated `requireApiKey` middleware resolves workspace + scope. New `/v1` router exposes intentionally public endpoints. Existing Clerk-authed routes unchanged.

**Tech stack:** Node.js/Express, Kysely, PostgreSQL, SHA-256 (Node `crypto`), existing web settings UI (Next.js).

---

## 1. Data Layer

### Migration — `packages/db/migrations/20240115_001_api_keys.ts`

```sql
id           uuid PK default gen_random_uuid()
workspace_id uuid NOT NULL FK → workspaces(id) ON DELETE CASCADE
name         text NOT NULL
key_hash     text NOT NULL UNIQUE   -- SHA-256 of raw key
prefix       text NOT NULL          -- first 12 chars of raw key for display
scope        text NOT NULL          -- 'read' | 'read_write'
last_used_at timestamptz
created_at   timestamptz NOT NULL default now()
```

### Key format

`vnt_<scope>_<32 random hex bytes>`

Examples:
- `vnt_read_a3f9c2...` (read scope)
- `vnt_rw_b8d4e1...` (read_write scope)

Raw key shown **once** at creation. Stored as SHA-256 hash. `prefix` (first 12 chars) stored for display — lets users identify keys without exposing the secret.

### Schema additions — `packages/db/src/schema.ts`

```typescript
export interface ApiKeyTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  key_hash: string;
  prefix: string;
  scope: string;
  last_used_at: string | null;
  created_at: Generated<string>;
}
```

Add to `Database` interface:
```typescript
api_keys: ApiKeyTable;
```

Add convenience aliases:
```typescript
export type ApiKey = Selectable<ApiKeyTable>;
export type NewApiKey = Insertable<ApiKeyTable>;
```

### Types — `packages/types/src/index.ts`

```typescript
export interface ApiKey {
  id: string;
  workspace_id: string;
  name: string;
  prefix: string;
  scope: string;
  last_used_at: string | null;
  created_at: string;
  // key_hash never returned to client
}
```

---

## 2. API Key Management (Internal Routes)

### Routes — `apps/api/src/routes/api-keys.ts`

All routes use existing `requireAuth` (Clerk). Scoped to `workspace_id` from authenticated request.

```
GET    /api/api-keys        List keys (no key_hash in response)
POST   /api/api-keys        Create key — returns raw key ONCE
DELETE /api/api-keys/:id    Revoke key
```

**POST body:**
```json
{ "name": "Zapier integration", "scope": "read_write" }
```
Validated with Zod. `scope` must be `'read' | 'read_write'`.

**POST response** (only time raw key is returned):
```json
{
  "data": {
    "id": "uuid",
    "name": "Zapier integration",
    "scope": "read_write",
    "prefix": "vnt_rw_a3f9",
    "key": "vnt_rw_a3f9c2d8e1b4f7...",
    "created_at": "ISO8601"
  },
  "error": null
}
```

**GET response:**
```json
{
  "data": [
    { "id": "uuid", "name": "...", "prefix": "vnt_rw_a3f9", "scope": "read_write", "last_used_at": "...", "created_at": "..." }
  ],
  "error": null
}
```

**DELETE:** 404 if key not found or belongs to different workspace.

---

## 3. Public API Middleware

### `apps/api/src/middleware/api-key-auth.ts`

**`requireApiKey` middleware:**
1. Read `Authorization: Bearer <token>` header → 401 if missing
2. SHA-256 hash token → query `api_keys WHERE key_hash = ?` → 401 if not found
3. Attach `req.workspace = { id: apiKey.workspace_id }` and `req.apiKey = { id, scope }`
4. Fire-and-forget: `UPDATE api_keys SET last_used_at = now() WHERE id = ?`
5. Call `next()`

**`requireScope(scope: 'read_write')` middleware factory:**
- Reads `req.apiKey.scope`
- If scope is `'read'` and route requires `'read_write'` → 403 `{ code: 'INSUFFICIENT_SCOPE' }`
- Otherwise call `next()`

---

## 4. Public API Routes (`/v1`)

### `apps/api/src/routes/v1/index.ts`

Assembles the `/v1` router. All routes require `requireApiKey`. Write routes additionally require `requireScope('read_write')`.

### CRM endpoints

**Contacts — `apps/api/src/routes/v1/contacts.ts`**
```
GET    /v1/contacts              List (paginated: page, per_page; filterable: status, owner_id)
GET    /v1/contacts/:id          Get one
POST   /v1/contacts              Create [read_write]
PATCH  /v1/contacts/:id          Update [read_write]
DELETE /v1/contacts/:id          Soft delete [read_write]
```

**Companies — `apps/api/src/routes/v1/companies.ts`**
```
GET    /v1/companies             List (paginated)
GET    /v1/companies/:id         Get one
POST   /v1/companies             Create [read_write]
PATCH  /v1/companies/:id         Update [read_write]
```

**Deals — `apps/api/src/routes/v1/deals.ts`**
```
GET    /v1/deals                 List (paginated; filterable: pipeline_id, stage_id)
GET    /v1/deals/:id             Get one
POST   /v1/deals                 Create [read_write]
PATCH  /v1/deals/:id             Update [read_write]
```

**Tasks — `apps/api/src/routes/v1/tasks.ts`**
```
GET    /v1/tasks                 List (paginated; filterable: status, assignee_id)
POST   /v1/tasks                 Create [read_write]
PATCH  /v1/tasks/:id             Update [read_write]
```

**Response shape:** Same `{ data: ..., error: null }` envelope as internal API. Pagination: `{ data: [...], total, page, per_page }`.

**Ownership on create:** `read_write` keys have no `user_id`. For fields requiring `owner_id` (deals, tasks), accept `owner_id` in body as a required UUID. Validate it belongs to the workspace.

### Infra endpoints (read-only, any scope)

**`apps/api/src/routes/v1/infra.ts`**
```
GET    /v1/servers               List servers
GET    /v1/servers/:id           Get one server
GET    /v1/alerts                List alerts (filterable: resolved, severity)
GET    /v1/websites              List websites
```

---

## 5. Web UI

### Settings tab — `apps/web/src/app/(dashboard)/settings/api-keys/page.tsx`

New "API Keys" tab in workspace settings. Renders:
- `<ApiKeyTable />` — existing keys list
- "Create API Key" button → opens `<CreateApiKeyModal />`

### `apps/web/src/components/settings/api-key-table.tsx`

Table columns: Name, Scope, Prefix, Last used, Created, Revoke button.

Revoke: DELETE request → optimistic removal from list.

### `apps/web/src/components/settings/create-api-key-modal.tsx`

Form fields: Name (text), Scope (read / read_write radio).

On submit: POST → receive raw key → show copy-once step with key in monospace input + "Copy" button. Warn: "This key won't be shown again." Close dismisses.

---

## 6. File Map

| File | Action |
|---|---|
| `packages/db/migrations/20240115_001_api_keys.ts` | Create |
| `packages/db/src/schema.ts` | Modify — add `ApiKeyTable` |
| `packages/types/src/index.ts` | Modify — add `ApiKey` type |
| `apps/api/src/middleware/api-key-auth.ts` | Create |
| `apps/api/src/routes/api-keys.ts` | Create — internal CRUD |
| `apps/api/src/routes/v1/contacts.ts` | Create |
| `apps/api/src/routes/v1/companies.ts` | Create |
| `apps/api/src/routes/v1/deals.ts` | Create |
| `apps/api/src/routes/v1/tasks.ts` | Create |
| `apps/api/src/routes/v1/infra.ts` | Create |
| `apps/api/src/routes/v1/index.ts` | Create — assembles `/v1` router |
| `apps/api/src/index.ts` | Modify — mount `/api/api-keys` + `/v1` |
| `apps/web/src/app/(dashboard)/settings/api-keys/page.tsx` | Create |
| `apps/web/src/components/settings/api-key-table.tsx` | Create |
| `apps/web/src/components/settings/create-api-key-modal.tsx` | Create |
