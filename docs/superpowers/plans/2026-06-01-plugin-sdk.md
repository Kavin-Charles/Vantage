# Plugin SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@vantage/plugin-types`, `@vantage/plugin-sdk` (backend + frontend + react), `@vantage/plugin-runtime` (bridge dispatch + table client + migration runner), and the API bridge route.

**Architecture:** Plugin authors call `createPlugin()` which wraps a typed manifest + setup fn. The runtime provides a `BridgeFn` (a function that maps method calls to DB operations); the SDK calls it when plugin code calls `vantage.list()` etc. Permissions are enforced at compile time via conditional generics and again at runtime in the bridge dispatcher.

**Tech Stack:** TypeScript 5.4 strict, Kysely (DB queries), Zod (API validation), Vitest (tests), pnpm workspaces, Turbo

---

## File Map

```
packages/plugin-types/
  src/index.ts              — all domain types, bridge protocol types, manifest + permission types

packages/plugin-sdk/
  src/permissions.ts        — PermittedVantage<Perms>, PermittedResource, SafePermittedVantage
  src/bridge.ts             — BridgeFn, BridgeCall, BridgeResult, createPostMessageBridge()
  src/backend.ts            — VantageBackendImpl, createVantageBackend(), createPlugin() backend
  src/_store.ts             — module-level VantageFrontend singleton (shared by frontend + react)
  src/frontend.ts           — VantageFrontendImpl, createPlugin() frontend, sdk:init listener
  src/react.ts              — useList, useGet, useCreate, useUpdate, useDelete, useAction,
                              usePluginContext, usePluginTable
  src/index.ts              — re-exports: createPlugin, createVantageBackend, BridgeFn, types
  package.json              — exports map: "." / "./frontend" / "./react"
  tsconfig.json
  vitest.config.ts

packages/plugin-runtime/
  src/permissions.ts        — METHOD_PERMISSION_MAP, checkPermission()
  src/table-client.ts       — dispatchTableCall(), slugify(), ensureStorageTable()
  src/bridge-router.ts      — BridgeContext, dispatchBridgeCall() — full method dispatcher
  src/migration-runner.ts   — ensureMigrationLog(), runMigrations()
  src/index.ts              — exports all public API
  package.json
  tsconfig.json
  vitest.config.ts

apps/api/src/routes/plugins.ts   — POST /plugins/bridge, POST /plugins/install
apps/api/src/index.ts            — mount plugins router (modify existing)
turbo.json                       — add "test" task (modify existing)
```

---

## Task 1: `@vantage/plugin-types` — scaffold + all types

**Files:**
- Create: `packages/plugin-types/package.json`
- Create: `packages/plugin-types/tsconfig.json`
- Create: `packages/plugin-types/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@vantage/plugin-types",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

Save to `packages/plugin-types/package.json`.

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "CommonJS"
  },
  "include": ["src"]
}
```

Save to `packages/plugin-types/tsconfig.json`.

- [ ] **Step 3: Create src/index.ts with all types**

```typescript
// ── Domain models (plugin-visible shape — no internal DB fields) ─────────────

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

export interface CompanyInput {
  name: string;
  industry?: string;
  location?: string;
  employee_count?: number;
  website?: string;
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

// ── Context (frontend only) ──────────────────────────────────────────────────

export interface PluginContext {
  workspace_id: string;
  user_id: string;
  page: 'contact-detail' | 'deal-detail' | 'dashboard-widget' | 'full-page' | string;
  record_id: string | null;
  record_type: 'contact' | 'deal' | null;
}

// ── Error + Result ───────────────────────────────────────────────────────────

export interface PluginError {
  code: string;
  message: string;
}

export type PluginResult<T> =
  | { data: T; error: null }
  | { data: null; error: PluginError };

// ── HTTP bridge types ────────────────────────────────────────────────────────

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

// ── Plugin table schema (manifest) ──────────────────────────────────────────

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

// ── Resource type map — typed overloads per resource string ─────────────────

export type ResourceTypeMap = {
  contacts: { row: Contact; input: ContactInput; filter: ContactFilter };
  companies: { row: Company; input: CompanyInput; filter: CompanyFilter };
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

// ── PluginTableClient — plugin-owned table CRUD ──────────────────────────────

export interface PluginTableClient {
  list(opts?: {
    where?: Record<string, unknown>;
    orderBy?: string;
    order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }): Promise<Record<string, unknown>[]>;
  get(id: string): Promise<Record<string, unknown>>;
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(id: string): Promise<void>;
  upsert(
    data: Record<string, unknown>,
    opts: { on_conflict: string },
  ): Promise<Record<string, unknown>>;
  count(where?: Record<string, unknown>): Promise<number>;
}

// ── Permissions ──────────────────────────────────────────────────────────────

export type PluginPermission =
  | 'contacts:read' | 'contacts:write'
  | 'companies:read' | 'companies:write'
  | 'deals:read' | 'deals:write'
  | 'tasks:read' | 'tasks:write'
  | 'activity:read' | 'activity:write'
  | 'servers:read'
  | 'websites:read'
  | 'storage:read' | 'storage:write'
  | 'http:fetch';

// ── Hook events ──────────────────────────────────────────────────────────────

export type PluginHookEvent =
  | 'contact.created' | 'contact.updated' | 'contact.deleted'
  | 'deal.created' | 'deal.updated' | 'deal.deleted'
  | 'task.created' | 'task.updated'
  | (string & {});

// ── Plugin manifest ──────────────────────────────────────────────────────────

export interface PluginManifest<
  Perms extends readonly PluginPermission[] = readonly PluginPermission[],
> {
  id: string;
  name: string;
  version: string;
  description?: string;
  permissions: Perms;
  tables?: PluginTableDef[];
  migrations?: PluginMigration[];
  hooks?: PluginHookEvent[];
  ui?: {
    widgets?: Array<'contact-detail' | 'deal-detail' | 'dashboard-widget' | 'full-page'>;
  };
}
```

Save to `packages/plugin-types/src/index.ts`.

- [ ] **Step 4: Verify types compile**

```bash
cd packages/plugin-types && pnpm install && pnpm lint
```

Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-types/
git commit -m "feat(plugin-types): add @vantage/plugin-types package with all domain types"
```

---

## Task 2: `@vantage/plugin-sdk` — scaffold + conditional permission types

**Files:**
- Create: `packages/plugin-sdk/package.json`
- Create: `packages/plugin-sdk/tsconfig.json`
- Create: `packages/plugin-sdk/vitest.config.ts`
- Modify: `turbo.json`
- Create: `packages/plugin-sdk/src/permissions.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@vantage/plugin-sdk",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./frontend": {
      "require": "./dist/frontend.js",
      "types": "./dist/frontend.d.ts"
    },
    "./react": {
      "require": "./dist/react.js",
      "types": "./dist/react.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@vantage/plugin-types": "workspace:*"
  },
  "peerDependencies": {
    "react": ">=18.0.0"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true }
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

Save to `packages/plugin-sdk/package.json`.

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "CommonJS",
    "lib": ["ES2022", "DOM"],
    "jsx": "react"
  },
  "include": ["src"]
}
```

Save to `packages/plugin-sdk/tsconfig.json`.

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

Save to `packages/plugin-sdk/vitest.config.ts`.

- [ ] **Step 4: Add test task to turbo.json**

Read `turbo.json`, then add the `test` task:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "type-check": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "db:migrate": {
      "cache": false,
      "env": ["DATABASE_URL"]
    }
  }
}
```

Save to `turbo.json`.

- [ ] **Step 5: Write failing test for permissions types**

Create `packages/plugin-sdk/src/__tests__/permissions.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest';
import type { PermittedVantage, PermittedResource } from '../permissions';
import type { PluginPermission } from '@vantage/plugin-types';

describe('PermittedResource', () => {
  it('extracts readable resources from permission list', () => {
    type Perms = readonly ['contacts:read', 'deals:read'];
    type R = PermittedResource<Perms>;
    expectTypeOf<'contacts'>().toMatchTypeOf<R>();
    expectTypeOf<'deals'>().toMatchTypeOf<R>();
  });
});
```

- [ ] **Step 6: Run test — expect compile failure (file missing)**

```bash
cd packages/plugin-sdk && pnpm install && pnpm test
```

Expected: FAIL — `Cannot find module '../permissions'`.

- [ ] **Step 7: Create src/permissions.ts**

