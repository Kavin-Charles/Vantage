# Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-configurable drag-and-drop dashboard at `/dashboard` where admins create named dashboards, place widgets from modules and plugins, assign dashboards to user groups, and enforce per-widget permissions server-side.

**Architecture:** DB-backed dashboards with a `dashboard_layouts` table for RGL positions. API filters layout rows by user permissions before returning. Frontend merges a static module widget registry with runtime plugin widgets into one unified picker.

**Tech Stack:** Next.js 16 App Router, Express, Kysely, PostgreSQL, react-grid-layout, Zod, TanStack Query, React 19

---

## File Map

**Create:**
- `packages/db/migrations/20260610_001_dashboards.ts`
- `packages/db/src/schema.ts` — add 3 table interfaces + Database entries
- `apps/api/src/routes/dashboards.ts`
- `apps/web/modules/shared/lib/dashboard-registry.ts`
- `apps/web/modules/dashboard/lib/dashboard-api.ts`
- `apps/web/modules/dashboard/components/WidgetCard.tsx`
- `apps/web/modules/dashboard/components/DashboardGrid.tsx`
- `apps/web/modules/dashboard/components/AddWidgetPanel.tsx`
- `apps/web/modules/dashboard/components/DashboardHeader.tsx`
- `apps/web/modules/dashboard/components/GroupAssignModal.tsx`
- `apps/web/modules/dashboard/components/CreateDashboardModal.tsx`
- `apps/web/modules/dashboard/pages/page.tsx`
- `apps/web/modules/dashboard/pages/[id]/page.tsx`
- `apps/web/app/(dashboard)/dashboard/page.tsx`
- `apps/web/app/(dashboard)/dashboard/[id]/page.tsx`

**Modify:**
- `apps/api/src/index.ts` — mount dashboards router
- `apps/web/modules/shared/components/Sidebar.tsx` — add Dashboard nav item
- `vencore-plugin-sdk/packages/plugin-sdk/src/react.ts` — add `registerDashboardWidget` to `VencoreFrontendAPI`
- `vencore-plugin-sdk/packages/plugin-sdk/src/frontend.ts` — implement it in `VencoreFrontendImpl`
- `apps/web/modules/shared/contexts/PluginRuntimeContext.tsx` — listen for `vencore:dashboard:register-widget` event, expose `useDashboardWidgets`

---

## Task 1: Feature Branch

- [ ] **Step 1: Create branch**

```bash
cd /d/Projects/VencoreRepos/Vencore
git checkout -b feat/dashboard
```

Expected: `Switched to a new branch 'feat/dashboard'`

---

## Task 2: DB Migration

**Files:**
- Create: `packages/db/migrations/20260610_001_dashboards.ts`
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Write the migration**

Create `packages/db/migrations/20260610_001_dashboards.ts`:

```typescript
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('dashboards')
    .addColumn('id', 'uuid', col =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('name', sql`varchar(255)`, col => col.notNull())
    .addColumn('created_by', 'uuid', col =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('created_at', 'timestamptz', col =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', col =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('dashboards_workspace_id_idx')
    .on('dashboards')
    .columns(['workspace_id'])
    .execute();

  await db.schema
    .createTable('dashboard_layouts')
    .addColumn('id', 'uuid', col =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('dashboard_id', 'uuid', col =>
      col.notNull().references('dashboards.id').onDelete('cascade'),
    )
    .addColumn('widget_id', sql`varchar(255)`, col => col.notNull())
    .addColumn('x', 'integer', col => col.notNull())
    .addColumn('y', 'integer', col => col.notNull())
    .addColumn('w', 'integer', col => col.notNull())
    .addColumn('h', 'integer', col => col.notNull())
    .addColumn('min_w', 'integer')
    .addColumn('min_h', 'integer')
    .addColumn('permission_key', sql`varchar(255)`)
    .execute();

  await db.schema
    .createIndex('dashboard_layouts_dashboard_id_idx')
    .on('dashboard_layouts')
    .columns(['dashboard_id'])
    .execute();

  await db.schema
    .createTable('dashboard_group_assignments')
    .addColumn('dashboard_id', 'uuid', col =>
      col.notNull().references('dashboards.id').onDelete('cascade'),
    )
    .addColumn('group_id', 'uuid', col =>
      col.notNull().references('groups.id').onDelete('cascade'),
    )
    .execute();

  await db.schema
    .createIndex('dashboard_group_assignments_pk')
    .on('dashboard_group_assignments')
    .columns(['dashboard_id', 'group_id'])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('dashboard_group_assignments').execute();
  await db.schema.dropTable('dashboard_layouts').execute();
  await db.schema.dropTable('dashboards').execute();
}
```

- [ ] **Step 2: Add table interfaces to `packages/db/src/schema.ts`**

Open `packages/db/src/schema.ts`. Add these interfaces before the `Database` interface:

```typescript
export interface DashboardTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  created_by: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DashboardLayoutTable {
  id: Generated<string>;
  dashboard_id: string;
  widget_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  min_w: number | null;
  min_h: number | null;
  permission_key: string | null;
}

export interface DashboardGroupAssignmentTable {
  dashboard_id: string;
  group_id: string;
}
```

- [ ] **Step 3: Register in `Database` interface**

Inside the `Database` interface (around line 684), add:

```typescript
  dashboards: DashboardTable;
  dashboard_layouts: DashboardLayoutTable;
  dashboard_group_assignments: DashboardGroupAssignmentTable;
```

- [ ] **Step 4: Add convenience types** (add below the existing `export type Group = ...` lines)

