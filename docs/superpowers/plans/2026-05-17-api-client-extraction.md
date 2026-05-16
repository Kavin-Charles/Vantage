# API Client Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all API fetch functions from `apps/web/lib/` into a shared `packages/api-client` package usable by both the web app and the upcoming mobile app, with zero behaviour change on the web.

**Architecture:** Create `packages/api-client` with a module-level `configure(baseUrl)` function and typed fetch helpers for every API resource. The web app's `lib/` files become thin re-exports so no page-level imports change. Next.js transpiles the package via `transpilePackages`; Expo's Metro bundler handles it natively.

**Tech Stack:** TypeScript, pnpm workspaces, `@vantage/types` (existing)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/api-client/package.json` | Create | Package manifest, points `main` at `src/index.ts` |
| `packages/api-client/tsconfig.json` | Create | Extends base tsconfig |
| `packages/api-client/src/core.ts` | Create | `configure(baseUrl)` + `apiFetch` |
| `packages/api-client/src/contacts.ts` | Create | Contact CRUD (moved from web lib) |
| `packages/api-client/src/deals.ts` | Create | Deal CRUD (moved from web lib) |
| `packages/api-client/src/tasks.ts` | Create | Task CRUD (currently inline in pages) |
| `packages/api-client/src/activity.ts` | Create | Activity list/create (moved from web lib) |
| `packages/api-client/src/alerts.ts` | Create | Alert list/ack/resolve (currently inline in pages) |
| `packages/api-client/src/companies.ts` | Create | Company CRUD (moved from web lib) |
| `packages/api-client/src/me.ts` | Create | GET /api/me + push token endpoints |
| `packages/api-client/src/index.ts` | Create | Re-exports all public API |
| `apps/web/next.config.ts` | Modify | Add `@vantage/api-client` to `transpilePackages` |
| `apps/web/package.json` | Modify | Add `@vantage/api-client: workspace:*` dep |
| `apps/web/lib/api.ts` | Modify | Re-export `apiFetch` + call `configure()` |
| `apps/web/lib/contacts.ts` | Modify | Re-export from `@vantage/api-client` |
| `apps/web/lib/deals.ts` | Modify | Re-export from `@vantage/api-client` |
| `apps/web/lib/activity.ts` | Modify | Re-export from `@vantage/api-client` |
| `apps/web/lib/companies.ts` | Modify | Re-export from `@vantage/api-client` |

---

### Task 1: Scaffold `packages/api-client`

**Files:**
- Create: `packages/api-client/package.json`
- Create: `packages/api-client/tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
// packages/api-client/package.json
{
  "name": "@vantage/api-client",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@vantage/types": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
// packages/api-client/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "bundler"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install workspace deps**

```bash
cd D:/Projects/Vantage
pnpm install
```

Expected: pnpm resolves `@vantage/api-client` as a workspace package.

- [ ] **Step 4: Commit**

```bash
git add packages/api-client/package.json packages/api-client/tsconfig.json
git commit -m "chore: scaffold @vantage/api-client package"
```

---

### Task 2: Implement `core.ts`

**Files:**
- Create: `packages/api-client/src/core.ts`

`core.ts` holds a module-level `baseUrl` string set once via `configure()`. All other modules call `apiFetch` from here. The web sets it in its root layout; mobile sets it at app entry.

- [ ] **Step 1: Create `src/core.ts`**

```typescript
// packages/api-client/src/core.ts
let _baseUrl = '';

/**
 * Call once at app startup before any API calls.
 * Web:    configure(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001')
 * Mobile: configure(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001')
 */
export function configure(baseUrl: string): void {
  _baseUrl = baseUrl;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const res = await fetch(`${_baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const json = (await res.json()) as { error?: { message?: string } };

  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  }

  return json as T;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/api-client/src/core.ts
git commit -m "feat(api-client): add configure + apiFetch core"
```

---

### Task 3: Move `contacts.ts`, `deals.ts`, `activity.ts`, `companies.ts`

**Files:**
- Create: `packages/api-client/src/contacts.ts`
- Create: `packages/api-client/src/deals.ts`
- Create: `packages/api-client/src/activity.ts`
- Create: `packages/api-client/src/companies.ts`

These are direct copies of the web lib files, with `import { apiFetch } from './api'` replaced by `import { apiFetch } from './core'`.

- [ ] **Step 1: Create `src/contacts.ts`**

```typescript
// packages/api-client/src/contacts.ts
import { apiFetch } from './core';
import type { Contact } from '@vantage/types';

export interface ContactsResponse {
  data: Contact[];
  total: number;
  page: number;
  per_page: number;
  error: null;
}

export interface ContactResponse {
  data: Contact;
  error: null;
}

export async function listContacts(
  token: string,
  params?: Record<string, string>,
): Promise<ContactsResponse> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch(`/api/contacts${qs}`, { token });
}