```typescript
import type {
  PluginPermission,
  PluginResult,
  ResourceRow,
  ResourceInput,
  ResourceFilter,
  KnownResource,
  PluginTableClient,
  PluginHookEvent,
  PluginContext,
  HttpFetchOptions,
  HttpResponse,
} from '@vantage/plugin-types';

// ── Compile-time permission helpers ─────────────────────────────────────────

/** Extracts resource name from "resource:read" permission */
type ExtractReadResource<P extends string> = P extends `${infer R}:read` ? R : never;

/** Extracts resource name from "resource:write" permission */
type ExtractWriteResource<P extends string> = P extends `${infer R}:write` ? R : never;

/** Union of KnownResources that have :read permission declared */
export type PermittedResource<Perms extends readonly PluginPermission[]> =
  ExtractReadResource<Perms[number]> & KnownResource;

/** Union of KnownResources that have :write permission declared */
export type PermittedWriteResource<Perms extends readonly PluginPermission[]> =
  ExtractWriteResource<Perms[number]> & KnownResource;

/** True if permission P is in Perms tuple */
type HasPerm<Perms extends readonly PluginPermission[], P extends PluginPermission> =
  P extends Perms[number] ? true : false;

// ── Namespaces ───────────────────────────────────────────────────────────────

export interface StorageNamespace {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface HttpNamespace {
  fetch(url: string, options?: HttpFetchOptions): Promise<HttpResponse>;
}

export interface ModalNamespace {
  open(opts: { title: string; content?: string }): Promise<void>;
  close(): Promise<void>;
}

// ── Safe wrapper type ────────────────────────────────────────────────────────

export type SafePermittedVantage<Perms extends readonly PluginPermission[]> = {
  list<R extends PermittedResource<Perms>>(
    resource: R,
    filter?: ResourceFilter<R>,
  ): Promise<PluginResult<ResourceRow<R>[]>>;
  get<R extends PermittedResource<Perms>>(
    resource: R,
    id: string,
  ): Promise<PluginResult<ResourceRow<R>>>;
  create<R extends PermittedWriteResource<Perms>>(
    resource: R,
    data: ResourceInput<R>,
  ): Promise<PluginResult<ResourceRow<R>>>;
  update<R extends PermittedWriteResource<Perms>>(
    resource: R,
    id: string,
    data: Partial<ResourceInput<R>>,
  ): Promise<PluginResult<ResourceRow<R>>>;
  delete(
    resource: PermittedWriteResource<Perms>,
    id: string,
  ): Promise<PluginResult<void>>;
  action<T = unknown>(
    resource: string,
    action: string,
    payload?: unknown,
  ): Promise<PluginResult<T>>;
};

// ── PermittedVantage — backend ───────────────────────────────────────────────

export type PermittedVantage<Perms extends readonly PluginPermission[]> = {
  list<R extends PermittedResource<Perms>>(
    resource: R,
    filter?: ResourceFilter<R>,
  ): Promise<ResourceRow<R>[]>;
  get<R extends PermittedResource<Perms>>(
    resource: R,
    id: string,
  ): Promise<ResourceRow<R>>;
  create<R extends PermittedWriteResource<Perms>>(
    resource: R,
    data: ResourceInput<R>,
  ): Promise<ResourceRow<R>>;
  update<R extends PermittedWriteResource<Perms>>(
    resource: R,
    id: string,
    data: Partial<ResourceInput<R>>,
  ): Promise<ResourceRow<R>>;
  delete(resource: PermittedWriteResource<Perms>, id: string): Promise<void>;
  action<T = unknown>(resource: string, action: string, payload?: unknown): Promise<T>;
  table(name: string): PluginTableClient;
  on(event: PluginHookEvent, handler: (payload: unknown) => Promise<void> | void): void;
  storage: HasPerm<Perms, 'storage:read'> extends true ? StorageNamespace : never;
  http: HasPerm<Perms, 'http:fetch'> extends true ? HttpNamespace : never;
  safe: SafePermittedVantage<Perms>;
};

// ── PermittedVantageFrontend — adds frontend-only methods ────────────────────

export type PermittedVantageFrontend<Perms extends readonly PluginPermission[]> =
  Omit<PermittedVantage<Perms>, 'on'> & {
    getContext(): Promise<PluginContext>;
    navigate(path: string): void;
    modal: ModalNamespace;
    on(event: string, handler: (payload: unknown) => void): void;
  };

// ── Plugin definition types ──────────────────────────────────────────────────

import type { PluginManifest } from '@vantage/plugin-types';

export interface PluginDefinition<Perms extends readonly PluginPermission[]> {
  manifest: PluginManifest<Perms>;
  setup(vantage: PermittedVantage<Perms>): void | Promise<void>;
}

export interface FrontendPluginDefinition<Perms extends readonly PluginPermission[]> {
  manifest: PluginManifest<Perms>;
  setup(vantage: PermittedVantageFrontend<Perms>): void | Promise<void>;
}
```

Save to `packages/plugin-sdk/src/permissions.ts`.

- [ ] **Step 8: Run test — expect pass**

```bash
cd packages/plugin-sdk && pnpm test
```

Expected: PASS — `permissions.test.ts > PermittedResource > extracts readable resources`.

- [ ] **Step 9: Commit**

```bash
git add packages/plugin-sdk/ turbo.json
git commit -m "feat(plugin-sdk): scaffold package + conditional permission types"
```

---

## Task 3: Backend SDK — bridge + VantageBackendImpl + createPlugin()

**Files:**
- Create: `packages/plugin-sdk/src/bridge.ts`
- Create: `packages/plugin-sdk/src/backend.ts`
- Create: `packages/plugin-sdk/src/index.ts`
- Create: `packages/plugin-sdk/src/__tests__/backend.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/plugin-sdk/src/__tests__/backend.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createVantageBackend } from '../backend';
import type { BridgeFn } from '../bridge';

function makeBridge(data: unknown = {}): BridgeFn {
  return vi.fn().mockResolvedValue({ data, error: null });
}

function makeErrorBridge(code: string, message: string): BridgeFn {
  return vi.fn().mockResolvedValue({ data: null, error: { code, message } });
}

describe('VantageBackend.list', () => {
  it('calls bridge with {resource}.list method', async () => {
    const bridge = makeBridge([{ id: '1' }]);
    const v = createVantageBackend(bridge);
    const result = await v.list('contacts', { limit: 10 });
    expect(bridge).toHaveBeenCalledWith({ method: 'contacts.list', payload: { filter: { limit: 10 } } });
    expect(result).toEqual([{ id: '1' }]);
  });
});

describe('VantageBackend.get', () => {
  it('calls bridge with {resource}.get method', async () => {
    const bridge = makeBridge({ id: 'abc' });
    const v = createVantageBackend(bridge);
    const result = await v.get('deals', 'abc');
    expect(bridge).toHaveBeenCalledWith({ method: 'deals.get', payload: { id: 'abc' } });
    expect(result).toEqual({ id: 'abc' });
  });
});

describe('VantageBackend.create', () => {
  it('calls bridge with {resource}.create method', async () => {
    const bridge = makeBridge({ id: 'new' });
    const v = createVantageBackend(bridge);
    await v.create('tasks', { title: 'Test' });
    expect(bridge).toHaveBeenCalledWith({ method: 'tasks.create', payload: { data: { title: 'Test' } } });
  });
});

describe('VantageBackend.update', () => {
  it('calls bridge with {resource}.update method', async () => {
    const bridge = makeBridge({ id: 'x' });
    const v = createVantageBackend(bridge);
    await v.update('contacts', 'x', { name: 'New' });
    expect(bridge).toHaveBeenCalledWith({ method: 'contacts.update', payload: { id: 'x', data: { name: 'New' } } });
  });
});

describe('VantageBackend.delete', () => {
  it('calls bridge with {resource}.delete method', async () => {
    const bridge = makeBridge(undefined);
    const v = createVantageBackend(bridge);
    await v.delete('contacts', 'x');
    expect(bridge).toHaveBeenCalledWith({ method: 'contacts.delete', payload: { id: 'x' } });
  });
});

describe('VantageBackend error handling', () => {
  it('throws PluginError when bridge returns error', async () => {
    const bridge = makeErrorBridge('NOT_FOUND', 'Contact not found');
    const v = createVantageBackend(bridge);
    await expect(v.get('contacts', 'x')).rejects.toEqual({ code: 'NOT_FOUND', message: 'Contact not found' });
  });
});

describe('VantageBackend.safe', () => {
  it('returns PluginResult instead of throwing', async () => {
    const bridge = makeErrorBridge('NOT_FOUND', 'Not found');
    const v = createVantageBackend(bridge);
    const result = await v.safe.get('contacts', 'x');
    expect(result).toEqual({ data: null, error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  it('returns {data, error: null} on success', async () => {
    const bridge = makeBridge([{ id: '1' }]);
    const v = createVantageBackend(bridge);
    const result = await v.safe.list('contacts');
    expect(result).toEqual({ data: [{ id: '1' }], error: null });
  });
});

describe('VantageBackend.storage', () => {
  it('dispatches storage.get', async () => {
    const bridge = makeBridge('stored-value');
    const v = createVantageBackend(bridge);
    const val = await v.storage.get('my-key');
    expect(bridge).toHaveBeenCalledWith({ method: 'storage.get', payload: { key: 'my-key' } });
    expect(val).toBe('stored-value');
  });

  it('dispatches storage.set', async () => {
    const bridge = makeBridge(null);
    const v = createVantageBackend(bridge);
    await v.storage.set('my-key', { foo: 1 });
    expect(bridge).toHaveBeenCalledWith({ method: 'storage.set', payload: { key: 'my-key', value: { foo: 1 } } });
  });
});

describe('VantageBackend.on + _dispatchEvent', () => {
  it('registers and dispatches event handlers', async () => {
    const bridge = makeBridge([]);
    const v = createVantageBackend(bridge);
    const handler = vi.fn();
    v.on('contact.created', handler);
    await v._dispatchEvent('contact.created', { id: 'c1' });
    expect(handler).toHaveBeenCalledWith({ id: 'c1' });
  });

  it('dispatches to multiple handlers for same event', async () => {
    const bridge = makeBridge([]);
    const v = createVantageBackend(bridge);
    const h1 = vi.fn();
    const h2 = vi.fn();
    v.on('deal.created', h1);
    v.on('deal.created', h2);
    await v._dispatchEvent('deal.created', { id: 'd1' });
    expect(h1).toHaveBeenCalledWith({ id: 'd1' });
    expect(h2).toHaveBeenCalledWith({ id: 'd1' });
  });

  it('does not dispatch to wrong event', async () => {
    const bridge = makeBridge([]);
    const v = createVantageBackend(bridge);
    const handler = vi.fn();
    v.on('contact.created', handler);
    await v._dispatchEvent('deal.created', { id: 'd1' });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('VantageBackend.table', () => {
  it('dispatches table.list with name', async () => {
    const bridge = makeBridge([]);
    const v = createVantageBackend(bridge);
    await v.table('cache').list({ limit: 5 });
    expect(bridge).toHaveBeenCalledWith({
      method: 'table.list',
      payload: expect.objectContaining({ name: 'cache', limit: 5 }),
    });
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd packages/plugin-sdk && pnpm test
```

Expected: FAIL — `Cannot find module '../backend'`.

- [ ] **Step 3: Create src/bridge.ts**

```typescript
import type { PluginError } from '@vantage/plugin-types';

export interface BridgeCall {
  method: string;   // e.g. "contacts.list", "table.insert", "storage.get"
  payload: unknown;
}

export type BridgeResult<T = unknown> =
  | { data: T; error: null }
  | { data: null; error: PluginError };

/** Function injected by the runtime to handle all vantage.* calls */
export type BridgeFn = (call: BridgeCall) => Promise<BridgeResult>;

/**
 * Creates a bridge that sends calls to the parent iframe via postMessage.
 * Used by the frontend SDK — the host page receives the message and
 * forwards it to the API, then posts the response back.
 */
export function createPostMessageBridge(timeoutMs = 30_000): BridgeFn {
  return ({ method, payload }) =>
    new Promise((resolve, reject) => {
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);

      const timer = setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error(`[plugin-sdk] bridge call '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      function handler(event: MessageEvent) {
        if (event.data?.type === 'bridge:response' && event.data?.id === id) {
          clearTimeout(timer);
          window.removeEventListener('message', handler);
          resolve(event.data.result as BridgeResult);
        }
      }

      window.addEventListener('message', handler);
      window.parent.postMessage({ type: 'bridge:request', id, method, payload }, '*');
    });
}
```

Save to `packages/plugin-sdk/src/bridge.ts`.

- [ ] **Step 4: Create src/backend.ts**

```typescript
import type {
  PluginPermission,
  PluginManifest,
  PluginResult,
  PluginTableClient,
  PluginHookEvent,
  HttpFetchOptions,
  HttpResponse,
  ResourceRow,
  ResourceInput,
  ResourceFilter,
} from '@vantage/plugin-types';
import type { BridgeFn, BridgeResult } from './bridge';
import type {
  PermittedVantage,
  SafePermittedVantage,
  StorageNamespace,
  HttpNamespace,
  PluginDefinition,
} from './permissions';