```typescript
export type Dashboard = Selectable<DashboardTable>;
export type NewDashboard = Insertable<DashboardTable>;
export type DashboardLayout = Selectable<DashboardLayoutTable>;
```

- [ ] **Step 5: Verify migration runs**

```bash
cd /d/Projects/VencoreRepos/Vencore
pnpm --filter @vencore/db build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/20260610_001_dashboards.ts packages/db/src/schema.ts
git commit -m "feat(db): add dashboards, dashboard_layouts, and dashboard_group_assignments tables"
```

---

## Task 3: Backend — Dashboard API Router

**Files:**
- Create: `apps/api/src/routes/dashboards.ts`

- [ ] **Step 1: Create the router**

Create `apps/api/src/routes/dashboards.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/auth';
import { resolvePermissions } from '../middleware/permission';

const createDashboardSchema = z.object({
  name: z.string().min(1).max(100),
});

const renameDashboardSchema = z.object({
  name: z.string().min(1).max(100),
});

const layoutWidgetSchema = z.object({
  widget_id: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
  min_w: z.number().int().min(1).nullable().optional(),
  min_h: z.number().int().min(1).nullable().optional(),
  permission_key: z.string().nullable().optional(),
});

const saveLayoutSchema = z.object({
  widgets: z.array(layoutWidgetSchema),
});

const assignGroupsSchema = z.object({
  group_ids: z.array(z.string().uuid()),
});

async function getUserGroupIds(
  db: Kysely<Database>,
  userId: string,
  workspaceId: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom('group_members')
    .where('user_id', '=', userId)
    .where('workspace_id', '=', workspaceId)
    .select('group_id')
    .execute();
  return rows.map(r => r.group_id);
}

async function canAccessDashboard(
  db: Kysely<Database>,
  dashboardId: string,
  userId: string,
  workspaceId: string,
  role: 'admin' | 'member',
): Promise<boolean> {
  if (role === 'admin') return true;
  const groupIds = await getUserGroupIds(db, userId, workspaceId);
  if (groupIds.length === 0) return false;
  const row = await db
    .selectFrom('dashboard_group_assignments')
    .where('dashboard_id', '=', dashboardId)
    .where('group_id', 'in', groupIds)
    .select('dashboard_id')
    .executeTakeFirst();
  return !!row;
}

export function createDashboardsRouter(db: Kysely<Database>): Router {
  const router = Router();

  // GET /api/dashboards — list dashboards visible to current user
  router.get('/', async (req, res, next) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest;

      if (user.role === 'admin') {
        const dashboards = await db
          .selectFrom('dashboards')
          .where('workspace_id', '=', workspace.id)
          .selectAll()
          .orderBy('created_at', 'asc')
          .execute();
        return res.json({ data: dashboards, error: null });
      }

      const groupIds = await getUserGroupIds(db, user.id, workspace.id);
      if (groupIds.length === 0) return res.json({ data: [], error: null });

      const assigned = await db
        .selectFrom('dashboard_group_assignments')
        .where('group_id', 'in', groupIds)
        .select('dashboard_id')
        .execute();
      const ids = [...new Set(assigned.map(r => r.dashboard_id))];
      if (ids.length === 0) return res.json({ data: [], error: null });

      const dashboards = await db
        .selectFrom('dashboards')
        .where('workspace_id', '=', workspace.id)
        .where('id', 'in', ids)
        .selectAll()
        .orderBy('created_at', 'asc')
        .execute();
      res.json({ data: dashboards, error: null });
    } catch (err) { next(err); }
  });

  // POST /api/dashboards — create dashboard [admin]
  router.post('/', requireAdmin, async (req, res, next) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createDashboardSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
      }
      const dashboard = await db
        .insertInto('dashboards')
        .values({
          workspace_id: workspace.id,
          name: parsed.data.name,
          created_by: user.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      res.status(201).json({ data: dashboard, error: null });
    } catch (err) { next(err); }
  });

  // GET /api/dashboards/:id — get dashboard + layout + groups (permission-filtered)
  router.get('/:id', async (req, res, next) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest;
      const { id } = req.params as { id: string };

      const dashboard = await db
        .selectFrom('dashboards')
        .where('id', '=', id)
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .executeTakeFirst();
      if (!dashboard) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
      }

      const canAccess = await canAccessDashboard(db, id, user.id, workspace.id, user.role);
      if (!canAccess) {
        return res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
      }

      let layoutRows = await db
        .selectFrom('dashboard_layouts')
        .where('dashboard_id', '=', id)
        .selectAll()
        .execute();

      if (user.role !== 'admin') {
        const enabledModuleIds = (
          await db
            .selectFrom('workspace_modules')
            .where('workspace_id', '=', workspace.id)
            .where('enabled', '=', true)
            .select('module_id')
            .execute()
        ).map(r => r.module_id);

        const userPerms = await resolvePermissions(
          db,
          user.id,
          workspace.id,
          user.role,
          enabledModuleIds,
        );
        layoutRows = layoutRows.filter(
          row => row.permission_key === null || userPerms.has(row.permission_key),
        );
      }

      const groups = await db
        .selectFrom('dashboard_group_assignments')
        .where('dashboard_id', '=', id)
        .select('group_id')
        .execute();

      res.json({
        data: {
          ...dashboard,
          layout: layoutRows,
          group_ids: groups.map(g => g.group_id),
        },
        error: null,
      });
    } catch (err) { next(err); }
  });

  // PUT /api/dashboards/:id — rename dashboard [admin]
  router.put('/:id', requireAdmin, async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const parsed = renameDashboardSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
      }
      const dashboard = await db
        .updateTable('dashboards')
        .set({ name: parsed.data.name, updated_at: new Date() })
        .where('id', '=', id)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!dashboard) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
      }
      res.json({ data: dashboard, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/dashboards/:id — delete dashboard [admin]
  router.delete('/:id', requireAdmin, async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      await db
        .deleteFrom('dashboards')
        .where('id', '=', id)
        .where('workspace_id', '=', workspace.id)
        .execute();
      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  // PUT /api/dashboards/:id/layout — replace all layout rows [admin]
  router.put('/:id/layout', requireAdmin, async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { id } = req.params as { id: string };

      const exists = await db
        .selectFrom('dashboards')
        .where('id', '=', id)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!exists) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
      }

      const parsed = saveLayoutSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
      }

      await db.transaction().execute(async trx => {
        await trx.deleteFrom('dashboard_layouts').where('dashboard_id', '=', id).execute();
        if (parsed.data.widgets.length > 0) {
          await trx
            .insertInto('dashboard_layouts')
            .values(
              parsed.data.widgets.map(w => ({
                dashboard_id: id,
                widget_id: w.widget_id,
                x: w.x,
                y: w.y,
                w: w.w,
                h: w.h,
                min_w: w.min_w ?? null,
                min_h: w.min_h ?? null,
                permission_key: w.permission_key ?? null,
              })),
            )
            .execute();
        }
      });

      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  // PUT /api/dashboards/:id/groups — set group assignments [admin]
  router.put('/:id/groups', requireAdmin, async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { id } = req.params as { id: string };

      const exists = await db
        .selectFrom('dashboards')
        .where('id', '=', id)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!exists) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
      }

      const parsed = assignGroupsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
      }

      await db.transaction().execute(async trx => {
        await trx
          .deleteFrom('dashboard_group_assignments')
          .where('dashboard_id', '=', id)
          .execute();
        if (parsed.data.group_ids.length > 0) {
          await trx
            .insertInto('dashboard_group_assignments')
            .values(parsed.data.group_ids.map(gid => ({ dashboard_id: id, group_id: gid })))
            .execute();
        }
      });

      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/dashboards.ts
git commit -m "feat(api): add dashboard routes (CRUD, layout save, group assignment)"
```

