# Plugin SDK Design

**Date:** 2026-05-31  
**Scope:** `@vencore/plugin-types`, `@vencore/plugin-sdk` (backend + frontend + react entry points)  
**Status:** Approved

---

## Problem

The existing SDK scaffolding has three critical gaps:

1. **All return types are `unknown`** — `vencore.contacts.list()` returns `unknown[]`. Zero type safety for plugin developers.
2. **Backend ≠ Frontend** — backend has `deals`, `activity`, `storage`, `http`; frontend only has a bare `contacts` and `calendar`. Large surface inconsistency.
3. **Hardcoded optional namespaces** — `vencore.calendar.*` is a first-class SDK method even though Calendar is an optional plugin. If Calendar isn't installed, calls fail silently at runtime with no compile-time warning.

---

## Decisions

- SDK exposes data access for **existing modules only**: contacts, companies, deals (pipelines), tasks, activity, servers, websites, analytics. No calendar, alerts, deployments — those are plugins and wire their own bridge methods.
- Data access uses a **generic keyed API** (`vencore.list("contacts")`) with typed overloads per known resource. Unknown resources fall back to `unknown`.
- `createPlugin()` enforces permissions at **compile time** via conditional types.
- Plugins can declare **owned tables** in their manifest; the bridge enforces access boundaries.
- React hooks ship as a separate `@vencore/plugin-sdk/react` entry point.
- Errors throw by default; `vencore.safe.*` mirrors every method returning `PluginResult<T>`.

---

## Package Structure

```
@vencore/plugin-types    — shared types (domain models, bridge protocol, manifest)
@vencore/plugin-sdk      — backend SDK (runs in V8 isolate)
@vencore/plugin-sdk/frontend — frontend SDK (runs in iframe)
@vencore/plugin-sdk/react   — React hooks (frontend only)
```

---

## Section 1: `@vencore/plugin-types` — Domain Types

Adds concrete types that the SDK uses as return types. These are plugin-visible shapes — no internal DB fields (`workspace_id`, `password_hash`, etc.).