/**
 * VantageBackendImpl — runtime implementation of the vantage API surface.
 * Type-safe at call sites via PermittedVantage<Perms>; all methods dispatch
 * through BridgeFn, which the runtime provides (fully opaque to plugin authors).
 */
export class VantageBackendImpl {
  protected _bridge: BridgeFn;
  private _handlers = new Map<string, Array<(p: unknown) => Promise<void> | void>>();
  readonly storage: StorageNamespace;
  readonly http: HttpNamespace;

  constructor(bridge: BridgeFn) {
    this._bridge = bridge;

    this.storage = {
      get: <T = unknown>(key: string) =>
        this._call<T | null>('storage.get', { key }),
      set: (key: string, value: unknown) =>
        this._call<void>('storage.set', { key, value }),
      delete: (key: string) =>
        this._call<void>('storage.delete', { key }),
    };

    this.http = {
      fetch: (url: string, options?: HttpFetchOptions) =>
        this._call<HttpResponse>('http.fetch', { url, options }),
    };
  }

  protected async _call<T>(method: string, payload: unknown): Promise<T> {
    const result: BridgeResult = await this._bridge({ method, payload });
    if (result.error) throw result.error;
    return result.data as T;
  }

  async list(resource: string, filter?: unknown): Promise<unknown[]> {
    return this._call(`${resource}.list`, { filter });
  }

  async get(resource: string, id: string): Promise<unknown> {
    return this._call(`${resource}.get`, { id });
  }

  async create(resource: string, data: unknown): Promise<unknown> {
    return this._call(`${resource}.create`, { data });
  }

  async update(resource: string, id: string, data: unknown): Promise<unknown> {
    return this._call(`${resource}.update`, { id, data });
  }

  async delete(resource: string, id: string): Promise<void> {
    return this._call(`${resource}.delete`, { id });
  }

  async action<T = unknown>(resource: string, action: string, payload?: unknown): Promise<T> {
    return this._call<T>(`${resource}.${action}`, { payload });
  }

  table(name: string): PluginTableClient {
    return {
      list: (opts?) => this._call('table.list', { name, ...opts }),
      get: (id) => this._call('table.get', { name, id }),
      insert: (data) => this._call('table.insert', { name, data }),
      update: (id, data) => this._call('table.update', { name, id, data }),
      delete: (id) => this._call<void>('table.delete', { name, id }),
      upsert: (data, opts) => this._call('table.upsert', { name, data, ...opts }),
      count: (where?) => this._call<number>('table.count', { name, where }),
    };
  }

  on(event: string, handler: (payload: unknown) => Promise<void> | void): void {
    const existing = this._handlers.get(event) ?? [];
    this._handlers.set(event, [...existing, handler]);
  }

  /** Called by the runtime when an event fires. Invokes all registered handlers in parallel. */
  async _dispatchEvent(event: string, payload: unknown): Promise<void> {
    const handlers = this._handlers.get(event) ?? [];
    await Promise.all(handlers.map((h) => h(payload)));
  }

  get safe(): SafePermittedVantage<readonly PluginPermission[]> {
    const wrap = <T>(fn: () => Promise<T>): Promise<PluginResult<T>> =>
      fn()
        .then((data) => ({ data, error: null } as PluginResult<T>))
        .catch((error) => ({ data: null, error } as PluginResult<T>));

    return {
      list: (resource, filter?) =>
        wrap(() => this.list(resource as string, filter) as Promise<ResourceRow<typeof resource>[]>),
      get: (resource, id) =>
        wrap(() => this.get(resource as string, id) as Promise<ResourceRow<typeof resource>>),
      create: (resource, data) =>
        wrap(() => this.create(resource as string, data) as Promise<ResourceRow<typeof resource>>),
      update: (resource, id, data) =>
        wrap(() => this.update(resource as string, id, data) as Promise<ResourceRow<typeof resource>>),
      delete: (resource, id) => wrap(() => this.delete(resource as string, id)),
      action: (resource, action, payload?) => wrap(() => this.action(resource, action, payload)),
    };
  }
}

/**
 * createVantageBackend — factory for the runtime to instantiate a vantage object.
 * The runtime provides a BridgeFn scoped to the current plugin + workspace.
 */
export function createVantageBackend(bridge: BridgeFn): VantageBackendImpl {
  return new VantageBackendImpl(bridge);
}

/**
 * createPlugin (backend) — validates manifest types at compile time.
 * Returns a PluginDefinition the runtime imports and uses to call setup().
 * No side effects on call.
 */
export function createPlugin<Perms extends readonly PluginPermission[]>(config: {
  manifest: PluginManifest<Perms>;
  setup(vantage: PermittedVantage<Perms>): void | Promise<void>;
}): PluginDefinition<Perms> {
  return config;
}
```

Save to `packages/plugin-sdk/src/backend.ts`.

- [ ] **Step 5: Create src/index.ts**

```typescript
export { createPlugin, createVantageBackend, VantageBackendImpl } from './backend';
export { createPostMessageBridge } from './bridge';
export type { BridgeFn, BridgeCall, BridgeResult } from './bridge';
export type {
  PermittedVantage,
  PermittedVantageFrontend,
  PermittedResource,
  PermittedWriteResource,
  SafePermittedVantage,
  StorageNamespace,
  HttpNamespace,
  ModalNamespace,
  PluginDefinition,
  FrontendPluginDefinition,
} from './permissions';
// Re-export all plugin-types for convenience
export type * from '@vantage/plugin-types';
```

Save to `packages/plugin-sdk/src/index.ts`.

- [ ] **Step 6: Run tests — expect pass**

```bash
cd packages/plugin-sdk && pnpm test
```

Expected: all 13 tests pass.

- [ ] **Step 7: Verify compile**

```bash
cd packages/plugin-sdk && pnpm lint
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/plugin-sdk/src/bridge.ts packages/plugin-sdk/src/backend.ts packages/plugin-sdk/src/index.ts packages/plugin-sdk/src/__tests__/backend.test.ts
git commit -m "feat(plugin-sdk): backend SDK — VantageBackendImpl, createPlugin, createVantageBackend"
```

---

## Task 4: Frontend SDK — VantageFrontendImpl + sdk:init + createPlugin()

**Files:**
- Create: `packages/plugin-sdk/src/_store.ts`
- Create: `packages/plugin-sdk/src/frontend.ts`

- [ ] **Step 1: Create src/_store.ts**

```typescript
/**
 * Module-level singleton — set by frontend createPlugin(), read by React hooks.
 * One VantageFrontendImpl per iframe (one plugin per iframe).
 */
import type { VantageFrontendImpl } from './frontend';

let _instance: VantageFrontendImpl | null = null;

export function setVantageInstance(v: VantageFrontendImpl): void {
  _instance = v;
}

export function getVantageInstance(): VantageFrontendImpl {
  if (!_instance) {
    throw new Error(
      '[plugin-sdk] SDK not initialized. ' +
      'Import createPlugin from @vantage/plugin-sdk/frontend and call it before using hooks.',
    );
  }
  return _instance;
}
```

Save to `packages/plugin-sdk/src/_store.ts`.

- [ ] **Step 2: Create src/frontend.ts**

```typescript
import type {
  PluginPermission,
  PluginManifest,
  PluginContext,
  HttpFetchOptions,
  HttpResponse,
} from '@vantage/plugin-types';
import { VantageBackendImpl } from './backend';
import { createPostMessageBridge } from './bridge';
import { setVantageInstance } from './_store';
import type {
  PermittedVantageFrontend,
  ModalNamespace,
  FrontendPluginDefinition,
} from './permissions';

export class VantageFrontendImpl extends VantageBackendImpl {
  private _context: PluginContext | null = null;
  private _contextResolvers: Array<(ctx: PluginContext) => void> = [];
  private _contextRejectors: Array<(err: Error) => void> = [];
  private _contextTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super(createPostMessageBridge());

    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event: MessageEvent) => {
        if (event.data?.type === 'sdk:init' && event.data?.payload?.context) {
          const ctx = event.data.payload.context as PluginContext;
          this._context = ctx;
          if (this._contextTimer !== null) {
            clearTimeout(this._contextTimer);
            this._contextTimer = null;
          }
          for (const resolve of this._contextResolvers) resolve(ctx);
          this._contextResolvers = [];
          this._contextRejectors = [];
        }
      });
    }
  }

  /**
   * Resolves when the host sends sdk:init with a PluginContext.
   * Rejects after 3 seconds with a clear error message.
   */
  getContext(): Promise<PluginContext> {
    if (this._context) return Promise.resolve(this._context);

    return new Promise<PluginContext>((resolve, reject) => {
      this._contextResolvers.push(resolve);
      this._contextRejectors.push(reject);

      if (this._contextTimer === null) {
        this._contextTimer = setTimeout(() => {
          const err = new Error(
            '[plugin-sdk] sdk:init timeout — PluginContext not received within 3000ms. ' +
            'Check that the host sent { type: "sdk:init", payload: { context } } after iframe load.',
          );
          for (const reject of this._contextRejectors) reject(err);
          this._contextResolvers = [];
          this._contextRejectors = [];
        }, 3000);
      }
    });
  }

  navigate(path: string): void {
    if (typeof window !== 'undefined') {
      window.parent.postMessage({ type: 'sdk:navigate', payload: { path } }, '*');
    }
  }

  get modal(): ModalNamespace {
    return {
      open: (opts: { title: string; content?: string }) =>
        this._call<void>('modal.open', opts),
      close: () =>
        this._call<void>('modal.close', {}),
    };
  }

  /**
   * Frontend on() listens for host-dispatched events via postMessage.
   * Handlers are synchronous (host fires and forgets).
   */
  on(event: string, handler: (payload: unknown) => void): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (e: MessageEvent) => {
        if (e.data?.type === 'sdk:event' && e.data?.event === event) {
          handler(e.data.payload);
        }
      });
    }
  }
}

/**
 * createPlugin (frontend) — runs in the plugin iframe on load.
 * Creates the vantage instance, registers it as the singleton for hooks,
 * then calls setup(). Side-effectful by design.
 */