---

## Task 4: Mount Router in API

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add import**

In `apps/api/src/index.ts`, find the import block near the other route imports and add:

```typescript
import { createDashboardsRouter } from './routes/dashboards';
```

- [ ] **Step 2: Mount the router**

After the line `app.use('/api/alerts', requireAuth, createAlertsRouter(db));`, add:

```typescript
app.use('/api/dashboards', requireAuth, createDashboardsRouter(db));
```

- [ ] **Step 3: Verify the API compiles**

```bash
cd /d/Projects/VencoreRepos/Vencore
pnpm --filter @vencore/api build
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): mount /api/dashboards router"
```

---

## Task 5: Frontend — Widget Registry

**Files:**
- Create: `apps/web/modules/shared/lib/dashboard-registry.ts`

- [ ] **Step 1: Create the registry**

Create `apps/web/modules/shared/lib/dashboard-registry.ts`:

```typescript
import type React from 'react';

export interface DashboardWidgetDef {
  id: string;
  label: string;
  description?: string;
  defaultW: number;
  defaultH: number;
  minW?: number;
  minH?: number;
  permission?: string;
  component: React.ComponentType;
}

const _registry: DashboardWidgetDef[] = [];

export function registerDashboardWidget(def: DashboardWidgetDef): void {
  if (_registry.some(d => d.id === def.id)) return;
  _registry.push(def);
}

export function getDashboardWidgets(): DashboardWidgetDef[] {
  return _registry;
}

export function getDashboardWidgetById(id: string): DashboardWidgetDef | undefined {
  return _registry.find(d => d.id === id);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/modules/shared/lib/dashboard-registry.ts
git commit -m "feat(web): add static dashboard widget registry for built-in modules"
```

---

## Task 6: Frontend — Dashboard API Client

**Files:**
- Create: `apps/web/modules/dashboard/lib/dashboard-api.ts`

- [ ] **Step 1: Create the client**

Create `apps/web/modules/dashboard/lib/dashboard-api.ts`:

```typescript
const API = process.env['NEXT_PUBLIC_API_URL'] ?? '';

export interface DashboardSummary {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LayoutWidget {
  id: string;
  dashboard_id: string;
  widget_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  min_w: number | null;
  min_h: number | null;
  permission_key: string | null;
}

export interface DashboardDetail extends DashboardSummary {
  layout: LayoutWidget[];
  group_ids: string[];
}

export interface SaveLayoutWidget {
  widget_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  min_w?: number | null;
  min_h?: number | null;
  permission_key?: string | null;
}

async function authFetch(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}

export async function listDashboards(token: string): Promise<DashboardSummary[]> {
  const res = await authFetch('/api/dashboards', token);
  const body = (await res.json()) as { data: DashboardSummary[] };
  return body.data ?? [];
}

export async function getDashboard(id: string, token: string): Promise<DashboardDetail> {
  const res = await authFetch(`/api/dashboards/${id}`, token);
  const body = (await res.json()) as { data: DashboardDetail };
  return body.data;
}

export async function createDashboard(name: string, token: string): Promise<DashboardSummary> {
  const res = await authFetch('/api/dashboards', token, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  const body = (await res.json()) as { data: DashboardSummary };
  return body.data;
}

export async function renameDashboard(id: string, name: string, token: string): Promise<void> {
  await authFetch(`/api/dashboards/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export async function deleteDashboard(id: string, token: string): Promise<void> {
  await authFetch(`/api/dashboards/${id}`, token, { method: 'DELETE' });
}