```typescript
export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: 'prospect' | 'customer' | 'cold' | 'churned';
  company_id: string | null;
  owner_id: string;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactInput {
  name: string;
  email: string;
  phone?: string;
  status?: Contact['status'];
  company_id?: string;
}

export interface ContactFilter {
  status?: Contact['status'];
  company_id?: string;
  limit?: number;
  offset?: number;
}

export interface Deal {
  id: string;
  name: string;
  value: number;
  stage_id: string | null;
  pipeline_id: string | null;
  probability: number;
  close_date: string | null;
  contact_id: string | null;
  company_id: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface DealInput {
  name: string;
  value?: number;
  stage_id?: string;
  pipeline_id?: string;
  probability?: number;
  close_date?: string;
  contact_id?: string;
  company_id?: string;
}

export interface DealFilter {
  stage_id?: string;
  pipeline_id?: string;
  contact_id?: string;
  owner_id?: string;
  limit?: number;
  offset?: number;
}

export interface Company {
  id: string;
  name: string;
  industry: string | null;
  location: string | null;
  employee_count: number | null;
  website: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyFilter {
  limit?: number;
  offset?: number;
}

export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'done';
  due_date: string | null;
  assignee_id: string;
  contact_id: string | null;
  deal_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskInput {
  title: string;
  due_date?: string;
  assignee_id?: string;
  contact_id?: string;
  deal_id?: string;
}

export interface TaskFilter {
  status?: Task['status'];
  assignee_id?: string;
  contact_id?: string;
  deal_id?: string;
  limit?: number;
}

export interface ActivityRecord {
  id: string;
  type: 'email' | 'call' | 'note' | 'meeting' | 'deal_change' | 'infra_alert';
  body: string | null;
  meta: Record<string, unknown> | null;
  user_id: string;
  contact_id: string | null;
  deal_id: string | null;
  created_at: string;
}

export interface ActivityInput {
  type: ActivityRecord['type'];
  body?: string;
  meta?: Record<string, unknown>;
  contact_id?: string;
  deal_id?: string;
}

export interface ActivityFilter {
  contact_id?: string;
  deal_id?: string;
  type?: ActivityRecord['type'];
  limit?: number;
}

export interface Server {
  id: string;
  name: string;
  region: string | null;
  ip_address: string | null;
  status: 'online' | 'degraded' | 'offline' | 'stopped';
  cpu_pct: number | null;
  mem_pct: number | null;
  disk_pct: number | null;
  uptime_seconds: number | null;
  last_ping_at: string | null;
}

export interface ServerFilter {
  status?: Server['status'];
  limit?: number;
}

export interface Website {
  id: string;
  url: string;
  label: string | null;
  status: 'online' | 'degraded' | 'offline';
  response_ms: number | null;
  uptime_pct_30d: number | null;
  ssl_expiry_date: string | null;
  last_checked_at: string | null;
}

export interface WebsiteFilter {
  status?: Website['status'];
  limit?: number;
}

// ── Context (frontend only) ────────────────────────────────────────────────────

export interface PluginContext {
  workspace_id: string;
  user_id: string;
  page: 'contact-detail' | 'deal-detail' | 'dashboard-widget' | 'full-page' | string;
  record_id: string | null;
  record_type: 'contact' | 'deal' | null;
}

// ── Error + Result wrapper ────────────────────────────────────────────────────

export interface PluginError {
  code: string;
  message: string;
}

export type PluginResult<T> =
  | { data: T; error: null }
  | { data: null; error: PluginError };

// ── HTTP bridge types ─────────────────────────────────────────────────────────

export interface HttpFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  ok: boolean;
}

// ── Plugin table schema (manifest) ───────────────────────────────────────────

export type PluginColumnType =
  | 'uuid' | 'text' | 'integer' | 'bigint' | 'boolean'
  | 'decimal' | 'timestamptz' | 'jsonb';

export interface PluginColumnDef {
  name: string;
  type: PluginColumnType;
  nullable?: boolean;
  primary?: boolean;
  unique?: boolean;
  default?: string;
}

export interface PluginIndexDef {
  columns: string[];
  unique?: boolean;
}

export interface PluginTableDef {
  name: string;
  columns: PluginColumnDef[];
  indexes?: PluginIndexDef[];
  drop_on_uninstall?: boolean;
}

export interface PluginMigration {
  version: string;
  up: string;
  down?: string;
}

// ── Resource type overloads (typed CRUD by resource string) ──────────────────

export type ResourceTypeMap = {
  contacts: { row: Contact; input: ContactInput; filter: ContactFilter };
  companies: { row: Company; input: Partial<Company>; filter: CompanyFilter };
  deals: { row: Deal; input: DealInput; filter: DealFilter };
  tasks: { row: Task; input: TaskInput; filter: TaskFilter };
  activity: { row: ActivityRecord; input: ActivityInput; filter: ActivityFilter };
  servers: { row: Server; input: never; filter: ServerFilter };
  websites: { row: Website; input: never; filter: WebsiteFilter };
};

export type KnownResource = keyof ResourceTypeMap;

export type ResourceRow<R extends string> =
  R extends KnownResource ? ResourceTypeMap[R]['row'] : unknown;

export type ResourceInput<R extends string> =
  R extends KnownResource ? ResourceTypeMap[R]['input'] : Record<string, unknown>;

export type ResourceFilter<R extends string> =
  R extends KnownResource ? ResourceTypeMap[R]['filter'] : Record<string, unknown>;
```

---

## Section 2: Generic CRUD API

Both backend and frontend SDKs expose the same data surface via generic keyed methods. TypeScript overloads provide concrete types for known resources; unknown resources fall back to `unknown`.

```typescript
// Data operations — both backend (isolate) and frontend (iframe)
vencore.list<R extends string>(resource: R, filter?: ResourceFilter<R>): Promise<ResourceRow<R>[]>
vencore.get<R extends string>(resource: R, id: string): Promise<ResourceRow<R>>
vencore.create<R extends string>(resource: R, data: ResourceInput<R>): Promise<ResourceRow<R>>
vencore.update<R extends string>(resource: R, id: string, data: Partial<ResourceInput<R>>): Promise<ResourceRow<R>>
vencore.delete(resource: string, id: string): Promise<void>

// Non-CRUD actions (acknowledge, resolve, stage moves, etc.)
vencore.action<T = unknown>(resource: string, action: string, payload?: unknown): Promise<T>

// Plugin-owned table CRUD
vencore.table(name: string): PluginTableClient

// Always-available — both backends
vencore.storage.get<T = unknown>(key: string): Promise<T | null>
vencore.storage.set(key: string, value: unknown): Promise<void>
vencore.storage.delete(key: string): Promise<void>

vencore.http.fetch(url: string, options?: HttpFetchOptions): Promise<HttpResponse>

// Frontend-only
vencore.getContext(): Promise<PluginContext>
vencore.navigate(path: string): void
vencore.modal.open(opts: { title: string; content?: string }): Promise<void>
vencore.modal.close(): Promise<void>
vencore.on(event: string, handler: (payload: unknown) => void): void

// Backend-only
vencore.on(event: PluginHookEvent, handler: (payload: unknown) => Promise<void> | void): void

// Safe wrapper — mirrors every method, returns PluginResult<T> instead of throwing
vencore.safe.list(...)    → Promise<PluginResult<ResourceRow<R>[]>>
vencore.safe.get(...)     → Promise<PluginResult<ResourceRow<R>>>
// ... etc.
```