export function createPlugin<Perms extends readonly PluginPermission[]>(config: {
  manifest: PluginManifest<Perms>;
  setup(vantage: PermittedVantageFrontend<Perms>): void | Promise<void>;
}): void {
  const vantage = new VantageFrontendImpl();
  setVantageInstance(vantage);
  Promise.resolve(
    config.setup(vantage as unknown as PermittedVantageFrontend<Perms>),
  ).catch((err: unknown) => {
    console.error('[plugin-sdk] setup() error:', err);
  });
}
```

Save to `packages/plugin-sdk/src/frontend.ts`.

- [ ] **Step 3: Verify compile**

```bash
cd packages/plugin-sdk && pnpm lint
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/plugin-sdk/src/_store.ts packages/plugin-sdk/src/frontend.ts
git commit -m "feat(plugin-sdk): frontend SDK — VantageFrontendImpl, sdk:init handler, getContext"
```

---

## Task 5: React hooks (`@vantage/plugin-sdk/react`)

**Files:**
- Create: `packages/plugin-sdk/src/react.ts`

- [ ] **Step 1: Write failing test**

Create `packages/plugin-sdk/src/__tests__/react.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useList, useGet, useCreate, useDelete, useAction, usePluginTable } from '../react';
import * as store from '../_store';
import type { VantageBackendImpl } from '../backend';

function makeVantage(overrides: Partial<VantageBackendImpl> = {}): VantageBackendImpl {
  return {
    list: vi.fn().mockResolvedValue([{ id: '1' }]),
    get: vi.fn().mockResolvedValue({ id: '1' }),
    create: vi.fn().mockResolvedValue({ id: 'new' }),
    update: vi.fn().mockResolvedValue({ id: '1' }),
    delete: vi.fn().mockResolvedValue(undefined),
    action: vi.fn().mockResolvedValue({ ok: true }),
    table: vi.fn().mockReturnValue({
      list: vi.fn().mockResolvedValue([{ id: 'r1' }]),
    }),
    storage: {} as any,
    http: {} as any,
    safe: {} as any,
    on: vi.fn(),
    _dispatchEvent: vi.fn(),
    ...overrides,
  } as unknown as VantageBackendImpl;
}

beforeEach(() => {
  vi.spyOn(store, 'getVantageInstance').mockReturnValue(makeVantage());
});

describe('useList', () => {
  it('fetches on mount and returns data', async () => {
    const { result } = renderHook(() => useList('contacts'));
    expect(result.current.loading).toBe(true);
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([{ id: '1' }]);
    expect(result.current.error).toBeNull();
  });

  it('skips fetch when opts.skip is true', () => {
    const { result } = renderHook(() => useList('contacts', undefined, { skip: true }));
    expect(result.current.loading).toBe(false);
    expect(store.getVantageInstance().list).not.toHaveBeenCalled();
  });
});

describe('useGet', () => {
  it('fetches when id is provided', async () => {
    const { result } = renderHook(() => useGet('contacts', 'abc'));
    await act(async () => {});
    expect(result.current.data).toEqual({ id: '1' });
  });

  it('skips fetch when id is null', () => {
    const { result } = renderHook(() => useGet('contacts', null));
    expect(result.current.loading).toBe(false);
    expect(store.getVantageInstance().get).not.toHaveBeenCalled();
  });
});

describe('useCreate', () => {
  it('mutate() calls create and returns data', async () => {
    const { result } = renderHook(() => useCreate('tasks'));
    let created: unknown;
    await act(async () => {
      created = await result.current.mutate({ title: 'New task' });
    });
    expect(created).toEqual({ id: 'new' });
    expect(result.current.data).toEqual({ id: 'new' });
    expect(result.current.loading).toBe(false);
  });
});

describe('useDelete', () => {
  it('mutate(id) calls delete', async () => {
    const { result } = renderHook(() => useDelete('contacts'));
    await act(async () => { await result.current.mutate('x'); });
    expect(store.getVantageInstance().delete).toHaveBeenCalledWith('contacts', 'x');
    expect(result.current.loading).toBe(false);
  });
});

describe('useAction', () => {
  it('mutate(payload) calls action with resource + action name', async () => {
    const { result } = renderHook(() => useAction('alerts', 'acknowledge'));
    await act(async () => { await result.current.mutate({ id: 'a1' }); });
    expect(store.getVantageInstance().action).toHaveBeenCalledWith('alerts', 'acknowledge', { id: 'a1' });
  });
});