export async function saveLayout(
  id: string,
  widgets: SaveLayoutWidget[],
  token: string,
): Promise<void> {
  await authFetch(`/api/dashboards/${id}/layout`, token, {
    method: 'PUT',
    body: JSON.stringify({ widgets }),
  });
}

export async function assignGroups(
  id: string,
  group_ids: string[],
  token: string,
): Promise<void> {
  await authFetch(`/api/dashboards/${id}/groups`, token, {
    method: 'PUT',
    body: JSON.stringify({ group_ids }),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/modules/dashboard/lib/dashboard-api.ts
git commit -m "feat(web): add dashboard API client"
```

---

## Task 7: Install react-grid-layout + WidgetCard + DashboardGrid

**Files:**
- Create: `apps/web/modules/dashboard/components/WidgetCard.tsx`
- Create: `apps/web/modules/dashboard/components/DashboardGrid.tsx`

- [ ] **Step 1: Install react-grid-layout**

```bash
cd /d/Projects/VencoreRepos/Vencore/apps/web
pnpm add react-grid-layout
pnpm add -D @types/react-grid-layout
```

Expected: packages added to `apps/web/package.json`.

- [ ] **Step 2: Create WidgetCard**

Create `apps/web/modules/dashboard/components/WidgetCard.tsx`:

```tsx
'use client';

import React from 'react';

interface Props {
  widgetId: string;
  label: string;
  isEditMode: boolean;
  onRemove?: (widgetId: string) => void;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

class WidgetErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 13 }}>
          Widget unavailable
        </div>
      );
    }
    return this.props.children;
  }
}

export function WidgetCard({ widgetId, label, isEditMode, onRemove, children }: Props) {
  return (
    <div
      style={{
        height: '100%',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {isEditMode && (
        <div
          className="drag-handle"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: 'var(--surface2)',
            borderBottom: '1px solid var(--border)',
            cursor: 'grab',
            userSelect: 'none',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
          {onRemove && (
            <button
              onClick={() => onRemove(widgetId)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text3)',
                fontSize: 16,
                lineHeight: 1,
                padding: '0 2px',
              }}
              aria-label="Remove widget"
            >
              ×
            </button>
          )}
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto', padding: isEditMode ? 12 : 16 }}>
        <React.Suspense
          fallback={
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading…</div>
          }
        >
          <WidgetErrorBoundary>{children}</WidgetErrorBoundary>
        </React.Suspense>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create DashboardGrid**

Create `apps/web/modules/dashboard/components/DashboardGrid.tsx`:

```tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { WidgetCard } from './WidgetCard';
import { getDashboardWidgetById, type DashboardWidgetDef } from '@/modules/shared/lib/dashboard-registry';
import type { LayoutWidget } from '../lib/dashboard-api';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface Props {
  layoutRows: LayoutWidget[];
  isEditMode: boolean;
  pluginWidgets: Map<string, DashboardWidgetDef>;
  onLayoutChange?: (widgets: LayoutWidget[]) => void;
  onRemoveWidget?: (widgetId: string) => void;
}

function resolveWidget(widgetId: string, pluginWidgets: Map<string, DashboardWidgetDef>): DashboardWidgetDef | undefined {
  return getDashboardWidgetById(widgetId) ?? pluginWidgets.get(widgetId);
}

function toRglLayout(rows: LayoutWidget[]): Layout[] {
  return rows.map(r => ({
    i: r.widget_id,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    minW: r.min_w ?? 2,
    minH: r.min_h ?? 2,
  }));
}

export function DashboardGrid({ layoutRows, isEditMode, pluginWidgets, onLayoutChange, onRemoveWidget }: Props) {
  const [layout, setLayout] = useState<Layout[]>(() => toRglLayout(layoutRows));

  useEffect(() => {
    setLayout(toRglLayout(layoutRows));
  }, [layoutRows]);

  function handleLayoutChange(newLayout: Layout[]) {
    setLayout(newLayout);
    if (!onLayoutChange) return;
    const updated: LayoutWidget[] = newLayout.map(l => {
      const original = layoutRows.find(r => r.widget_id === l.i);
      return {
        id: original?.id ?? '',
        dashboard_id: original?.dashboard_id ?? '',
        widget_id: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        min_w: l.minW ?? null,
        min_h: l.minH ?? null,
        permission_key: original?.permission_key ?? null,
      };
    });
    onLayoutChange(updated);
  }

  if (layoutRows.length === 0 && !isEditMode) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text3)', fontSize: 14 }}>
        No widgets on this dashboard.
      </div>
    );
  }

  return (
    <ResponsiveGridLayout
      layouts={{ lg: layout }}
      breakpoints={{ lg: 1200, md: 996, sm: 768 }}
      cols={{ lg: 12, md: 10, sm: 6 }}
      rowHeight={80}
      isDraggable={isEditMode}
      isResizable={isEditMode}
      onLayoutChange={handleLayoutChange}
      draggableHandle=".drag-handle"
      style={{ minHeight: isEditMode ? 400 : undefined }}
    >
      {layoutRows.map(row => {
        const def = resolveWidget(row.widget_id, pluginWidgets);
        if (!def) {
          return (
            <div key={row.widget_id}>
              <WidgetCard widgetId={row.widget_id} label="Unknown widget" isEditMode={isEditMode} onRemove={onRemoveWidget}>
                <span style={{ fontSize: 13, color: 'var(--text3)' }}>Plugin not installed</span>
              </WidgetCard>
            </div>
          );
        }
        return (
          <div key={row.widget_id}>
            <WidgetCard widgetId={row.widget_id} label={def.label} isEditMode={isEditMode} onRemove={onRemoveWidget}>
              <def.component />
            </WidgetCard>
          </div>
        );
      })}
    </ResponsiveGridLayout>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/dashboard/components/WidgetCard.tsx apps/web/modules/dashboard/components/DashboardGrid.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add WidgetCard and DashboardGrid components with react-grid-layout"
```

---

## Task 8: Admin Components

**Files:**
- Create: `apps/web/modules/dashboard/components/AddWidgetPanel.tsx`
- Create: `apps/web/modules/dashboard/components/GroupAssignModal.tsx`
- Create: `apps/web/modules/dashboard/components/CreateDashboardModal.tsx`
- Create: `apps/web/modules/dashboard/components/DashboardHeader.tsx`

- [ ] **Step 1: Create AddWidgetPanel**

Create `apps/web/modules/dashboard/components/AddWidgetPanel.tsx`:

```tsx
'use client';

import { getDashboardWidgets, type DashboardWidgetDef } from '@/modules/shared/lib/dashboard-registry';

interface Props {
  open: boolean;
  onClose: () => void;
  currentWidgetIds: Set<string>;
  pluginWidgets: Map<string, DashboardWidgetDef>;
  onAdd: (def: DashboardWidgetDef) => void;
}

export function AddWidgetPanel({ open, onClose, currentWidgetIds, pluginWidgets, onAdd }: Props) {
  if (!open) return null;

  const moduleWidgets = getDashboardWidgets().filter(d => !currentWidgetIds.has(d.id));
  const pluginList = [...pluginWidgets.values()].filter(d => !currentWidgetIds.has(d.id));
  const available = [...moduleWidgets, ...pluginList];

  return (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: 320,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15 }}>Add Widget</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)' }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {available.length === 0 && (
          <p style={{ padding: '20px', color: 'var(--text3)', fontSize: 13 }}>
            All available widgets are already on the dashboard.
          </p>
        )}
        {available.map(def => (
          <button
            key={def.id}
            onClick={() => onAdd(def)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{def.label}</div>
            {def.description && (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{def.description}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create GroupAssignModal**

Create `apps/web/modules/dashboard/components/GroupAssignModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface Group {
  id: string;
  name: string;
  color: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  currentGroupIds: string[];
  onSave: (groupIds: string[]) => void;
}

export function GroupAssignModal({ open, onClose, currentGroupIds, onSave }: Props) {
  const getToken = useApiToken();
  const [selected, setSelected] = useState<Set<string>>(new Set(currentGroupIds));

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const res = await apiFetch<{ data: Group[] }>('/api/groups', { token: await getToken() });
      return res.data ?? [];
    },
    enabled: open,
  });

  if (!open) return null;

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.3)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 12,
          padding: 24,
          width: 400,
          boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Assign to Groups</h3>
        <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 20 }}>
          {groups.length === 0 && (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>No groups found. Create groups in Settings → Groups.</p>
          )}
          {groups.map(g => (
            <label
              key={g.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 0',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(g.id)}
                onChange={() => toggle(g.id)}
              />
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: g.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 14 }}>{g.name}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave([...selected]); onClose(); }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--text)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create CreateDashboardModal**