### PluginTableClient

```typescript
interface PluginTableClient {
  list(opts?: { where?: Record<string, unknown>; orderBy?: string; order?: 'asc'|'desc'; limit?: number; offset?: number }): Promise<Record<string, unknown>[]>
  get(id: string): Promise<Record<string, unknown>>
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>
  update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>
  delete(id: string): Promise<void>
  upsert(data: Record<string, unknown>, opts: { on_conflict: string }): Promise<Record<string, unknown>>
  count(where?: Record<string, unknown>): Promise<number>
}
```

Bridge validates that `name` is in plugin's declared `tables` before executing. Cross-plugin or undeclared table access returns 403. Physical table name = `plugin_{slug_sanitized}_{name}` where slug sanitization replaces `.` and `-` with `_` and lowercases (e.g. `com.example.crm-enricher` → `plugin_com_example_crmenricher`). `workspace_id` column always injected and scoped automatically.

---

## Section 3: `createPlugin()` — Manifest Validation

Entry point function that type-checks at compile time: `setup()` receives a `vencore` constrained to methods covered by declared permissions. Calling `vencore.list("contacts")` without `contacts:read` in the manifest is a TypeScript error.

```typescript
// Backend
import { createPlugin } from '@vencore/plugin-sdk';

export default createPlugin({
  manifest: {
    id: 'com.example.crm-enricher',
    name: 'CRM Enricher',
    version: '1.0.0',
    description: 'Enriches contacts with deal counts.',
    permissions: ['contacts:read', 'deals:read', 'storage:read', 'storage:write'],
    tables: [
      {
        name: 'enrichment_cache',
        columns: [
          { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
          { name: 'contact_id', type: 'uuid', unique: true, nullable: false },
          { name: 'deal_count', type: 'integer', default: '0' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
        drop_on_uninstall: true,
      },
    ],
    migrations: [
      { version: '1.0.0', up: 'CREATE TABLE plugin_com_example_crmenricher_enrichment_cache ...' },
    ],
    hooks: ['contact.created', 'deal.created'],
  },
  setup(vencore) {
    // vencore typed: only contacts:read, deals:read, storage:* compile
    // vencore.list("tasks") → TypeScript error: tasks:read not declared
    vencore.on('contact.created', async (contact) => {
      const deals = await vencore.list('deals', { contact_id: contact.id });
      await vencore.table('enrichment_cache').upsert(
        { contact_id: contact.id, deal_count: deals.length },
        { on_conflict: 'contact_id' },
      );
    });
  },
});

// Frontend
import { createPlugin } from '@vencore/plugin-sdk/frontend';

export default createPlugin({
  manifest: { /* same manifest */ },
  async setup(vencore) {
    const ctx = await vencore.getContext();
    // render UI using ctx.record_id, vencore.list("contacts"), etc.
  },
});
```

The constrained `vencore` type is derived via:
```typescript
type PermittedVencore<P extends readonly PluginPermission[]> = {
  list: <R extends PermittedResource<P>>(resource: R, filter?: ...) => ...
  // ... narrowed per permission
}
```

Runtime re-checks permissions at the bridge level (defense in depth — permissions are not enforced only at compile time).

---

## Section 4: Widget Context Injection

When a plugin renders as a sidebar widget (inside contact-detail or deal-detail), the host injects context via `sdk:init` postMessage after the iframe loads:

```typescript
// Host sends immediately after iframe DOMContentLoaded
{ type: 'sdk:init', payload: { context: PluginContext } }

// Plugin calls:
const ctx = await vencore.getContext();
// ctx.page = 'contact-detail'
// ctx.record_id = 'abc-123'
// ctx.record_type = 'contact'
```

`getContext()` is a Promise that resolves when `sdk:init` is received. Times out after 3s with a clear error. Manifest declares widget placement: `"ui": { "widgets": ["contact-detail", "deal-detail"] }` — host only injects context for declared placement types.

---

## Section 5: React Hooks (`@vencore/plugin-sdk/react`)

Thin wrappers over the core SDK. Frontend iframe only.

