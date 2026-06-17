# Pipeline Settings Redesign — Plan 1: Backend & Auth Foundations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire fine-grained pipeline permissions into the backend routes, expose resolved permissions via `/api/me`, and update the frontend auth layer so components can call `hasPermission('pipelines:stage.edit')` etc.

**Architecture:** Add 5 new permission keys to `PIPELINES_MODULE`, swap backend route guards to use them, add `description` column to the `pipelines` table, expose resolved permissions in `/api/me`, and thread `permissions: string[]` + `hasPermission()` through the frontend auth store and context.

**Tech Stack:** Kysely migrations (TypeScript), Express routers, Redux Toolkit, React context, `@vencore/modules` package.

**Spec:** `docs/superpowers/specs/2026-06-16-pipeline-settings-redesign-design.md`

---

### Task 1: Add fine-grained permissions to PIPELINES_MODULE

**Files:**
- Modify: `packages/modules/src/pipelines/index.ts`

- [ ] **Step 1: Add 5 new permission entries to the permissions array**

Open `packages/modules/src/pipelines/index.ts`. The current `permissions` array has 4 entries. Replace it:

```typescript
  permissions: [
    { key: 'pipelines:view',         label: 'View pipelines & deals',                       defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:create',       label: 'Create deals & records',                       defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:edit',         label: 'Edit deals & records',                         defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:delete',       label: 'Delete deals & records',                       defaultRoles: ['admin'] },
    { key: 'pipelines:config',       label: 'Change pipeline settings (name, description, default)', defaultRoles: ['admin'] },
    { key: 'pipelines:stage.edit',   label: 'Edit stages (rename, reorder, recolor)',       defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:stage.delete', label: 'Delete stages',                                defaultRoles: ['admin'] },
    { key: 'pipelines:field.edit',   label: 'Edit fields (rename, reorder, toggle required, edit options)', defaultRoles: ['admin', 'member'] },
    { key: 'pipelines:field.delete', label: 'Delete fields',                                defaultRoles: ['admin'] },
  ],
```

- [ ] **Step 2: Verify the module still exports correctly**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk pnpm --filter @vencore/modules build 2>&1 | tail -5
```

Expected: no TypeScript errors, build succeeds (or `"No change to compile"` style output).

- [ ] **Step 3: Commit**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk git add packages/modules/src/pipelines/index.ts
git commit -m "feat(permissions): add fine-grained pipeline stage/field/config permissions"
```

---

### Task 2: Update pipelines.ts backend route permissions

**Files:**
- Modify: `apps/api/src/routes/pipelines.ts`

- [ ] **Step 1: Replace the permission constants block**

Find the block at the top of `createPipelinesRouter` (around line 40):
```typescript
  const view   = requirePermission('pipelines:view');
  const create = requirePermission('pipelines:create');
  const edit   = requirePermission('pipelines:edit');
  const del    = requirePermission('pipelines:delete');
```

Replace with:
```typescript
  const view        = requirePermission('pipelines:view');
  const create      = requirePermission('pipelines:create');
  const edit        = requirePermission('pipelines:edit');
  const del         = requirePermission('pipelines:delete');
  const config      = requirePermission('pipelines:config');
  const stageEdit   = requirePermission('pipelines:stage.edit');
  const stageDel    = requirePermission('pipelines:stage.delete');
```

- [ ] **Step 2: Swap route guards — pipeline PATCH uses `config`**

Find:
```typescript
  // Update pipeline
  router.patch('/:id', edit, async (req, res, next) => {
```

Replace with:
```typescript
  // Update pipeline
  router.patch('/:id', config, async (req, res, next) => {
```

- [ ] **Step 3: Swap route guards — stage create/update/reorder use `stageEdit`, stage delete uses `stageDel`**

Find the stage routes. They look like:
```typescript
  router.post('/:id/stages', edit, async (req, res, next) => {
```
```typescript
  router.patch('/:id/stages/:stageId', edit, async (req, res, next) => {
```
```typescript
  router.delete('/:id/stages/:stageId', del, async (req, res, next) => {
```
```typescript
  router.post('/:id/stages/reorder', edit, async (req, res, next) => {
```

Replace with:
```typescript
  router.post('/:id/stages', stageEdit, async (req, res, next) => {
```
```typescript
  router.patch('/:id/stages/:stageId', stageEdit, async (req, res, next) => {
```
```typescript
  router.delete('/:id/stages/:stageId', stageDel, async (req, res, next) => {
```
```typescript
  router.post('/:id/stages/reorder', stageEdit, async (req, res, next) => {
```

- [ ] **Step 4: Also add `description` to `updatePipelineSchema`**