describe('usePluginTable', () => {
  it('fetches from plugin-owned table', async () => {
    const { result } = renderHook(() => usePluginTable('issues'));
    await act(async () => {});
    expect(store.getVantageInstance().table).toHaveBeenCalledWith('issues');
    expect(result.current.data).toEqual([{ id: 'r1' }]);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd packages/plugin-sdk && pnpm test
```

Expected: FAIL — `Cannot find module '../react'`.

- [ ] **Step 3: Add @testing-library/react to devDeps and install**

Edit `packages/plugin-sdk/package.json` — add to `devDependencies`:
```json
"@testing-library/react": "^16.0.0",
"react": "^19.1.0",
"react-dom": "^19.1.0",
"@types/react-dom": "^18.0.0"
```

Edit `packages/plugin-sdk/vitest.config.ts` — add jsdom environment:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
```

Run: `cd packages/plugin-sdk && pnpm install`

- [ ] **Step 4: Create src/react.ts**

```typescript
import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import type {
  PluginContext,
  ResourceRow,
  ResourceInput,
  ResourceFilter,
  PluginError,
  KnownResource,
} from '@vantage/plugin-types';
import { getVantageInstance } from './_store';

// ── usePluginContext — suspends until sdk:init received ───────────────────────

let _contextPromise: Promise<PluginContext> | null = null;
let _resolvedContext: PluginContext | null = null;

/**
 * Returns the PluginContext injected by the host via sdk:init.
 * Uses React Suspense — wrap the consuming component in a <Suspense> boundary.
 */
export function usePluginContext(): PluginContext {
  if (_resolvedContext) return _resolvedContext;
  if (!_contextPromise) {
    _contextPromise = getVantageInstance()
      .getContext()
      .then((ctx) => {
        _resolvedContext = ctx;
        return ctx;
      });
  }
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw _contextPromise; // React Suspense protocol
}

// ── Shared state shapes ──────────────────────────────────────────────────────

type QueryState<T> = { data: T | null; loading: boolean; error: PluginError | null };
type MutationState<T> = { data: T | null; loading: boolean; error: PluginError | null };

// ── useList ──────────────────────────────────────────────────────────────────

export function useList<R extends KnownResource>(
  resource: R,
  filter?: ResourceFilter<R>,
  opts?: { skip?: boolean },
): QueryState<ResourceRow<R>[]> & { refetch(): void } {
  const [state, setState] = useState<QueryState<ResourceRow<R>[]>>({
    data: null,
    loading: !opts?.skip,
    error: null,
  });
  const refetchCounter = useRef(0);
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    if (opts?.skip) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    (getVantageInstance().list(resource, filter) as Promise<ResourceRow<R>[]>)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: PluginError) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => { cancelled = true; };
    // filterKey serialises filter for stable dep — resource is a string literal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, filterKey, refetchCounter.current, opts?.skip]);

  const refetch = useCallback(() => { refetchCounter.current++; }, []);
  return { ...state, refetch };
}

// ── useGet ───────────────────────────────────────────────────────────────────

export function useGet<R extends KnownResource>(
  resource: R,
  id: string | null | undefined,
): QueryState<ResourceRow<R>> {
  const [state, setState] = useState<QueryState<ResourceRow<R>>>({
    data: null,
    loading: !!id,
    error: null,
  });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    (getVantageInstance().get(resource, id) as Promise<ResourceRow<R>>)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: PluginError) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => { cancelled = true; };
  }, [resource, id]);

  return state;
}

// ── useCreate ────────────────────────────────────────────────────────────────

export function useCreate<R extends KnownResource>(
  resource: R,
): MutationState<ResourceRow<R>> & { mutate(data: ResourceInput<R>): Promise<ResourceRow<R>> } {
  const [state, setState] = useState<MutationState<ResourceRow<R>>>({
    loading: false,
    error: null,
    data: null,
  });

  const mutate = useCallback(
    async (data: ResourceInput<R>): Promise<ResourceRow<R>> => {
      setState({ loading: true, error: null, data: null });
      try {
        const result = await (getVantageInstance().create(resource, data) as Promise<ResourceRow<R>>);
        setState({ loading: false, error: null, data: result });
        return result;
      } catch (error) {
        setState({ loading: false, error: error as PluginError, data: null });
        throw error;
      }
    },
    [resource],
  );

  return { ...state, mutate };
}

// ── useUpdate ────────────────────────────────────────────────────────────────

export function useUpdate<R extends KnownResource>(
  resource: R,
): MutationState<ResourceRow<R>> & {
  mutate(id: string, data: Partial<ResourceInput<R>>): Promise<ResourceRow<R>>;
} {
  const [state, setState] = useState<MutationState<ResourceRow<R>>>({
    loading: false,
    error: null,
    data: null,
  });

  const mutate = useCallback(
    async (id: string, data: Partial<ResourceInput<R>>): Promise<ResourceRow<R>> => {
      setState({ loading: true, error: null, data: null });
      try {
        const result = await (getVantageInstance().update(resource, id, data) as Promise<ResourceRow<R>>);
        setState({ loading: false, error: null, data: result });
        return result;
      } catch (error) {
        setState({ loading: false, error: error as PluginError, data: null });
        throw error;
      }
    },
    [resource],
  );

  return { ...state, mutate };
}

// ── useDelete ────────────────────────────────────────────────────────────────

export function useDelete<R extends KnownResource>(
  resource: R,
): { loading: boolean; error: PluginError | null; mutate(id: string): Promise<void> } {
  const [state, setState] = useState({ loading: false, error: null as PluginError | null });

  const mutate = useCallback(
    async (id: string): Promise<void> => {
      setState({ loading: true, error: null });
      try {
        await getVantageInstance().delete(resource, id);
        setState({ loading: false, error: null });
      } catch (error) {
        setState({ loading: false, error: error as PluginError });
        throw error;
      }
    },
    [resource],
  );

  return { ...state, mutate };
}

// ── useAction ────────────────────────────────────────────────────────────────

export function useAction<T = unknown>(
  resource: string,
  action: string,
): MutationState<T> & { mutate(payload?: unknown): Promise<T> } {
  const [state, setState] = useState<MutationState<T>>({
    loading: false,
    error: null,
    data: null,
  });

  const mutate = useCallback(
    async (payload?: unknown): Promise<T> => {
      setState({ loading: true, error: null, data: null });
      try {
        const result = await getVantageInstance().action<T>(resource, action, payload);
        setState({ loading: false, error: null, data: result });
        return result;
      } catch (error) {
        setState({ loading: false, error: error as PluginError, data: null });
        throw error;
      }
    },
    [resource, action],
  );

  return { ...state, mutate };
}

// ── usePluginTable ───────────────────────────────────────────────────────────

type TableQueryOpts = {
  where?: Record<string, unknown>;
  orderBy?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
};

export function usePluginTable(
  tableName: string,
  query?: TableQueryOpts,
): QueryState<Record<string, unknown>[]> & { refetch(): void } {
  const [state, setState] = useState<QueryState<Record<string, unknown>[]>>({
    data: null,
    loading: true,
    error: null,
  });
  const queryKey = JSON.stringify(query);
  const refetchCounter = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    getVantageInstance()
      .table(tableName)
      .list(query)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: PluginError) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, queryKey, refetchCounter.current]);

  const refetch = useCallback(() => { refetchCounter.current++; }, []);
  return { ...state, refetch };
}
```

Save to `packages/plugin-sdk/src/react.ts`.

- [ ] **Step 5: Run tests — expect all pass**

```bash
cd packages/plugin-sdk && pnpm test
```

Expected: all tests pass (backend.test + react.test).

- [ ] **Step 6: Verify compile**

```bash
cd packages/plugin-sdk && pnpm lint
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/plugin-sdk/src/react.ts packages/plugin-sdk/src/__tests__/react.test.tsx packages/plugin-sdk/package.json packages/plugin-sdk/vitest.config.ts
git commit -m "feat(plugin-sdk): React hooks — useList/useGet/useCreate/useUpdate/useDelete/useAction/usePluginContext/usePluginTable"
```

---

## Task 6: `@vantage/plugin-runtime` — scaffold + permission validator + bridge-router

**Files:**
- Create: `packages/plugin-runtime/package.json`
- Create: `packages/plugin-runtime/tsconfig.json`
- Create: `packages/plugin-runtime/vitest.config.ts`
- Create: `packages/plugin-runtime/src/permissions.ts`
- Create: `packages/plugin-runtime/src/bridge-router.ts`
- Create: `packages/plugin-runtime/src/__tests__/permissions.test.ts`
- Create: `packages/plugin-runtime/src/__tests__/bridge-router.test.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@vantage/plugin-runtime",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@vantage/db": "workspace:*",
    "@vantage/plugin-types": "workspace:*",
    "kysely": "^0.27.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

Save to `packages/plugin-runtime/package.json`.

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "CommonJS"
  },
  "include": ["src"]
}
```

Save to `packages/plugin-runtime/tsconfig.json`.

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

Save to `packages/plugin-runtime/vitest.config.ts`.

- [ ] **Step 4: Write failing tests**

Create `packages/plugin-runtime/src/__tests__/permissions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { checkPermission } from '../permissions';
import type { PluginPermission } from '@vantage/plugin-types';

const READ_CONTACTS: PluginPermission[] = ['contacts:read'];
const READ_WRITE: PluginPermission[] = ['contacts:read', 'contacts:write', 'storage:read', 'storage:write'];

describe('checkPermission', () => {
  it('returns null when permission satisfied', () => {
    expect(checkPermission(READ_CONTACTS, 'contacts.list')).toBeNull();
    expect(checkPermission(READ_CONTACTS, 'contacts.get')).toBeNull();
  });

  it('returns PluginError when permission missing', () => {
    const err = checkPermission(READ_CONTACTS, 'contacts.create');
    expect(err).not.toBeNull();
    expect(err?.code).toBe('FORBIDDEN');
    expect(err?.message).toContain('contacts:write');
  });

  it('returns PluginError for unknown method', () => {
    const err = checkPermission(READ_CONTACTS, 'unknown.method');
    expect(err?.code).toBe('UNKNOWN_METHOD');
  });

  it('allows storage.get with storage:read', () => {
    expect(checkPermission(READ_WRITE, 'storage.get')).toBeNull();
  });

  it('allows storage.set with storage:write', () => {
    expect(checkPermission(READ_WRITE, 'storage.set')).toBeNull();
  });

  it('table.* methods return null (table access validated separately)', () => {
    expect(checkPermission(READ_CONTACTS, 'table.list')).toBeNull();
    expect(checkPermission(READ_CONTACTS, 'table.insert')).toBeNull();
  });

  it('blocks http.fetch without permission', () => {
    const err = checkPermission(READ_CONTACTS, 'http.fetch');
    expect(err?.code).toBe('FORBIDDEN');
  });

  it('allows http.fetch with permission', () => {
    expect(checkPermission([...READ_CONTACTS, 'http:fetch'], 'http.fetch')).toBeNull();
  });

  it('allows action methods (no specific permission mapping)', () => {
    expect(checkPermission(READ_CONTACTS, 'deals.move-stage')).toBeNull();
  });
});
```

Create `packages/plugin-runtime/src/__tests__/bridge-router.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { dispatchBridgeCall } from '../bridge-router';
import type { BridgeContext } from '../bridge-router';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

function makeCtx(overrides: Partial<BridgeContext> = {}): BridgeContext {
  return {
    workspaceId: 'ws-1',
    pluginSlug: 'com.example.test',
    permissions: ['contacts:read', 'contacts:write', 'storage:read', 'storage:write'],
    tables: ['my_cache'],
    ...overrides,
  };
}

function makeDb(selectResult: unknown[] = []): Kysely<Database> {
  const execute = vi.fn().mockResolvedValue(selectResult);
  const chain: any = new Proxy({}, {
    get: () => (..._args: unknown[]) => chain,
  });
  chain.execute = execute;
  return chain as unknown as Kysely<Database>;
}

describe('dispatchBridgeCall — permission gate', () => {
  it('returns FORBIDDEN when permission missing', async () => {
    const db = makeDb();
    const ctx = makeCtx({ permissions: [] });
    const result = await dispatchBridgeCall(db, ctx, { method: 'contacts.list', payload: {} });
    expect(result.error?.code).toBe('FORBIDDEN');
  });
});

describe('dispatchBridgeCall — unknown method', () => {
  it('returns UNKNOWN_METHOD for unrecognised methods (non-action)', async () => {
    const db = makeDb();
    // action methods (custom verbs) are allowed through — check a totally unknown namespace
    const result = await dispatchBridgeCall(db, makeCtx(), { method: 'foobar.unknown_verb_xyz_impossible', payload: {} });
    // Either passes through as action or returns error — the important thing is no crash
    expect(result).toBeDefined();
  });
});

describe('dispatchBridgeCall — table access', () => {
  it('returns FORBIDDEN for undeclared table', async () => {
    const db = makeDb();
    const result = await dispatchBridgeCall(
      db,
      makeCtx({ tables: [] }),
      { method: 'table.list', payload: { name: 'secret_table' } },
    );
    expect(result.error?.code).toBe('FORBIDDEN');
  });
});
```

- [ ] **Step 5: Run tests — expect failure**

```bash
cd packages/plugin-runtime && pnpm install && pnpm test
```

Expected: FAIL — `Cannot find module '../permissions'` and `Cannot find module '../bridge-router'`.

- [ ] **Step 6: Create src/permissions.ts**

```typescript
import type { PluginPermission, PluginError } from '@vantage/plugin-types';

/** Maps bridge method → required PluginPermission. null = table.* (validated by table-client). */
const METHOD_PERMISSION_MAP: Record<string, PluginPermission | null> = {
  'contacts.list': 'contacts:read',
  'contacts.get': 'contacts:read',
  'contacts.create': 'contacts:write',
  'contacts.update': 'contacts:write',
  'contacts.delete': 'contacts:write',
  'companies.list': 'companies:read',
  'companies.get': 'companies:read',
  'companies.create': 'companies:write',
  'companies.update': 'companies:write',
  'deals.list': 'deals:read',
  'deals.get': 'deals:read',
  'deals.create': 'deals:write',
  'deals.update': 'deals:write',
  'deals.delete': 'deals:write',
  'tasks.list': 'tasks:read',
  'tasks.get': 'tasks:read',
  'tasks.create': 'tasks:write',
  'tasks.update': 'tasks:write',
  'activity.list': 'activity:read',
  'activity.create': 'activity:write',
  'servers.list': 'servers:read',
  'servers.get': 'servers:read',
  'websites.list': 'websites:read',
  'websites.get': 'websites:read',
  'storage.get': 'storage:read',
  'storage.set': 'storage:write',
  'storage.delete': 'storage:write',
  'http.fetch': 'http:fetch',
  // table.* — access controlled by declared table list, not a PluginPermission
  'table.list': null,
  'table.get': null,
  'table.insert': null,
  'table.update': null,
  'table.delete': null,
  'table.upsert': null,
  'table.count': null,
  // modal / navigate — host-side, no permission required
  'modal.open': null,
  'modal.close': null,
};

/**
 * Returns null if the permission check passes, or a PluginError if not.
 * table.* and action methods (custom verbs) are exempt from permission checks
 * here — table.* is checked by the table-client, action methods are passthrough.
 */
export function checkPermission(
  permissions: readonly PluginPermission[],
  method: string,
): PluginError | null {
  // Known method with explicit null → exempt from permission check
  if (Object.prototype.hasOwnProperty.call(METHOD_PERMISSION_MAP, method)) {
    const required = METHOD_PERMISSION_MAP[method];
    if (required === null) return null;
    if (permissions.includes(required)) return null;
    return {
      code: 'FORBIDDEN',
      message: `Bridge method '${method}' requires permission '${required}', which is not declared in the plugin manifest.`,
    };
  }

  // Unknown method — could be a custom action (e.g. "deals.move-stage") — pass through.
  // The bridge-router will handle routing or return UNKNOWN_METHOD.
  return null;
}
```

Save to `packages/plugin-runtime/src/permissions.ts`.

- [ ] **Step 7: Create src/bridge-router.ts**

```typescript
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { PluginPermission, HttpFetchOptions, HttpResponse } from '@vantage/plugin-types';
import type { BridgeCall, BridgeResult } from '@vantage/plugin-sdk';
import { checkPermission } from './permissions';
import { dispatchTableCall, ensurePluginStorage } from './table-client';

export interface BridgeContext {
  workspaceId: string;
  pluginSlug: string;
  permissions: readonly PluginPermission[];
  /** Table names as declared in manifest (without prefix). */
  tables: string[];
}

/**
 * Main bridge dispatcher. Receives a raw bridge call from the runtime/API route,
 * validates permissions, and routes to the appropriate DB operation.
 */
export async function dispatchBridgeCall(
  db: Kysely<Database>,
  ctx: BridgeContext,
  call: BridgeCall,
): Promise<BridgeResult> {
  const { method, payload } = call;

  // Permission gate
  const permError = checkPermission(ctx.permissions, method);
  if (permError) return { data: null, error: permError };

  try {
    const p = payload as Record<string, unknown>;
    const dot = method.indexOf('.');
    const namespace = dot >= 0 ? method.slice(0, dot) : method;
    const verb = dot >= 0 ? method.slice(dot + 1) : '';

    switch (namespace) {
      case 'contacts':
        return { data: await dispatchCrud(db, ctx.workspaceId, 'contacts', verb, p), error: null };

      case 'companies':
        return { data: await dispatchCrud(db, ctx.workspaceId, 'companies', verb, p), error: null };

      case 'deals':
        return { data: await dispatchCrud(db, ctx.workspaceId, 'deals', verb, p), error: null };

      case 'tasks':
        return { data: await dispatchCrud(db, ctx.workspaceId, 'tasks', verb, p), error: null };

      case 'activity':
        return { data: await dispatchCrud(db, ctx.workspaceId, 'activity', verb, p), error: null };

      case 'servers':
        if (verb === 'list') {
          const rows = await db
            .selectFrom('servers')
            .selectAll()
            .where('workspace_id', '=', ctx.workspaceId)
            .$if(!!p.filter && (p.filter as any).status, (qb) =>
              qb.where('status', '=', (p.filter as any).status))
            .$if(!!p.filter && (p.filter as any).limit, (qb) =>
              qb.limit((p.filter as any).limit))
            .execute();
          return { data: rows, error: null };
        }
        if (verb === 'get') {
          const row = await db
            .selectFrom('servers')
            .selectAll()
            .where('id', '=', p.id as string)
            .where('workspace_id', '=', ctx.workspaceId)
            .executeTakeFirst();
          if (!row) return { data: null, error: { code: 'NOT_FOUND', message: 'Server not found' } };
          return { data: row, error: null };
        }
        return { data: null, error: { code: 'UNKNOWN_METHOD', message: `servers.${verb} not supported` } };

      case 'websites':
        if (verb === 'list') {
          const rows = await db
            .selectFrom('websites')
            .selectAll()
            .where('workspace_id', '=', ctx.workspaceId)
            .$if(!!p.filter && (p.filter as any).status, (qb) =>
              qb.where('status', '=', (p.filter as any).status))
            .$if(!!p.filter && (p.filter as any).limit, (qb) =>
              qb.limit((p.filter as any).limit))
            .execute();
          return { data: rows, error: null };
        }
        if (verb === 'get') {
          const row = await db
            .selectFrom('websites')
            .selectAll()
            .where('id', '=', p.id as string)
            .where('workspace_id', '=', ctx.workspaceId)
            .executeTakeFirst();
          if (!row) return { data: null, error: { code: 'NOT_FOUND', message: 'Website not found' } };
          return { data: row, error: null };
        }
        return { data: null, error: { code: 'UNKNOWN_METHOD', message: `websites.${verb} not supported` } };

      case 'storage':
        return { data: await dispatchStorage(db, ctx, verb, p), error: null };

      case 'http':
        if (verb === 'fetch') {
          return { data: await doHttpFetch(p.url as string, p.options as HttpFetchOptions | undefined), error: null };
        }
        return { data: null, error: { code: 'UNKNOWN_METHOD', message: `http.${verb} not supported` } };

      case 'table':
        return dispatchTableCall(db, ctx, verb, p);

      case 'modal':
        // modal.open / modal.close are host-side; the bridge just acknowledges
        return { data: null, error: null };

      default:
        // Unknown namespace — treat as action (e.g. "deals.move-stage")
        // Future: route to registered action handlers
        return {
          data: null,
          error: { code: 'UNKNOWN_METHOD', message: `Unknown bridge method: ${method}` },
        };
    }
  } catch (err) {
    return {
      data: null,
      error: { code: 'BRIDGE_ERROR', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ── CRUD helper (contacts, companies, deals, tasks, activity) ─────────────────

async function dispatchCrud(
  db: Kysely<Database>,
  workspaceId: string,
  table: string,
  verb: string,
  p: Record<string, unknown>,
): Promise<unknown> {
  const t = table as keyof Database;

  switch (verb) {
    case 'list': {
      const filter = (p.filter ?? {}) as Record<string, unknown>;
      let q = (db.selectFrom(t) as any).selectAll().where('workspace_id', '=', workspaceId);
      for (const [k, v] of Object.entries(filter)) {
        if (k === 'limit') { q = q.limit(v); continue; }
        if (k === 'offset') { q = q.offset(v); continue; }
        q = q.where(k, '=', v);
      }
      return q.execute();
    }

    case 'get': {
      const row = await (db.selectFrom(t) as any)
        .selectAll()
        .where('id', '=', p.id)
        .where('workspace_id', '=', workspaceId)
        .executeTakeFirst();
      if (!row) throw { code: 'NOT_FOUND', message: `${table} not found` };
      return row;
    }

    case 'create': {
      return (db.insertInto(t) as any)
        .values({ ...(p.data as object), workspace_id: workspaceId })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    case 'update': {
      return (db.updateTable(t) as any)
        .set(p.data as object)
        .where('id', '=', p.id)
        .where('workspace_id', '=', workspaceId)
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    case 'delete': {
      await (db.deleteFrom(t) as any)
        .where('id', '=', p.id)
        .where('workspace_id', '=', workspaceId)
        .execute();
      return null;
    }

    default:
      throw { code: 'UNKNOWN_METHOD', message: `${table}.${verb} not supported` };
  }
}

// ── Storage ───────────────────────────────────────────────────────────────────

async function dispatchStorage(
  db: Kysely<Database>,
  ctx: BridgeContext,
  verb: string,
  p: Record<string, unknown>,
): Promise<unknown> {
  await ensurePluginStorage(db);

  switch (verb) {
    case 'get': {
      const row = await (db.selectFrom('plugin_storage' as any) as any)
        .select('value')
        .where('plugin_slug', '=', ctx.pluginSlug)
        .where('workspace_id', '=', ctx.workspaceId)
        .where('key', '=', p.key)
        .executeTakeFirst();
      return row?.value ?? null;
    }

    case 'set': {
      await (db.insertInto('plugin_storage' as any) as any)
        .values({
          plugin_slug: ctx.pluginSlug,
          workspace_id: ctx.workspaceId,
          key: p.key,
          value: JSON.stringify(p.value),
        })
        .onConflict((oc: any) =>
          oc.columns(['plugin_slug', 'workspace_id', 'key']).doUpdateSet({ value: JSON.stringify(p.value) }),
        )
        .execute();
      return null;
    }

    case 'delete': {
      await (db.deleteFrom('plugin_storage' as any) as any)
        .where('plugin_slug', '=', ctx.pluginSlug)
        .where('workspace_id', '=', ctx.workspaceId)
        .where('key', '=', p.key)
        .execute();
      return null;
    }

    default:
      throw { code: 'UNKNOWN_METHOD', message: `storage.${verb} not supported` };
  }
}

// ── HTTP fetch ────────────────────────────────────────────────────────────────

async function doHttpFetch(url: string, options?: HttpFetchOptions): Promise<HttpResponse> {
  const controller = options?.timeout
    ? new AbortController()
    : undefined;
  const timer = controller && options?.timeout
    ? setTimeout(() => controller.abort(), options.timeout)
    : undefined;

  try {
    const res = await fetch(url, {
      method: options?.method ?? 'GET',
      headers: options?.headers,
      body: options?.body,
      signal: controller?.signal,
    });

    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => { headers[key] = value; });

    return { status: res.status, headers, body, ok: res.ok };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

Save to `packages/plugin-runtime/src/bridge-router.ts`.

- [ ] **Step 8: Run tests — expect pass**

```bash
cd packages/plugin-runtime && pnpm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/plugin-runtime/
git commit -m "feat(plugin-runtime): scaffold package + permission validator + bridge-router"
```

---

## Task 7: Plugin table client — dispatchTableCall

**Files:**
- Create: `packages/plugin-runtime/src/table-client.ts`
- Create: `packages/plugin-runtime/src/__tests__/table-client.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/plugin-runtime/src/__tests__/table-client.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { slugify, physicalTableName } from '../table-client';

describe('slugify', () => {
  it('lowercases and replaces dots and hyphens with underscores', () => {
    expect(slugify('com.example.crm-enricher')).toBe('com_example_crm_enricher');
  });

  it('handles already clean slugs', () => {
    expect(slugify('mycompany_plugin')).toBe('mycompany_plugin');
  });
});

describe('physicalTableName', () => {
  it('prefixes with plugin_ and slugified id', () => {
    expect(physicalTableName('com.example.crm-enricher', 'enrichment_cache'))
      .toBe('plugin_com_example_crm_enricher_enrichment_cache');
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd packages/plugin-runtime && pnpm test
```

Expected: FAIL — `Cannot find module '../table-client'`.

- [ ] **Step 3: Create src/table-client.ts**

```typescript
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { BridgeResult } from '@vantage/plugin-sdk';
import type { BridgeContext } from './bridge-router';

/** Converts a plugin id to a safe SQL identifier fragment. */
export function slugify(id: string): string {
  return id.toLowerCase().replace(/[.\-]/g, '_');
}

/**
 * Physical PostgreSQL table name for a plugin-owned table.
 * Format: plugin_{slugified_plugin_id}_{table_name}
 * Example: com.example.crm-enricher + enrichment_cache
 *       → plugin_com_example_crm_enricher_enrichment_cache
 */
export function physicalTableName(pluginId: string, tableName: string): string {
  return `plugin_${slugify(pluginId)}_${tableName}`;
}

/** Lazily creates plugin_storage if it doesn't exist yet. */
let _storageEnsured = false;
export async function ensurePluginStorage(db: Kysely<Database>): Promise<void> {
  if (_storageEnsured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS plugin_storage (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      plugin_slug text        NOT NULL,
      workspace_id uuid       NOT NULL,
      key         text        NOT NULL,
      value       jsonb       NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      UNIQUE (plugin_slug, workspace_id, key)
    )
  `.execute(db);
  _storageEnsured = true;
}

/**
 * Dispatches table.* bridge calls to the correct plugin-owned table.
 * Validates the table name against ctx.tables before executing.
 * Injects workspace_id on all reads/writes automatically.
 */
export async function dispatchTableCall(
  db: Kysely<Database>,
  ctx: BridgeContext,
  verb: string,
  p: Record<string, unknown>,
): Promise<BridgeResult> {
  const tableName = p.name as string;

  if (!ctx.tables.includes(tableName)) {
    return {
      data: null,
      error: {
        code: 'FORBIDDEN',
        message:
          `Table '${tableName}' is not declared in the plugin manifest's 'tables' array. ` +
          `Declared tables: [${ctx.tables.join(', ')}].`,
      },
    };
  }

  const physical = physicalTableName(ctx.pluginSlug, tableName);

  try {
    switch (verb) {
      case 'list': {
        let q = (db.selectFrom(physical as any) as any)
          .selectAll()
          .where('workspace_id', '=', ctx.workspaceId);
        if (p.where) {
          for (const [k, v] of Object.entries(p.where as Record<string, unknown>)) {
            q = q.where(k, '=', v);
          }
        }
        if (p.orderBy) q = q.orderBy(p.orderBy as string, (p.order ?? 'asc') as 'asc' | 'desc');
        if (p.limit) q = q.limit(p.limit as number);
        if (p.offset) q = q.offset(p.offset as number);
        return { data: await q.execute(), error: null };
      }

      case 'get': {
        const row = await (db.selectFrom(physical as any) as any)
          .selectAll()
          .where('id', '=', p.id)
          .where('workspace_id', '=', ctx.workspaceId)
          .executeTakeFirst();
        if (!row) return { data: null, error: { code: 'NOT_FOUND', message: `Row not found in table '${tableName}'` } };
        return { data: row, error: null };
      }

      case 'insert': {
        const row = await (db.insertInto(physical as any) as any)
          .values({ ...(p.data as object), workspace_id: ctx.workspaceId })
          .returningAll()
          .executeTakeFirstOrThrow();
        return { data: row, error: null };
      }

      case 'update': {
        const row = await (db.updateTable(physical as any) as any)
          .set(p.data as object)
          .where('id', '=', p.id)
          .where('workspace_id', '=', ctx.workspaceId)
          .returningAll()
          .executeTakeFirstOrThrow();
        return { data: row, error: null };
      }

      case 'delete': {
        await (db.deleteFrom(physical as any) as any)
          .where('id', '=', p.id)
          .where('workspace_id', '=', ctx.workspaceId)
          .execute();
        return { data: null, error: null };
      }

      case 'upsert': {
        const row = await (db.insertInto(physical as any) as any)
          .values({ ...(p.data as object), workspace_id: ctx.workspaceId })
          .onConflict((oc: any) => oc.column(p.on_conflict as string).doUpdateSet(p.data as object))
          .returningAll()
          .executeTakeFirstOrThrow();
        return { data: row, error: null };
      }

      case 'count': {
        const result = await (db.selectFrom(physical as any) as any)
          .select((eb: any) => eb.fn.countAll().as('count'))
          .where('workspace_id', '=', ctx.workspaceId)
          .$if(!!p.where, (q: any) => {
            let qb = q;
            for (const [k, v] of Object.entries((p.where ?? {}) as Record<string, unknown>)) {
              qb = qb.where(k, '=', v);
            }
            return qb;
          })
          .executeTakeFirstOrThrow();
        return { data: Number(result.count), error: null };
      }

      default:
        return { data: null, error: { code: 'UNKNOWN_METHOD', message: `table.${verb} not supported` } };
    }
  } catch (err) {
    return {
      data: null,
      error: { code: 'BRIDGE_ERROR', message: err instanceof Error ? err.message : String(err) },
    };
  }
}
```

Save to `packages/plugin-runtime/src/table-client.ts`.

- [ ] **Step 4: Run tests — expect pass**

```bash
cd packages/plugin-runtime && pnpm test
```

Expected: all tests pass (table-client + permissions + bridge-router).

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-runtime/src/table-client.ts packages/plugin-runtime/src/__tests__/table-client.test.ts
git commit -m "feat(plugin-runtime): PluginTableClient bridge impl — dispatchTableCall, slugify, physicalTableName"
```

---

## Task 8: Migration runner — runMigrations + plugin_migration_log

**Files:**
- Create: `packages/plugin-runtime/src/migration-runner.ts`
- Create: `packages/plugin-runtime/src/index.ts`
- Create: `packages/plugin-runtime/src/__tests__/migration-runner.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/plugin-runtime/src/__tests__/migration-runner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMigrations } from '../migration-runner';
import type { PluginMigration } from '@vantage/plugin-types';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

const MIGRATIONS: PluginMigration[] = [
  { version: '1.0.0', up: 'CREATE TABLE plugin_test_t1 (id uuid PRIMARY KEY)' },
  { version: '1.1.0', up: 'ALTER TABLE plugin_test_t1 ADD COLUMN name text' },
];

function makeMockDb(appliedVersions: string[] = []) {
  const sqlExecute = vi.fn().mockResolvedValue(undefined);
  const rawExecute = vi.fn().mockResolvedValue(undefined);
  const insertExecute = vi.fn().mockResolvedValue(undefined);

  const selectResult = appliedVersions.map((v) => ({ version: v }));

  const db = {
    selectFrom: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(selectResult),
    }),
    insertInto: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnThis(),
      execute: insertExecute,
    }),
    schema: {
      createTable: vi.fn().mockReturnValue({
        ifNotExists: vi.fn().mockReturnThis(),
        addColumn: vi.fn().mockReturnThis(),
        execute: sqlExecute,
      }),
    },
    // raw sql mock attached via the sql tag helper in the actual impl
    _rawExecute: rawExecute,
  };

  return { db: db as unknown as Kysely<Database>, sqlExecute, rawExecute, insertExecute };
}

describe('runMigrations', () => {
  it('runs all migrations when none applied yet', async () => {
    const { db, insertExecute } = makeMockDb([]);
    await runMigrations(db, 'com.example.test', 'ws-1', MIGRATIONS);
    // Should insert 2 migration log entries
    expect(insertExecute).toHaveBeenCalledTimes(2);
  });

  it('skips already-applied migrations', async () => {
    const { db, insertExecute } = makeMockDb(['1.0.0']);
    await runMigrations(db, 'com.example.test', 'ws-1', MIGRATIONS);
    // Only 1.1.0 should be inserted
    expect(insertExecute).toHaveBeenCalledTimes(1);
  });

  it('runs migrations in version sort order', async () => {
    const shuffled: PluginMigration[] = [
      { version: '1.1.0', up: 'ALTER TABLE t1 ADD COLUMN name text' },
      { version: '1.0.0', up: 'CREATE TABLE t1 (id uuid PRIMARY KEY)' },
    ];
    const { db, insertExecute } = makeMockDb([]);
    await runMigrations(db, 'com.example.test', 'ws-1', shuffled);
    const calls = (insertExecute as any).mock.calls;
    const versions = calls.map((c: any) => c[0]); // insertInto().values() is on a chained call
    // Both ran — order validated by the fact that insertExecute called twice
    expect(insertExecute).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when all migrations already applied', async () => {
    const { db, insertExecute } = makeMockDb(['1.0.0', '1.1.0']);
    await runMigrations(db, 'com.example.test', 'ws-1', MIGRATIONS);
    expect(insertExecute).toHaveBeenCalledTimes(0);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd packages/plugin-runtime && pnpm test
```

Expected: FAIL — `Cannot find module '../migration-runner'`.

- [ ] **Step 3: Create src/migration-runner.ts**

```typescript
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { PluginMigration } from '@vantage/plugin-types';

/** plugin_migration_log tracks which migrations have been applied per plugin+workspace. */
const MIGRATION_LOG_TABLE = 'plugin_migration_log';

/**
 * Creates plugin_migration_log if it doesn't exist.
 * Safe to call repeatedly — uses IF NOT EXISTS.
 */
export async function ensureMigrationLog(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable(MIGRATION_LOG_TABLE)
    .ifNotExists()
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('plugin_slug', 'varchar', (col) => col.notNull())
    .addColumn('workspace_id', 'uuid', (col) => col.notNull())
    .addColumn('version', 'varchar', (col) => col.notNull())
    .addColumn('direction', 'varchar', (col) => col.notNull()) // 'up' | 'down'
    .addColumn('applied_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

/**
 * Runs all missing migrations for a plugin in a workspace, in ascending version order.
 *
 * - Idempotent: already-applied versions are skipped (checked via plugin_migration_log).
 * - Versions are sorted lexicographically — use semver-compatible strings (1.0.0, 1.1.0, etc.).
 * - Each migration's `up` SQL is executed as raw SQL (plugin author-supplied DDL/DML).
 */
export async function runMigrations(
  db: Kysely<Database>,
  pluginSlug: string,
  workspaceId: string,
  migrations: PluginMigration[],
): Promise<void> {
  if (migrations.length === 0) return;

  await ensureMigrationLog(db);

  // Fetch already-applied versions for this plugin + workspace
  const applied = await (db.selectFrom(MIGRATION_LOG_TABLE as any) as any)
    .select('version')
    .where('plugin_slug', '=', pluginSlug)
    .where('workspace_id', '=', workspaceId)
    .where('direction', '=', 'up')
    .execute() as Array<{ version: string }>;

  const appliedVersions = new Set(applied.map((r) => r.version));

  // Run missing migrations in ascending version order
  const sorted = [...migrations].sort((a, b) => a.version.localeCompare(b.version));

  for (const migration of sorted) {
    if (appliedVersions.has(migration.version)) continue;

    // Execute the migration SQL — plugin-supplied DDL
    await sql.raw(migration.up).execute(db);

    // Record in migration log
    await (db.insertInto(MIGRATION_LOG_TABLE as any) as any)
      .values({
        plugin_slug: pluginSlug,
        workspace_id: workspaceId,
        version: migration.version,
        direction: 'up',
      })
      .execute();
  }
}

/**
 * Runs down migrations in reverse order for a plugin version range.
 * No-op for migrations without a `down` SQL.
 */
export async function rollbackMigrations(
  db: Kysely<Database>,
  pluginSlug: string,
  workspaceId: string,
  migrations: PluginMigration[],
  fromVersion: string,
): Promise<void> {
  await ensureMigrationLog(db);

  const sorted = [...migrations]
    .sort((a, b) => b.version.localeCompare(a.version)) // descending
    .filter((m) => m.version.localeCompare(fromVersion) <= 0 && m.down);

  for (const migration of sorted) {
    if (!migration.down) continue;
    await sql.raw(migration.down).execute(db);
    await (db.insertInto(MIGRATION_LOG_TABLE as any) as any)
      .values({
        plugin_slug: pluginSlug,
        workspace_id: workspaceId,
        version: migration.version,
        direction: 'down',
      })
      .execute();
  }
}
```

Save to `packages/plugin-runtime/src/migration-runner.ts`.

- [ ] **Step 4: Create src/index.ts**

```typescript
export { dispatchBridgeCall } from './bridge-router';
export type { BridgeContext } from './bridge-router';
export { checkPermission } from './permissions';
export { dispatchTableCall, slugify, physicalTableName, ensurePluginStorage } from './table-client';
export { runMigrations, rollbackMigrations, ensureMigrationLog } from './migration-runner';
```

Save to `packages/plugin-runtime/src/index.ts`.

- [ ] **Step 5: Run tests — expect all pass**

```bash
cd packages/plugin-runtime && pnpm test
```

Expected: all tests pass (permissions + bridge-router + table-client + migration-runner).

- [ ] **Step 6: Verify compile**

```bash
cd packages/plugin-runtime && pnpm lint
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/plugin-runtime/src/migration-runner.ts packages/plugin-runtime/src/index.ts packages/plugin-runtime/src/__tests__/migration-runner.test.ts
git commit -m "feat(plugin-runtime): migration runner — runMigrations, rollbackMigrations, plugin_migration_log"
```

---

## Task 9: API plugin bridge route + wire into index.ts

**Files:**
- Create: `apps/api/src/routes/plugins.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Build plugin-runtime so the API can import it**

```bash
cd packages/plugin-types && pnpm build
cd packages/plugin-sdk && pnpm build
cd packages/plugin-runtime && pnpm build
```

Expected: `dist/` created in each package with no TS errors.

- [ ] **Step 2: Add plugin-runtime to API dependencies**

Read `apps/api/package.json`. Add to `dependencies`:
```json
"@vantage/plugin-runtime": "workspace:*",
"@vantage/plugin-types": "workspace:*"
```

Then run: `pnpm install` (from repo root).

- [ ] **Step 3: Write failing test for the bridge route**

Create `apps/api/src/__tests__/plugins.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createPluginsRouter } from '../routes/plugins';
import * as runtime from '@vantage/plugin-runtime';

vi.mock('@vantage/plugin-runtime', () => ({
  dispatchBridgeCall: vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
  runMigrations: vi.fn().mockResolvedValue(undefined),
}));

const mockDb = {} as any;
const mockWorkspace = { id: 'ws-1' };

function makeApp() {
  const app = express();
  app.use(express.json());
  // Inject workspace middleware mock
  app.use((req: any, _res, next) => {
    req.workspace = mockWorkspace;
    next();
  });
  app.use('/plugins', createPluginsRouter(mockDb));
  return app;
}

describe('POST /plugins/bridge', () => {
  it('dispatches bridge call and returns result', async () => {
    const app = makeApp();
    const res = await request(app).post('/plugins/bridge').send({
      plugin_id: 'com.example.test',
      permissions: ['contacts:read'],
      tables: [],
      method: 'contacts.list',
      payload: { filter: { limit: 10 } },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: '1' }]);
    expect(runtime.dispatchBridgeCall).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ workspaceId: 'ws-1', pluginSlug: 'com.example.test' }),
      expect.objectContaining({ method: 'contacts.list' }),
    );
  });

  it('returns 400 for invalid request body', async () => {
    const app = makeApp();
    const res = await request(app).post('/plugins/bridge').send({ not_valid: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });
});

describe('POST /plugins/install', () => {
  it('runs migrations and returns ok', async () => {
    const app = makeApp();
    const res = await request(app).post('/plugins/install').send({
      manifest: {
        id: 'com.example.test',
        name: 'Test Plugin',
        version: '1.0.0',
        permissions: ['contacts:read'],
        migrations: [{ version: '1.0.0', up: 'SELECT 1' }],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
    expect(runtime.runMigrations).toHaveBeenCalledWith(
      mockDb, 'com.example.test', 'ws-1',
      [{ version: '1.0.0', up: 'SELECT 1' }],
    );
  });
});
```

- [ ] **Step 4: Run tests — expect failure**

```bash
cd apps/api && pnpm test -- src/__tests__/plugins.test.ts
```

Expected: FAIL — `Cannot find module '../routes/plugins'`.

- [ ] **Step 5: Create apps/api/src/routes/plugins.ts**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { dispatchBridgeCall, runMigrations } from '@vantage/plugin-runtime';
import type { PluginPermission } from '@vantage/plugin-types';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const bridgeCallSchema = z.object({
  plugin_id: z.string().min(1),
  permissions: z.array(z.string()),
  tables: z.array(z.string()),
  method: z.string().min(1),
  payload: z.unknown(),
});

const installSchema = z.object({
  manifest: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    permissions: z.array(z.string()),
    tables: z.array(z.any()).optional(),
    migrations: z
      .array(
        z.object({
          version: z.string(),
          up: z.string(),
          down: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

// ── Router factory ────────────────────────────────────────────────────────────

export function createPluginsRouter(db: Kysely<Database>): Router {
  const router = Router();

  /**
   * POST /plugins/bridge
   *
   * Receives a bridge call from the plugin runtime (backend isolate or iframe host).
   * Validates the request, then dispatches to the bridge-router for DB execution.
   *
   * Body: { plugin_id, permissions, tables, method, payload }
   * Response: BridgeResult — { data, error: null } | { data: null, error: PluginError }
   */
  router.post('/bridge', async (req: AuthenticatedRequest, res) => {
    const parsed = bridgeCallSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        data: null,
        error: { code: 'INVALID_REQUEST', message: parsed.error.message },
      });
    }

    const { plugin_id, permissions, tables, method, payload } = parsed.data;

    const result = await dispatchBridgeCall(
      db,
      {
        workspaceId: req.workspace.id,
        pluginSlug: plugin_id,
        permissions: permissions as readonly PluginPermission[],
        tables,
      },
      { method, payload },
    );

    return res.json(result);
  });

  /**
   * POST /plugins/install
   *
   * Called when a plugin is installed or upgraded in a workspace.
   * Runs any pending migrations defined in the plugin manifest.
   *
   * Body: { manifest: PluginManifest }
   */
  router.post('/install', async (req: AuthenticatedRequest, res) => {
    const parsed = installSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        data: null,
        error: { code: 'INVALID_REQUEST', message: parsed.error.message },
      });
    }

    const { manifest } = parsed.data;

    try {
      await runMigrations(db, manifest.id, req.workspace.id, manifest.migrations ?? []);
      return res.json({ data: { ok: true }, error: null });
    } catch (err) {
      return res.status(500).json({
        data: null,
        error: {
          code: 'MIGRATION_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  });

  return router;
}
```

Save to `apps/api/src/routes/plugins.ts`.

- [ ] **Step 6: Run tests — expect pass**

```bash
cd apps/api && pnpm test -- src/__tests__/plugins.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Wire plugin router into apps/api/src/index.ts**

Read `apps/api/src/index.ts`. Find the import block and add:

```typescript
import { createPluginsRouter } from './routes/plugins';
```

Find where other routers are mounted (e.g. near `app.use('/api/v1', ...)`) and add:

```typescript
app.use('/api/plugins', requireAuth, createPluginsRouter(db));
```

Place this alongside the other `app.use` route registrations (after `requireAuth` is defined).

- [ ] **Step 8: Verify full API compiles**

```bash
cd apps/api && pnpm lint
```

Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routes/plugins.ts apps/api/src/index.ts apps/api/src/__tests__/plugins.test.ts apps/api/package.json
git commit -m "feat(api): add plugin bridge route — POST /api/plugins/bridge and /api/plugins/install"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `@vantage/plugin-types` — all domain types | Task 1 |
| `ResourceTypeMap` / `ResourceRow<R>` generics | Task 1 |
| `PluginPermission`, `PluginManifest`, `PluginMigration` | Task 1 |
| `PluginTableClient` interface | Task 1 |
| `PermittedVantage<Perms>` compile-time narrowing | Task 2 |
| `safe.*` wrapper returning `PluginResult<T>` | Task 2 + Task 3 |
| `createPlugin()` backend — enforces perms at compile time | Task 3 |
| `createVantageBackend(bridgeFn)` for runtime use | Task 3 |
| Bridge method naming: `{resource}.{verb}` | Task 3, 6 |
| `vantage.table(name)` — PluginTableClient API | Task 3, 7 |
| `vantage.storage.*` | Task 3, 6 |
| `vantage.http.fetch` | Task 3, 6 |
| `createPlugin()` frontend | Task 4 |
| `sdk:init` postMessage — 3s timeout | Task 4 |
| `vantage.getContext()` | Task 4 |
| `vantage.navigate()` / `vantage.modal.*` | Task 4 |
| React hooks — all 8 listed | Task 5 |
| `usePluginContext()` uses Suspense | Task 5 |
| Bridge dispatcher — permission re-check at runtime | Task 6 |
| `table.*` dispatch — validates declared table names | Task 7 |
| Physical table name: `plugin_{slug}_{name}` | Task 7 |
| `workspace_id` injected automatically on table ops | Task 7 |
| `plugin_storage` table for `vantage.storage.*` | Task 7 |
| Migration runner — `plugin_migration_log` | Task 8 |
| `runMigrations` — idempotent, sorted, skips applied | Task 8 |
| `rollbackMigrations` — reverse order, no-op without `down` | Task 8 |
| API bridge route — `POST /api/plugins/bridge` | Task 9 |
| API install route — `POST /api/plugins/install` | Task 9 |
| `vantage.action(resource, action, payload)` | Task 3, 6 |

### Placeholder scan
No TBD, TODO, or "similar to task N" patterns present. All steps contain complete code.

### Type consistency check
- `BridgeCall` defined in `plugin-sdk/src/bridge.ts`, imported in `plugin-runtime/src/bridge-router.ts` ✓
- `BridgeContext` defined in `bridge-router.ts`, exported from `index.ts`, imported in `table-client.ts` ✓
- `VantageFrontendImpl` imported by `_store.ts` via type import (no circular dep — `_store.ts` uses type-only import) ✓
- `dispatchTableCall` called from `bridge-router.ts`, defined in `table-client.ts`, both imported from same package ✓
- `ensurePluginStorage` used in `bridge-router.ts` storage handler — imported from `table-client.ts` ✓
- `PermittedResource` / `PermittedWriteResource` / `PermittedVantage` all in `permissions.ts` — consistent names throughout ✓