Create `apps/web/modules/dashboard/components/CreateDashboardModal.tsx`:

```tsx
'use client';

import { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function CreateDashboardModal({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState('');

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim());
    setName('');
    onClose();
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.3)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 12,
          padding: 24,
          width: 360,
          boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>New Dashboard</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Dashboard name"
            autoFocus
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 14,
              marginBottom: 16,
              background: 'var(--surface)',
              color: 'var(--text)',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'none',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: name.trim() ? 'var(--text)' : 'var(--border)',
                color: name.trim() ? '#fff' : 'var(--text3)',
                cursor: name.trim() ? 'pointer' : 'not-allowed',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create DashboardHeader**

Create `apps/web/modules/dashboard/components/DashboardHeader.tsx`:

```tsx
'use client';

interface Props {
  name: string;
  isAdmin: boolean;
  isEditMode: boolean;
  onToggleEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onOpenGroupAssign: () => void;
  onAddWidget: () => void;
  isSaving: boolean;
}

export function DashboardHeader({
  name,
  isAdmin,
  isEditMode,
  onToggleEdit,
  onSave,
  onCancel,
  onOpenGroupAssign,
  onAddWidget,
  isSaving,
}: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 28px 16px',
        borderBottom: isEditMode ? '2px dashed var(--border)' : 'none',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: 22,
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          color: 'var(--text)',
        }}
      >
        {name}
      </h1>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {isAdmin && isEditMode && (
          <>
            <button
              onClick={onAddWidget}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              + Add Widget
            </button>
            <button
              onClick={onOpenGroupAssign}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text2)',
              }}
            >
              Groups
            </button>
            <button
              onClick={onCancel}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text2)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--text)',
                color: '#fff',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              {isSaving ? 'Saving…' : 'Save Layout'}
            </button>
          </>
        )}
        {isAdmin && !isEditMode && (
          <button
            onClick={onToggleEdit}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            Edit Layout
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/modules/dashboard/components/
git commit -m "feat(web): add dashboard admin components (AddWidgetPanel, GroupAssignModal, CreateDashboardModal, DashboardHeader)"
```

---

## Task 9: Dashboard Pages + App Routes

**Files:**
- Create: `apps/web/modules/dashboard/pages/page.tsx`
- Create: `apps/web/modules/dashboard/pages/[id]/page.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/page.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/[id]/page.tsx`

- [ ] **Step 1: Create redirect page** `apps/web/modules/dashboard/pages/page.tsx`

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listDashboards } from '../lib/dashboard-api';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { CreateDashboardModal } from '../components/CreateDashboardModal';
import { useState } from 'react';
import { createDashboard } from '../lib/dashboard-api';

export function DashboardIndexPage() {
  const router = useRouter();
  const getToken = useApiToken();
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);

  const { data: dashboards, isLoading, refetch } = useQuery({
    queryKey: ['dashboards'],
    queryFn: async () => listDashboards(await getToken()),
  });

  useEffect(() => {
    if (!isLoading && dashboards && dashboards.length > 0) {
      router.replace(`/dashboard/${dashboards[0]!.id}`);
    }
  }, [isLoading, dashboards, router]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>
        Loading…
      </div>
    );
  }

  if (dashboards && dashboards.length > 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        color: 'var(--text3)',
      }}
    >
      <p style={{ fontSize: 15, margin: 0 }}>
        {user?.role === 'admin'
          ? 'No dashboards yet.'
          : 'No dashboards have been assigned to your groups.'}
      </p>
      {user?.role === 'admin' && (
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: '9px 20px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--text)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Create Dashboard
        </button>
      )}
      <CreateDashboardModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={async name => {
          const token = await getToken();
          const d = await createDashboard(name, token);
          await refetch();
          router.push(`/dashboard/${d.id}`);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create main dashboard page** `apps/web/modules/dashboard/pages/[id]/page.tsx`

```tsx
'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  getDashboard,
  saveLayout,
  assignGroups,
  type LayoutWidget,
  type SaveLayoutWidget,
} from '../../lib/dashboard-api';
import { DashboardHeader } from '../../components/DashboardHeader';
import { DashboardGrid } from '../../components/DashboardGrid';
import { AddWidgetPanel } from '../../components/AddWidgetPanel';
import { GroupAssignModal } from '../../components/GroupAssignModal';
import { useDashboardWidgets } from '@/modules/shared/contexts/PluginRuntimeContext';
import type { DashboardWidgetDef } from '@/modules/shared/lib/dashboard-registry';

interface Props {
  dashboardId: string;
}

export function DashboardPage({ dashboardId }: Props) {
  const getToken = useApiToken();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const pluginWidgets = useDashboardWidgets();
  const isAdmin = user?.role === 'admin';

  const [isEditMode, setIsEditMode] = useState(false);
  const [pendingLayout, setPendingLayout] = useState<LayoutWidget[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [showGroupAssign, setShowGroupAssign] = useState(false);

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard', dashboardId],
    queryFn: async () => getDashboard(dashboardId, await getToken()),
  });

  const currentLayout = pendingLayout ?? dashboard?.layout ?? [];
  const currentWidgetIds = new Set(currentLayout.map(r => r.widget_id));

  function handleToggleEdit() {
    setIsEditMode(true);
    setPendingLayout(dashboard?.layout ?? []);
  }

  function handleCancel() {
    setIsEditMode(false);
    setPendingLayout(null);
  }

  async function handleSave() {
    if (!pendingLayout) return;
    setIsSaving(true);
    try {
      const token = await getToken();
      const widgets: SaveLayoutWidget[] = pendingLayout.map(r => ({
        widget_id: r.widget_id,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        min_w: r.min_w,
        min_h: r.min_h,
        permission_key: r.permission_key,
      }));
      await saveLayout(dashboardId, widgets, token);
      await queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
      setIsEditMode(false);
      setPendingLayout(null);
    } finally {
      setIsSaving(false);
    }
  }

  function handleAddWidget(def: DashboardWidgetDef) {
    const newRow: LayoutWidget = {
      id: '',
      dashboard_id: dashboardId,
      widget_id: def.id,
      x: 0,
      y: Infinity,
      w: def.defaultW,
      h: def.defaultH,
      min_w: def.minW ?? null,
      min_h: def.minH ?? null,
      permission_key: def.permission ?? null,
    };
    setPendingLayout(prev => [...(prev ?? currentLayout), newRow]);
    setShowAddWidget(false);
  }

  function handleRemoveWidget(widgetId: string) {
    setPendingLayout(prev => (prev ?? currentLayout).filter(r => r.widget_id !== widgetId));
  }

  async function handleGroupSave(groupIds: string[]) {
    const token = await getToken();
    await assignGroups(dashboardId, groupIds, token);
    await queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
  }

  if (isLoading || !dashboard) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <DashboardHeader
        name={dashboard.name}
        isAdmin={isAdmin}
        isEditMode={isEditMode}
        onToggleEdit={handleToggleEdit}
        onSave={handleSave}
        onCancel={handleCancel}
        onOpenGroupAssign={() => setShowGroupAssign(true)}
        onAddWidget={() => setShowAddWidget(true)}
        isSaving={isSaving}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 24px' }}>
        {isEditMode && currentLayout.length === 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 200,
              border: '2px dashed var(--border)',
              borderRadius: 12,
              color: 'var(--text3)',
              fontSize: 14,
            }}
          >
            Click "+ Add Widget" to add your first widget.
          </div>
        )}
        <DashboardGrid
          layoutRows={currentLayout}
          isEditMode={isEditMode}
          pluginWidgets={pluginWidgets}
          onLayoutChange={rows => setPendingLayout(rows)}
          onRemoveWidget={handleRemoveWidget}
        />
      </div>

      <AddWidgetPanel
        open={showAddWidget}
        onClose={() => setShowAddWidget(false)}
        currentWidgetIds={currentWidgetIds}
        pluginWidgets={pluginWidgets}
        onAdd={handleAddWidget}
      />

      <GroupAssignModal
        open={showGroupAssign}
        onClose={() => setShowGroupAssign(false)}
        currentGroupIds={dashboard.group_ids}
        onSave={handleGroupSave}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create app route files**