export async function getContact(token: string, id: string): Promise<ContactResponse> {
  return apiFetch(`/api/contacts/${id}`, { token });
}

export async function createContact(
  token: string,
  body: Partial<Contact>,
): Promise<ContactResponse> {
  return apiFetch('/api/contacts', { method: 'POST', body: JSON.stringify(body), token });
}

export async function updateContact(
  token: string,
  id: string,
  body: Partial<Contact>,
): Promise<ContactResponse> {
  return apiFetch(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body), token });
}

export async function deleteContact(token: string, id: string): Promise<void> {
  return apiFetch(`/api/contacts/${id}`, { method: 'DELETE', token });
}
```

- [ ] **Step 2: Create `src/deals.ts`**

```typescript
// packages/api-client/src/deals.ts
import { apiFetch } from './core';
import type { Deal } from '@vantage/types';

export async function listDeals(pipelineId: string, token?: string) {
  return apiFetch<{ data: Deal[] }>(
    `/api/deals?pipeline_id=${pipelineId}&per_page=500`,
    token ? { token } : {},
  );
}

export async function getDeal(id: string, token?: string) {
  return apiFetch<{ data: Deal }>(`/api/deals/${id}`, token ? { token } : {});
}

export async function createDeal(
  body: {
    name: string;
    value?: number;
    pipeline_id: string;
    stage_id: string;
    probability?: number;
    close_date?: string;
    contact_id?: string;
    company_id?: string;
    field_values?: Record<string, string>;
  },
  token?: string,
) {
  return apiFetch<{ data: Deal }>('/api/deals', {
    method: 'POST',
    body: JSON.stringify(body),
    ...(token ? { token } : {}),
  });
}

export async function updateDeal(
  id: string,
  body: {
    name?: string;
    value?: number;
    stage_id?: string;
    probability?: number;
    close_date?: string;
    field_values?: Record<string, string>;
  },
  token?: string,
) {
  return apiFetch<{ data: Deal }>(`/api/deals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    ...(token ? { token } : {}),
  });
}

export async function deleteDeal(id: string, token?: string) {
  return apiFetch<{ data: { id: string } }>(`/api/deals/${id}`, {
    method: 'DELETE',
    ...(token ? { token } : {}),
  });
}
```

- [ ] **Step 3: Create `src/activity.ts`**

```typescript
// packages/api-client/src/activity.ts
import { apiFetch } from './core';
import type { Activity } from '@vantage/types';

export async function listActivity(
  token: string,
  params?: {
    contact_id?: string;
    deal_id?: string;
    limit?: number;
    offset?: number;
  },
) {
  const qs = new URLSearchParams();
  if (params?.contact_id) qs.set('contact_id', params.contact_id);
  if (params?.deal_id) qs.set('deal_id', params.deal_id);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const q = qs.toString();
  return apiFetch<{ data: Activity[]; total: number; error: null }>(
    `/api/activity${q ? `?${q}` : ''}`,
    { token },
  );
}

export async function createActivity(
  token: string,
  body: { type: string; body?: string; contact_id?: string; deal_id?: string },
) {
  return apiFetch<{ data: Activity; error: null }>('/api/activity', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}
```

- [ ] **Step 4: Create `src/companies.ts`**

```typescript
// packages/api-client/src/companies.ts
import { apiFetch } from './core';
import type { Company } from '@vantage/types';

export async function listCompanies(token: string) {
  return apiFetch<{ data: Company[]; total: number; page: number; per_page: number; error: null }>(
    '/api/companies',
    { token },
  );
}

export async function createCompany(token: string, body: Partial<Company>) {
  return apiFetch<{ data: Company; error: null }>('/api/companies', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function updateCompany(token: string, id: string, body: Partial<Company>) {
  return apiFetch<{ data: Company; error: null }>(`/api/companies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/contacts.ts packages/api-client/src/deals.ts packages/api-client/src/activity.ts packages/api-client/src/companies.ts
git commit -m "feat(api-client): add contacts, deals, activity, companies modules"
```

---

### Task 4: Add `tasks.ts` and `alerts.ts`

These don't exist as lib files in the web app — they're currently inlined in page components. Create them in api-client as the canonical source.

**Files:**
- Create: `packages/api-client/src/tasks.ts`
- Create: `packages/api-client/src/alerts.ts`

- [ ] **Step 1: Create `src/tasks.ts`**

```typescript
// packages/api-client/src/tasks.ts
import { apiFetch } from './core';
import type { Task } from '@vantage/types';

export async function listTasks(
  token: string,
  params?: { status?: 'todo' | 'done'; assignee_id?: string },
) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.assignee_id) qs.set('assignee_id', params.assignee_id);
  const q = qs.toString();
  return apiFetch<{ data: Task[]; error: null }>(`/api/tasks${q ? `?${q}` : ''}`, { token });
}