```typescript
import {
  useList, useGet, useCreate, useUpdate, useDelete, useAction,
  usePluginContext, usePluginTable
} from '@vencore/plugin-sdk/react';

function ContactWidget() {
  const ctx = usePluginContext();
  // { record_id, record_type, page, workspace_id, user_id }

  const { data: contact, loading, error } = useGet('contacts', ctx.record_id!);
  const { data: deals } = useList('deals', { contact_id: ctx.record_id });
  const { mutate: createTask, loading: creating } = useCreate('tasks');
  const acknowledge = useAction('alerts', 'acknowledge');

  if (loading) return <div>Loading…</div>;
  return (
    <div>
      <h3>{contact?.name}</h3>
      <p>{deals?.length ?? 0} open deals</p>
      <button onClick={() => createTask({ title: 'Follow up', contact_id: ctx.record_id })}>
        Add task
      </button>
    </div>
  );
}

function GitHubWidget() {
  const ctx = usePluginContext();
  const { data: issues } = usePluginTable('issues', {
    where: { contact_id: ctx.record_id },
    orderBy: 'created_at',
    order: 'desc',
  });
  // ...
}
```

Hook contracts:
- `useList(resource, filter?, opts?)` — fetches on mount + filter change, returns `{ data, loading, error, refetch }`
- `useGet(resource, id)` — fetches single record, skips if `id` is null/undefined
- `useCreate(resource)` — returns `{ mutate(data), loading, error }`
- `useUpdate(resource)` — returns `{ mutate(id, data), loading, error }`
- `useDelete(resource)` — returns `{ mutate(id), loading, error }`
- `useAction(resource, action)` — returns `{ mutate(payload), loading, error }`
- `usePluginContext()` — returns `PluginContext`, suspends until `sdk:init` received
- `usePluginTable(tableName, query?)` — list from plugin-owned table

No caching layer — each component manages its own state. Plugin developers add React Query or SWR on top if they want caching.

---

## Plugin-Owned Table Lifecycle

| Event | Action |
|---|---|
| Install v1.0.0 | Run migration `1.0.0 up` — creates prefixed tables |
| Upgrade to v1.1.0 | Run migrations for versions > current_version in order |
| Downgrade | Run `down` migrations if present, else no-op |
| Uninstall | If `drop_on_uninstall: true` → drops tables. Default: retain data, log warning. |
| Re-install | Re-run any missing migrations only (idempotent check via `plugin_migration_log` table) |

Migration log table: `plugin_migration_log(id, plugin_slug, workspace_id, version, direction, applied_at)` — created once, shared across all plugins.

---

## Bridge Method Naming Convention

Standardized to `{namespace}.{verb}` pattern throughout. Bridge router updated to match:

| SDK call | Bridge method |
|---|---|
| `vencore.list("contacts")` | `contacts.list` |
| `vencore.get("contacts", id)` | `contacts.get` |
| `vencore.create("contacts", data)` | `contacts.create` |
| `vencore.update("contacts", id, data)` | `contacts.update` |
| `vencore.delete("contacts", id)` | `contacts.delete` |
| `vencore.action("deals", "move-stage", p)` | `deals.move-stage` |
| `vencore.table("issues").list(q)` | `table.list` (with table name in payload) |
| `vencore.storage.get(key)` | `storage.get` |
| `vencore.http.fetch(url, opts)` | `http.fetch` |

---

## Error Handling

Default: methods throw a `PluginError` (`{ code, message }`) on failure. Callers use `try/catch`.

Safe wrapper: `vencore.safe.*` mirrors the entire surface returning `PluginResult<T>` instead:

```typescript
const result = await vencore.safe.list('contacts');
if (result.error) {
  console.error(result.error.message);
} else {
  renderContacts(result.data);
}
```

React hooks always return `{ data, loading, error }` — error is `PluginError | null`. No throwing from hooks.

---

## Packages Affected

| Package | Changes |
|---|---|
| `@vencore/plugin-types` | Add domain types, ResourceTypeMap, PluginContext, PluginResult, table schema types |
| `@vencore/plugin-sdk` (backend) | Rewrite index.ts with generic API, createPlugin(), PermittedVencore type |
| `@vencore/plugin-sdk/frontend` | Rewrite frontend.ts with parity + getContext(), sdk:init handler |
| `@vencore/plugin-sdk/react` | New entry point: hooks |
| `vencore-runtime` | PluginTableClient bridge impl, migration runner |
| `Vencore API` (bridge-router) | Standardize method names, add table.* dispatch |

---

## Out of Scope

- Dev server / mock bridge (Phase 2 of SDK work)
- Plugin OAuth flow (`sdk:oauth.start`)
- Plugin-to-plugin communication
- Analytics namespace (read-only aggregate data — deferred)
- `vencore.realtime.*` subscriptions (SSE/WebSocket from plugins)