Find:
```typescript
const updatePipelineSchema = z.object({
  name: z.string().min(1).optional(),
  is_default: z.boolean().optional(),
  position: z.number().int().optional(),
});
```

Replace with:
```typescript
const updatePipelineSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  is_default: z.boolean().optional(),
  position: z.number().int().optional(),
});
```

- [ ] **Step 5: Build to check for errors**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk pnpm --filter api build 2>&1 | tail -10
```

Expected: clean compile or only unrelated warnings.

- [ ] **Step 6: Commit**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk git add apps/api/src/routes/pipelines.ts
git commit -m "feat(api): wire fine-grained stage/config permissions to pipeline routes"
```

---

### Task 3: Fix pipeline-fields.ts route permissions

**Files:**
- Modify: `apps/api/src/routes/pipeline-fields.ts`

The current file uses only `pipelines:edit` for everything, including delete — which is a bug (members who lose `pipelines:edit` but never had delete rights can still delete fields).

- [ ] **Step 1: Replace the permission constants block**

Find:
```typescript
  const view = requirePermission('pipelines:view');
  const edit = requirePermission('pipelines:edit');
```

Replace with:
```typescript
  const view      = requirePermission('pipelines:view');
  const fieldEdit = requirePermission('pipelines:field.edit');
  const fieldDel  = requirePermission('pipelines:field.delete');
```

- [ ] **Step 2: Swap route guards on all field routes**

Find:
```typescript
  // Create field
  router.post('/', edit, async (req, res, next) => {
```
Replace:
```typescript
  // Create field
  router.post('/', fieldEdit, async (req, res, next) => {
```

Find:
```typescript
  // Update field
  router.patch('/:fieldId', edit, async (req, res, next) => {
```
Replace:
```typescript
  // Update field
  router.patch('/:fieldId', fieldEdit, async (req, res, next) => {
```

Find the delete route — it currently uses `edit` (the bug):
```typescript
  router.delete('/:fieldId', edit, async (req, res, next) => {
```
Replace:
```typescript
  router.delete('/:fieldId', fieldDel, async (req, res, next) => {
```

Find the reorder route:
```typescript
  router.post('/reorder', edit, async (req, res, next) => {
```
Replace:
```typescript
  router.post('/reorder', fieldEdit, async (req, res, next) => {
```

- [ ] **Step 3: Build to confirm no errors**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk pnpm --filter api build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk git add apps/api/src/routes/pipeline-fields.ts
git commit -m "fix(api): use field.edit/field.delete permissions on field routes (fixes delete permission bug)"
```

---

### Task 4: DB migration — add description column + update schema type

**Files:**
- Create: `packages/db/migrations/20260616_001_pipeline_description.ts`
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Create the migration file**

```typescript
// packages/db/migrations/20260616_001_pipeline_description.ts
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('pipelines')
    .addColumn('description', 'text')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('pipelines')
    .dropColumn('description')
    .execute();
}
```

- [ ] **Step 2: Add `description` to `PipelineTable` in schema.ts**

Find the `PipelineTable` interface (around line 219 in `packages/db/src/schema.ts`):

```typescript
export interface PipelineTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  is_default: Generated<boolean>;
  position: Generated<number>;
  view: Generated<string>;
  table_columns: string[] | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
```

Replace with:

```typescript
export interface PipelineTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  description: string | null;
  is_default: Generated<boolean>;
  position: Generated<number>;
  view: Generated<string>;
  table_columns: string[] | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
```

- [ ] **Step 3: Run the migration**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk pnpm --filter api migrate 2>&1 | tail -10
```

Expected: `Migrated: 20260616_001_pipeline_description` or similar success output.