export async function createTask(
  token: string,
  body: { title: string; due_date?: string; assignee_id?: string; contact_id?: string; deal_id?: string },
) {
  return apiFetch<{ data: Task; error: null }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function updateTask(
  token: string,
  id: string,
  body: { status?: 'todo' | 'done'; title?: string; due_date?: string },
) {
  return apiFetch<{ data: Task; error: null }>(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}
```

- [ ] **Step 2: Create `src/alerts.ts`**

```typescript
// packages/api-client/src/alerts.ts
import { apiFetch } from './core';
import type { Alert } from '@vantage/types';

export async function listAlerts(
  token: string,
  params?: { resolved?: boolean; severity?: string },
) {
  const qs = new URLSearchParams();
  if (params?.resolved !== undefined) qs.set('resolved', String(params.resolved));
  if (params?.severity) qs.set('severity', params.severity);
  const q = qs.toString();
  return apiFetch<{ data: Alert[]; total: number; error: null }>(
    `/api/alerts${q ? `?${q}` : ''}`,
    { token },
  );
}

export async function acknowledgeAlert(token: string, id: string) {
  return apiFetch<{ data: Alert; error: null }>(`/api/alerts/${id}/acknowledge`, {
    method: 'PATCH',
    token,
  });
}

export async function resolveAlert(token: string, id: string) {
  return apiFetch<{ data: Alert; error: null }>(`/api/alerts/${id}/resolve`, {
    method: 'PATCH',
    token,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/api-client/src/tasks.ts packages/api-client/src/alerts.ts
git commit -m "feat(api-client): add tasks and alerts modules"
```

---

### Task 5: Add `me.ts`

**Files:**
- Create: `packages/api-client/src/me.ts`

`me.ts` covers `GET /api/me` (workspace branding) and the three push token endpoints added later by the push infrastructure plan. The push token functions are defined here now so mobile can import them.

- [ ] **Step 1: Create `src/me.ts`**

```typescript
// packages/api-client/src/me.ts
import { apiFetch } from './core';
import type { User, Workspace } from '@vantage/types';

export interface MeResponse {
  data: {
    user: User;
    workspace: Workspace & { logo_url?: string | null };
  };
  error: null;
}

export async function getMe(token?: string): Promise<MeResponse> {
  return apiFetch('/api/me', token ? { token } : {});
}

export type PushPlatform = 'ios' | 'android';

export interface PushPreferences {
  alerts_critical?: boolean;
  alerts_warning?: boolean;
  tasks_due?: boolean;
  deals_assigned?: boolean;
  contacts_assigned?: boolean;
}

export async function registerPushToken(
  token: string,
  pushToken: string,
  platform: PushPlatform,
): Promise<{ data: { ok: boolean }; error: null }> {
  return apiFetch('/api/me/push-token', {
    method: 'POST',
    body: JSON.stringify({ token: pushToken, platform }),
    token,
  });
}

export async function unregisterPushToken(
  token: string,
): Promise<{ data: { ok: boolean }; error: null }> {
  return apiFetch('/api/me/push-token', { method: 'DELETE', token });
}

export async function updatePushPreferences(
  token: string,
  preferences: PushPreferences,
): Promise<{ data: { ok: boolean }; error: null }> {
  return apiFetch('/api/me/push-token', {
    method: 'PATCH',
    body: JSON.stringify({ preferences }),
    token,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/api-client/src/me.ts
git commit -m "feat(api-client): add me module with push token stubs"
```

---

### Task 6: Add `index.ts`

**Files:**
- Create: `packages/api-client/src/index.ts`

- [ ] **Step 1: Create `src/index.ts`**

```typescript
// packages/api-client/src/index.ts
export { configure, apiFetch } from './core';
export * from './contacts';
export * from './deals';
export * from './tasks';
export * from './activity';
export * from './alerts';
export * from './companies';
export * from './me';
```

- [ ] **Step 2: Commit**

```bash
git add packages/api-client/src/index.ts
git commit -m "feat(api-client): add barrel index"
```

---

### Task 7: Wire `@vantage/api-client` into the web app

The web app's existing `lib/` files become thin re-exports. No page-level imports change.

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/lib/contacts.ts`
- Modify: `apps/web/lib/deals.ts`
- Modify: `apps/web/lib/activity.ts`
- Modify: `apps/web/lib/companies.ts`

- [ ] **Step 1: Add dependency to `apps/web/package.json`**

In `apps/web/package.json`, add to `"dependencies"`:
```json
"@vantage/api-client": "workspace:*",
```

- [ ] **Step 2: Add to `transpilePackages` in `apps/web/next.config.ts`**

```typescript
// apps/web/next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@vantage/types', '@vantage/api-client'],
};

export default nextConfig;
```

- [ ] **Step 3: Update `apps/web/lib/api.ts`**

```typescript
// apps/web/lib/api.ts
// Configure the shared API client with the Next.js public env var.
// This file is imported early (via lib/contacts etc.) ensuring configure()
// runs before any fetch is made.
import { configure, apiFetch } from '@vantage/api-client';

configure(process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001');

export { apiFetch };
```

- [ ] **Step 4: Update `apps/web/lib/contacts.ts`**

```typescript
// apps/web/lib/contacts.ts
export {
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  type ContactsResponse,
  type ContactResponse,
} from '@vantage/api-client';
```

- [ ] **Step 5: Update `apps/web/lib/deals.ts`**

```typescript
// apps/web/lib/deals.ts
export {
  listDeals,
  getDeal,
  createDeal,
  updateDeal,
  deleteDeal,
} from '@vantage/api-client';
```

- [ ] **Step 6: Update `apps/web/lib/activity.ts`**

```typescript
// apps/web/lib/activity.ts
export { listActivity, createActivity } from '@vantage/api-client';
```

- [ ] **Step 7: Update `apps/web/lib/companies.ts`**

```typescript
// apps/web/lib/companies.ts
export { listCompanies, createCompany, updateCompany } from '@vantage/api-client';
```

- [ ] **Step 8: Run pnpm install to link the new package**

```bash
cd D:/Projects/Vantage
pnpm install
```

Expected: `node_modules/@vantage/api-client` symlinks to `packages/api-client`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/next.config.ts apps/web/lib/api.ts apps/web/lib/contacts.ts apps/web/lib/deals.ts apps/web/lib/activity.ts apps/web/lib/companies.ts
git commit -m "feat(web): wire @vantage/api-client, update lib re-exports"
```

---

### Task 8: Type-check and verify

- [ ] **Step 1: Type-check `packages/api-client`**

```bash
cd packages/api-client
pnpm lint
```

Expected: no errors. If you see `Cannot find module '@vantage/types'`, run `pnpm install` from the repo root first.

- [ ] **Step 2: Type-check the web app**

```bash
cd apps/web
pnpm type-check
```

Expected: no new errors. If you see `Module not found: @vantage/api-client`, verify `transpilePackages` was added to `next.config.ts` and `pnpm install` was run.

- [ ] **Step 3: Start the web dev server and smoke-test**

```bash
cd D:/Projects/Vantage
pnpm --filter web dev
```

Navigate to `/contacts`, `/deals`, `/tasks`, `/alerts` in the browser. Verify data loads normally — no console errors, no network failures.

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "chore: verify api-client extraction — web smoke test passed"
```