Create `apps/web/app/(dashboard)/dashboard/page.tsx`:

```tsx
import { DashboardIndexPage } from '@/modules/dashboard/pages/page';

export default function Page() {
  return <DashboardIndexPage />;
}
```

Create `apps/web/app/(dashboard)/dashboard/[id]/page.tsx`:

```tsx
import { DashboardPage } from '@/modules/dashboard/pages/[id]/page';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <DashboardPage dashboardId={id} />;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/dashboard/pages/ apps/web/app/\(dashboard\)/dashboard/
git commit -m "feat(web): add dashboard pages and app routes"
```

---

## Task 10: Sidebar Navigation

**Files:**
- Modify: `apps/web/modules/shared/components/Sidebar.tsx`

- [ ] **Step 1: Add Dashboard to NAV_GROUPS**

In `apps/web/modules/shared/components/Sidebar.tsx`, find the `NAV_GROUPS` array. Find the `General` group (the one with `analytics` and `alerts`) and add a Dashboard item **before** `analytics`:

```typescript
{ href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
```

The updated General group items should look like:
```typescript
items: [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/analytics', label: 'Analytics', icon: 'analytics', moduleId: 'analytics', featureKey: 'analytics' as const },
  { href: '/alerts',    label: 'Alerts',    icon: 'alerts',    featureKey: 'alerts' as const, dot: true },
  { href: '/settings',  label: 'Settings',  icon: 'settings' },
],
```