- [ ] **Step 4: Build db package to verify type change compiles**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk pnpm --filter @vencore/db build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk git add packages/db/migrations/20260616_001_pipeline_description.ts packages/db/src/schema.ts
git commit -m "feat(db): add description column to pipelines table"
```

---

### Task 5: Expose resolved permissions in /api/me

**Files:**
- Modify: `apps/api/src/middleware/permission.ts` (export `getEnabledModuleIds`)
- Modify: `apps/api/src/routes/me.ts` (resolve + return permissions)
- Modify: `apps/api/src/index.ts` (pass `db` to `createMeRouter`)

- [ ] **Step 1: Export `getEnabledModuleIds` from permission.ts**

Find the private function definition in `apps/api/src/middleware/permission.ts`:

```typescript
async function getEnabledModuleIds(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<string[]> {
```

Change `async function` to `export async function`:

```typescript
export async function getEnabledModuleIds(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<string[]> {
```

- [ ] **Step 2: Rewrite me.ts to resolve and return permissions**

Replace the entire contents of `apps/api/src/routes/me.ts`:

```typescript
import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { resolvePermissions, getEnabledModuleIds } from '../middleware/permission';

export function createMeRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest;

      let permissions: string[] = [];
      if (user.role === 'member') {
        const enabledModuleIds = await getEnabledModuleIds(db, workspace.id);
        const perms = await resolvePermissions(db, user.id, workspace.id, user.role, enabledModuleIds);
        permissions = [...perms];
      }

      res.json({ data: { user: { ...user, permissions }, workspace }, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
```

For admin users, `permissions` stays `[]` — the frontend checks `user.role === 'admin'` first and grants all access without needing the array.

- [ ] **Step 3: Pass `db` to `createMeRouter` in index.ts**

Find in `apps/api/src/index.ts`:
```typescript
app.use('/api/me', requireAuth, createMeRouter());
```

Replace:
```typescript
app.use('/api/me', requireAuth, createMeRouter(db));
```

- [ ] **Step 4: Build to verify**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk pnpm --filter api build 2>&1 | tail -10
```

Expected: clean compile.

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk git add apps/api/src/middleware/permission.ts apps/api/src/routes/me.ts apps/api/src/index.ts
git commit -m "feat(api): expose resolved permissions in /api/me response"
```

---

### Task 6: Update frontend auth — add permissions[] and hasPermission()

**Files:**
- Modify: `apps/web/store/auth-slice.ts`
- Modify: `apps/web/modules/shared/lib/AuthContext.tsx`

- [ ] **Step 1: Add `permissions` to `AuthUser` in auth-slice.ts**

Find the `AuthUser` interface:
```typescript
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  workspace_id: string;
}
```

Replace:
```typescript
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  workspace_id: string;
  permissions: string[];
}
```

- [ ] **Step 2: Add `hasPermission` to `AuthContext.tsx`**

Replace the entire `AuthContext.tsx`:

```typescript
'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { apiFetch } from './api';
import { setUser, clearAuth } from '@/store/auth-slice';
import type { RootState, AppDispatch } from '@/store';
import type { AuthUser } from '@/store/auth-slice';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
  hasPermission: (key: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  const token = useSelector((state: RootState) => state.auth.token);
  const user = useSelector((state: RootState) => state.auth.user);

  const isLoading = token !== null && user === null;

  const fetchUser = async () => {
    if (!token) return;
    try {
      const res = await apiFetch<{ data: { user: AuthUser } }>('/api/me', { token });
      dispatch(setUser(res.data.user));
    } catch {
      dispatch(clearAuth());
    }
  };

  useEffect(() => {
    if (token && !user) {
      void fetchUser();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', token: token ?? '' });
    } catch {
      // Ignore — clear local state regardless
    }
    dispatch(clearAuth());
    window.location.href = '/login';
  };

  const hasPermission = (key: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return (user.permissions ?? []).includes(key);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, logout, refetch: fetchUser, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk tsc --project apps/web/tsconfig.json --noEmit 2>&1 | head -30
```

Expected: no new errors (there may be pre-existing ones — ignore those, fix only new ones related to `permissions` or `hasPermission`).

- [ ] **Step 4: Commit**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk git add apps/web/store/auth-slice.ts apps/web/modules/shared/lib/AuthContext.tsx
git commit -m "feat(auth): add permissions[] and hasPermission() to frontend auth context"
```

---

### Task 7: Update pipeline client lib — add updatePipeline and description type

**Files:**
- Modify: `apps/web/modules/pipeline/lib/pipelines.ts`

- [ ] **Step 1: Add `description` to the `Pipeline` interface**

Find:
```typescript
export interface Pipeline {
  id: string;
  workspace_id: string;
  name: string;
  is_default: boolean;
  position: number;
  stages: PipelineStage[];
  fields: PipelineField[];
}
```

Replace:
```typescript
export interface Pipeline {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  position: number;
  stages: PipelineStage[];
  fields: PipelineField[];
}
```

- [ ] **Step 2: Add the `updatePipeline` client function**

After the `deletePipeline` export, add:

```typescript
export const updatePipeline = (
  token: string,
  id: string,
  body: { name?: string; description?: string; is_default?: boolean },
) =>
  apiFetch<Pipeline>(token, `/pipelines/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk tsc --project apps/web/tsconfig.json --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
cd D:/Projects/VencoreRepos/Vencore
rtk git add apps/web/modules/pipeline/lib/pipelines.ts
git commit -m "feat(pipeline): add updatePipeline client fn and description to Pipeline type"
```

---

## Done

Plan 1 complete. All backend permissions wired, DB migrated, `/api/me` returns resolved permissions, frontend auth exposes `hasPermission()`.

Next: run **Plan 2** (`2026-06-16-pipeline-settings-ui.md`) to build the UI on top of these foundations.