Note: The Dashboard item has no `moduleId` guard — it is always visible to all authenticated users (the API handles access control).

- [ ] **Step 2: Add `dashboard` to the Icon component**

Check `apps/web/modules/shared/components/ui/Icon.tsx` to see if a `dashboard` icon name is already defined. If not, add a simple grid icon. Open the file and look for the icon map. Add:

```typescript
dashboard: (
  <svg viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="1" width="6" height="6" rx="1.5" />
    <rect x="9" y="1" width="6" height="6" rx="1.5" />
    <rect x="1" y="9" width="6" height="6" rx="1.5" />
    <rect x="9" y="9" width="6" height="6" rx="1.5" />
  </svg>
),
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/shared/components/Sidebar.tsx apps/web/modules/shared/components/ui/Icon.tsx
git commit -m "feat(web): add Dashboard entry to sidebar navigation"
```

---

## Task 11: Plugin SDK — registerDashboardWidget

**Files:**
- Modify: `vencore-plugin-sdk/packages/plugin-sdk/src/react.ts`
- Modify: `vencore-plugin-sdk/packages/plugin-sdk/src/frontend.ts`

- [ ] **Step 1: Extend VencoreFrontendAPI in `react.ts`**

In `vencore-plugin-sdk/packages/plugin-sdk/src/react.ts`, add the `registerDashboardWidget` method to the `VencoreFrontendAPI` interface, after `registerPanel`:

```typescript
registerDashboardWidget(
  def: {
    id: string;
    label: string;
    description?: string;
    defaultW: number;
    defaultH: number;
    minW?: number;
    minH?: number;
    permission?: string;
  },
  component: AnyComponent,
): void;
```

- [ ] **Step 2: Implement in `frontend.ts`**

In `vencore-plugin-sdk/packages/plugin-sdk/src/frontend.ts`, find the `registerWidget` method in `VencoreFrontendImpl` and add `registerDashboardWidget` alongside it:

```typescript
registerDashboardWidget(
  def: {
    id: string;
    label: string;
    description?: string;
    defaultW: number;
    defaultH: number;
    minW?: number;
    minH?: number;
    permission?: string;
  },
  component: AnyComponent,
): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('vencore:dashboard:register-widget', { detail: { def, component } }),
    );
  }
}
```

- [ ] **Step 3: Rebuild the SDK**

```bash
cd /d/Projects/VencoreRepos/vencore-plugin-sdk
pnpm --filter @vencore/plugin-sdk build
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit (in plugin-sdk repo)**

```bash
git add packages/plugin-sdk/src/react.ts packages/plugin-sdk/src/frontend.ts
git commit -m "feat(sdk): add registerDashboardWidget to VencoreFrontendAPI"
```

---

## Task 12: PluginRuntimeContext — Wire Dashboard Widgets

**Files:**
- Modify: `apps/web/modules/shared/contexts/PluginRuntimeContext.tsx`

- [ ] **Step 1: Add dashboardWidgets state and event listener**

In `apps/web/modules/shared/contexts/PluginRuntimeContext.tsx`:

1. Import `DashboardWidgetDef` at the top:

```typescript
import type { DashboardWidgetDef } from '@/modules/shared/lib/dashboard-registry';
```

2. Add `dashboardWidgets` to the context type and provider. Find where `PluginRuntimeCtx` is defined and add to its value type:

```typescript
dashboardWidgets: Map<string, DashboardWidgetDef>;
```

3. In `PluginRuntimeProvider`, add state after the existing `registry` useState:

```typescript
const [dashboardWidgets, setDashboardWidgets] = useState<Map<string, DashboardWidgetDef>>(new Map());
```

4. In the `useEffect` that sets up plugin loading, add an event listener for dashboard widget registration:

```typescript
function handleDashboardWidget(e: Event) {
  const { def, component } = (e as CustomEvent<{ def: Omit<DashboardWidgetDef, 'component'>; component: AnyComponent }>).detail;
  setDashboardWidgets(prev => new Map(prev).set(def.id, { ...def, component }));
}
window.addEventListener('vencore:dashboard:register-widget', handleDashboardWidget);
// Return cleanup: add to existing cleanup return
```

Make sure to remove the listener in the cleanup (alongside any other cleanup already in the useEffect return).

5. Add `dashboardWidgets` to the context value passed to the Provider.

6. Export a `useDashboardWidgets` hook at the bottom of the file:

```typescript
export function useDashboardWidgets(): Map<string, DashboardWidgetDef> {
  const ctx = useContext(PluginRuntimeCtx);
  if (!ctx) throw new Error('useDashboardWidgets must be used inside PluginRuntimeProvider');
  return ctx.dashboardWidgets;
}
```

- [ ] **Step 2: Verify the app compiles**

```bash
cd /d/Projects/VencoreRepos/Vencore
pnpm --filter @vencore/web type-check
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/shared/contexts/PluginRuntimeContext.tsx
git commit -m "feat(web): wire vencore:dashboard:register-widget event to PluginRuntimeContext"
```

---

## Task 13: Dashboard Switcher

Users with multiple dashboards need a way to navigate between them. Add a tab bar below `DashboardHeader` that lists all accessible dashboards.

**Files:**
- Create: `apps/web/modules/dashboard/components/DashboardTabs.tsx`
- Modify: `apps/web/modules/dashboard/pages/[id]/page.tsx`

- [ ] **Step 1: Create DashboardTabs**

Create `apps/web/modules/dashboard/components/DashboardTabs.tsx`:

```tsx
'use client';

import Link from 'next/link';
import type { DashboardSummary } from '../lib/dashboard-api';

interface Props {
  dashboards: DashboardSummary[];
  currentId: string;
  onCreateNew?: () => void;
  isAdmin: boolean;
}

export function DashboardTabs({ dashboards, currentId, onCreateNew, isAdmin }: Props) {
  if (dashboards.length <= 1 && !isAdmin) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 28px',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
      }}
    >
      {dashboards.map(d => {
        const active = d.id === currentId;
        return (
          <Link
            key={d.id}
            href={`/dashboard/${d.id}`}
            style={{
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--text)' : 'var(--text2)',
              borderBottom: active ? '2px solid var(--text)' : '2px solid transparent',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {d.name}
          </Link>
        );
      })}
      {isAdmin && onCreateNew && (
        <button
          onClick={onCreateNew}
          style={{
            padding: '10px 12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text3)',
            fontSize: 18,
            lineHeight: 1,
            flexShrink: 0,
          }}
          aria-label="New dashboard"
        >
          +
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrate into DashboardPage**

In `apps/web/modules/dashboard/pages/[id]/page.tsx`:

1. Add imports:
```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listDashboards, createDashboard } from '../../lib/dashboard-api';
import { DashboardTabs } from '../../components/DashboardTabs';
import { CreateDashboardModal } from '../../components/CreateDashboardModal';
import { useRouter } from 'next/navigation';
```

2. Add state and query inside the component (after existing useState lines):
```typescript
const router = useRouter();
const [showCreate, setShowCreate] = useState(false);

const { data: allDashboards = [] } = useQuery({
  queryKey: ['dashboards'],
  queryFn: async () => listDashboards(await getToken()),
});
```

3. Add `DashboardTabs` and `CreateDashboardModal` to the JSX, between `DashboardHeader` and the main content div:

```tsx
<DashboardTabs
  dashboards={allDashboards}
  currentId={dashboardId}
  isAdmin={isAdmin}
  onCreateNew={isAdmin ? () => setShowCreate(true) : undefined}
/>

<CreateDashboardModal
  open={showCreate}
  onClose={() => setShowCreate(false)}
  onCreate={async name => {
    const token = await getToken();
    const d = await createDashboard(name, token);
    await queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    router.push(`/dashboard/${d.id}`);
  }}
/>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/dashboard/components/DashboardTabs.tsx apps/web/modules/dashboard/pages/\[id\]/page.tsx
git commit -m "feat(web): add dashboard tab switcher with create new button"
```

---

## Task 14: Final Type Check + Verification

- [ ] **Step 1: Type-check everything**

```bash
cd /d/Projects/VencoreRepos/Vencore
pnpm --filter @vencore/web type-check
pnpm --filter @vencore/api build
pnpm --filter @vencore/db build
```

All three should complete with no errors.

- [ ] **Step 2: Run migration against a dev database**

```bash
cd /d/Projects/VencoreRepos/Vencore
pnpm --filter @vencore/db migrate
```

Expected: migration `20260610_001_dashboards` applied successfully.

- [ ] **Step 3: Manual smoke test**

Start the dev servers and navigate to `/dashboard`. Verify:
- Redirects to empty state for users with no dashboards
- Admin sees "Create Dashboard" button
- Creating a dashboard and adding a widget works
- Layout save/cancel cycle works
- Group assignment modal shows groups

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: dashboard feature complete"
```
