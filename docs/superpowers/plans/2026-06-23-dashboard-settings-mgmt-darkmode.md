# Dashboard Settings Management & Dark Mode Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a group-to-dashboard assignment page reachable from Settings → Modules' new Dashboard gear icon, and fix the dark-mode contrast bug (hardcoded white text on a background that turns light in dark mode) across the Dashboard and Settings modules.

**Architecture:** The new feature reuses the existing `dashboard_group_assignments` many-to-many table — no migration — enforcing single-select-per-group procedurally (delete all of a group's rows, insert at most one). The contrast fix is mechanical: replace literal `'#fff'` with `'var(--bg)'` everywhere it's paired with a `'var(--text)'` background, since `--text`/`--bg` are already a correct-contrast opposite pair in both themes.

**Tech Stack:** Next.js App Router, React Query, Express, Kysely, Zod, Vitest + Supertest.

## Global Constraints

- TypeScript strict mode. No `any` types in new code.
- All API responses follow `{ data: ..., error: null }` or `{ data: null, error: { code, message } }`.
- All API routes are workspace-scoped; never query across `workspace_id`.
- No new npm dependencies.
- No schema migration for the new feature — reuse `dashboard_group_assignments` exactly as it exists today.
- Components use inline `style` objects, matching every existing file in this codebase — no CSS classes except where a global rule is explicitly called for (the new `:focus-visible` rule).
- The new Dashboard Settings page is deep-link only (not added to the `GROUPS` sub-nav array in `settings/layout.tsx`), matching the existing Pipelines/Tasks/Messaging convention exactly.

---

## File Structure

**API (new/modified):**
- `apps/api/src/routes/dashboards.ts` — add `GET /group-assignments` (must be registered before the existing `GET /:id`).
- `apps/api/src/routes/groups.ts` — add `PUT /:id/dashboard`.
- `apps/api/src/__tests__/dashboards-group-assignments.test.ts` — new.
- `apps/api/src/__tests__/groups-dashboard.test.ts` — new.

**Web — new feature:**
- `apps/web/app/(dashboard)/settings/modules/page.tsx` — add `dashboard` to `MODULE_META`.
- `apps/web/app/(dashboard)/settings/layout.tsx` — add `/settings/dashboards` to `ADMIN_ONLY_DEEP_LINKS`.
- `apps/web/app/(dashboard)/settings/dashboards/page.tsx` — new.

**Web — dark mode fix (mechanical, same change repeated):**
- `apps/web/modules/shared/components/Sidebar.tsx`
- `apps/web/modules/shared/components/ui/Button.tsx`
- `apps/web/modules/dashboard/components/CreateDashboardModal.tsx`
- `apps/web/modules/dashboard/components/DashboardHeader.tsx`
- `apps/web/modules/dashboard/components/GroupAssignModal.tsx`
- `apps/web/modules/dashboard/pages/page.tsx`
- `apps/web/app/(dashboard)/settings/(users-groups)/groups/page.tsx`
- `apps/web/app/(dashboard)/settings/(users-groups)/groups/[groupId]/page.tsx`
- `apps/web/app/(dashboard)/settings/(users-groups)/users/page.tsx`
- `apps/web/app/(dashboard)/settings/appearance/page.tsx`
- `apps/web/app/(dashboard)/settings/pipelines/page.tsx`
- `apps/web/app/(dashboard)/settings/plugins/page.tsx`
- `apps/web/app/(dashboard)/settings/plugins/[pluginId]/page.tsx`
- `apps/web/app/(dashboard)/settings/tasks/page.tsx`
- `apps/web/app/globals.css` — add `:focus-visible` rule.

---

### Task 1: `GET /api/dashboards/group-assignments`

**Files:**
- Modify: `apps/api/src/routes/dashboards.ts`
- Test: `apps/api/src/__tests__/dashboards-group-assignments.test.ts`

**Interfaces:**
- Produces: `GET /api/dashboards/group-assignments` → `{ data: { groups: Array<{ id: string; name: string; color: string; dashboard_id: string | null }>; dashboards: Array<{ id: string; name: string }> }, error: null }`. Admin-only (403 for members). Consumed by Task 4's frontend page.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/__tests__/dashboards-group-assignments.test.ts
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createDashboardsRouter } from '../routes/dashboards';

function buildApp(db: Partial<Kysely<Database>>, role: 'admin' | 'member' = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).workspace = { id: 'ws-1' };
    (req as any).user = { id: 'user-1', role };
    next();
  });
  app.use('/api/dashboards', createDashboardsRouter(db as Kysely<Database>));
  return app;
}

describe('GET /api/dashboards/group-assignments', () => {
  it('returns groups with their assigned dashboard and the full dashboard list (admin)', async () => {
    const groupRows = [
      { id: 'g1', name: 'Sales', color: '#ff0000', dashboard_id: 'd1' },
      { id: 'g2', name: 'Support', color: '#00ff00', dashboard_id: null },
    ];
    const dashboardRows = [
      { id: 'd1', name: 'Sales Overview' },
      { id: 'd2', name: 'Support Overview' },
    ];
    const db: any = {
      selectFrom: vi.fn((table: string) => {
        const chain: any = {};
        for (const f of ['leftJoin', 'where', 'select', 'orderBy', 'groupBy']) chain[f] = vi.fn(() => chain);
        chain.execute = vi.fn().mockResolvedValue(table.startsWith('groups') ? groupRows : dashboardRows);
        return chain;
      }),
    };
    const res = await request(buildApp(db)).get('/api/dashboards/group-assignments');
    expect(res.status).toBe(200);
    expect(res.body.data.groups).toEqual(groupRows);
    expect(res.body.data.dashboards).toEqual(dashboardRows);
  });

  it('returns 403 for a non-admin', async () => {
    const db: any = {};
    const res = await request(buildApp(db, 'member')).get('/api/dashboards/group-assignments');
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api test -- dashboards-group-assignments.test.ts`
Expected: FAIL — the route does not exist yet (404, not 200/403).

- [ ] **Step 3: Add the route**

In `apps/api/src/routes/dashboards.ts`, the router is mounted at `app.use('/api/dashboards', requireAuth, createDashboardsRouter(db))` (no `requireAdmin` at mount — confirmed in `apps/api/src/index.ts:268`), so this route needs its own `requireAdmin` import and use, matching the existing per-route pattern in this file (e.g. `router.post('/', requireAdmin, ...)`).

Insert the new route **immediately after the existing `POST /` handler** (which ends at line 124 with `});`) and **before** the existing `// GET /api/dashboards/:id` comment — this route must be registered before `GET /:id`, or Express would match `"group-assignments"` as the `:id` param value first:

```typescript
  // GET /api/dashboards/group-assignments — groups with their assigned dashboard, plus all dashboards [admin]
  router.get('/group-assignments', requireAdmin, async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const groups = await db
        .selectFrom('groups as g')
        .leftJoin('dashboard_group_assignments as dga', 'dga.group_id', 'g.id')
        .where('g.workspace_id', '=', workspace.id)
        .select(['g.id', 'g.name', 'g.color', 'dga.dashboard_id'])
        .orderBy('g.name', 'asc')
        .execute();

      const dashboards = await db
        .selectFrom('dashboards')
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'name'])
        .orderBy('name', 'asc')
        .execute();

      res.json({ data: { groups, dashboards }, error: null });
    } catch (err) { next(err); }
  });

```

This relies on `requireAdmin` already being imported at the top of the file (`import { requireAdmin } from '../middleware/auth';` — confirmed present at line 6).

Note: if a group has multiple assignment rows (from prior use of the per-dashboard multi-select `GroupAssignModal`), this `leftJoin` returns one row per assignment, which would duplicate that group in the result. This is acceptable for now — Task 2's save action collapses any group to exactly one assignment the first time it's saved from the new page, and duplicate rows for the same group (same `id`/`name`/`color`, different `dashboard_id`) are visually harmless in Task 4's UI (the `<select>` will just be controlled by whichever row's `dashboard_id` the frontend keys off when grouping by `id` — Task 4 handles this by deduplicating client-side, see Task 4 Step 3).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api test -- dashboards-group-assignments.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/dashboards.ts apps/api/src/__tests__/dashboards-group-assignments.test.ts
git commit -m "feat: add GET /api/dashboards/group-assignments"
```

---

### Task 2: `PUT /api/groups/:id/dashboard`

**Files:**
- Modify: `apps/api/src/routes/groups.ts`
- Test: `apps/api/src/__tests__/groups-dashboard.test.ts`

**Interfaces:**
- Produces: `PUT /api/groups/:id/dashboard` accepts `{ dashboard_id: string | null }`, returns `{ data: { group_id, dashboard_id }, error: null }`. Consumed by Task 4's frontend page.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/__tests__/groups-dashboard.test.ts
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createGroupsRouter } from '../routes/groups';

function buildApp(db: Partial<Kysely<Database>>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).workspace = { id: 'ws-1' };
    (req as any).user = { id: 'user-1', role: 'admin' };
    next();
  });
  app.use('/api/groups', createGroupsRouter(db as Kysely<Database>));
  return app;
}

describe('PUT /api/groups/:id/dashboard', () => {
  it('sets the group to exactly one dashboard', async () => {
    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({ id: 'group-1' }),
      }),
      deleteFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
      insertInto: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
      transaction: vi.fn().mockReturnValue({
        execute: vi.fn(async (cb: any) => cb(db)),
      }),
    };
    const res = await request(buildApp(db))
      .put('/api/groups/group-1/dashboard')
      .send({ dashboard_id: 'dash-1' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ group_id: 'group-1', dashboard_id: 'dash-1' });
  });

  it('clears the group dashboard when dashboard_id is null', async () => {
    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({ id: 'group-1' }),
      }),
      deleteFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
      insertInto: vi.fn(),
      transaction: vi.fn().mockReturnValue({
        execute: vi.fn(async (cb: any) => cb(db)),
      }),
    };
    const res = await request(buildApp(db))
      .put('/api/groups/group-1/dashboard')
      .send({ dashboard_id: null });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ group_id: 'group-1', dashboard_id: null });
    expect(db.insertInto).not.toHaveBeenCalled();
  });

  it('returns 404 when the group does not exist in this workspace', async () => {
    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(undefined),
      }),
    };
    const res = await request(buildApp(db))
      .put('/api/groups/missing-group/dashboard')
      .send({ dashboard_id: 'dash-1' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for an invalid body', async () => {
    const db: any = {};
    const res = await request(buildApp(db))
      .put('/api/groups/group-1/dashboard')
      .send({ dashboard_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api test -- groups-dashboard.test.ts`
Expected: FAIL — the route does not exist yet.

- [ ] **Step 3: Add the route**

In `apps/api/src/routes/groups.ts`, add a new Zod schema near the top (after `setPermissionSchema`, around line 25):

```typescript
const setGroupDashboardSchema = z.object({
  dashboard_id: z.string().uuid().nullable(),
});
```

Then insert the new route immediately after the existing `DELETE /:id` handler (which ends at line 175 with `});`) and before `// POST /api/groups/:id/members`:

```typescript
  // PUT /api/groups/:id/dashboard — set (or clear) this group's single assigned dashboard
  router.put('/:id/dashboard', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = setGroupDashboardSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }

      const group = await db
        .selectFrom('groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!group) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      if (parsed.data.dashboard_id) {
        const dashboard = await db
          .selectFrom('dashboards')
          .where('id', '=', parsed.data.dashboard_id)
          .where('workspace_id', '=', workspace.id)
          .select('id')
          .executeTakeFirst();
        if (!dashboard) {
          res.status(404).json({ data: null, error: { code: 'DASHBOARD_NOT_FOUND' } });
          return;
        }
      }

      await db.transaction().execute(async trx => {
        await trx
          .deleteFrom('dashboard_group_assignments')
          .where('group_id', '=', group.id)
          .execute();
        if (parsed.data.dashboard_id) {
          await trx
            .insertInto('dashboard_group_assignments')
            .values({ dashboard_id: parsed.data.dashboard_id, group_id: group.id })
            .execute();
        }
      });

      res.json({ data: { group_id: group.id, dashboard_id: parsed.data.dashboard_id }, error: null });
    } catch (err) { next(err); }
  });

```

No in-router admin check needed — `apps/api/src/index.ts:309` already mounts this entire router with `requireAuth, requireAdmin`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api test -- groups-dashboard.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/groups.ts apps/api/src/__tests__/groups-dashboard.test.ts
git commit -m "feat: add PUT /api/groups/:id/dashboard"
```

---

### Task 3: Wire up the gear icon and admin redirect gate

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/modules/page.tsx`
- Modify: `apps/web/app/(dashboard)/settings/layout.tsx`

**Interfaces:**
- Produces: a working gear icon link from Modules → `/settings/dashboards` (the page itself is built in Task 4), and admin-only gating for that route.

- [ ] **Step 1: Add the Dashboard module entry**

In `apps/web/app/(dashboard)/settings/modules/page.tsx`, the `MODULE_META` array currently has no `dashboard` entry at all (confirmed — it lists contacts, companies, pipelines, tasks, websites, servers, databases, analytics, activity, projects, messaging, but not dashboard). Add it as the first entry:

```typescript
const MODULE_META = [
  { id: 'dashboard', name: 'Dashboard', description: 'Custom dashboards and widget layouts.', settingsHref: '/settings/dashboards' },
  { id: 'contacts',  name: 'Contacts',  description: 'Contact management, profiles, and history.',        settingsHref: null },
```

(leave every other line in the array exactly as-is — this is a pure addition of one new object before the existing `contacts` line).

- [ ] **Step 2: Add the route to the admin-only gate**

In `apps/web/app/(dashboard)/settings/layout.tsx`, the `ADMIN_ONLY_DEEP_LINKS` array currently reads:

```typescript
const ADMIN_ONLY_DEEP_LINKS = [
  '/settings/pipelines',
  '/settings/tasks',
  '/settings/activity',
  '/settings/messaging',
];
```

Add `/settings/dashboards` to it:

```typescript
const ADMIN_ONLY_DEEP_LINKS = [
  '/settings/pipelines',
  '/settings/tasks',
  '/settings/activity',
  '/settings/messaging',
  '/settings/dashboards',
];
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no new errors attributable to either modified file (the repo has pre-existing unrelated errors elsewhere — not your concern).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/settings/modules/page.tsx" "apps/web/app/(dashboard)/settings/layout.tsx"
git commit -m "feat: add Dashboard module gear icon and admin gate for /settings/dashboards"
```

---

### Task 4: Dashboard Settings page (group → dashboard assignment)

**Files:**
- Create: `apps/web/app/(dashboard)/settings/dashboards/page.tsx`

**Interfaces:**
- Consumes: `GET /api/dashboards/group-assignments` (Task 1), `PUT /api/groups/:id/dashboard` (Task 2).

- [ ] **Step 1: Implement the page**

```typescript
// apps/web/app/(dashboard)/settings/dashboards/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface GroupRow {
  id: string;
  name: string;
  color: string;
  dashboard_id: string | null;
}

interface DashboardOption {
  id: string;
  name: string;
}

interface GroupAssignmentsResponse {
  groups: GroupRow[];
  dashboards: DashboardOption[];
}

function dedupeGroups(rows: GroupRow[]): GroupRow[] {
  const byId = new Map<string, GroupRow>();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

export default function DashboardSettingsPage() {
  const getToken = useApiToken();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-group-assignments'],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch<{ data: GroupAssignmentsResponse; error: null }>(
        '/api/dashboards/group-assignments',
        { token },
      );
      return res.data;
    },
  });

  const [selections, setSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, 'saved' | 'error' | undefined>>({});

  const groups = dedupeGroups(data?.groups ?? []);

  useEffect(() => {
    if (!data) return;
    const initial: Record<string, string> = {};
    for (const g of dedupeGroups(data.groups)) {
      initial[g.id] = g.dashboard_id ?? '';
    }
    setSelections(initial);
  }, [data]);

  async function handleSave(groupId: string) {
    setSaving(groupId);
    setFeedback(prev => ({ ...prev, [groupId]: undefined }));
    try {
      const token = await getToken();
      const value = selections[groupId] ?? '';
      await apiFetch(`/api/groups/${groupId}/dashboard`, {
        method: 'PUT',
        body: JSON.stringify({ dashboard_id: value || null }),
        token,
      });
      setFeedback(prev => ({ ...prev, [groupId]: 'saved' }));
    } catch {
      setFeedback(prev => ({ ...prev, [groupId]: 'error' }));
    } finally {
      setSaving(null);
    }
  }

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '14px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Dashboard assignments</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Choose which dashboard each group sees by default.
      </p>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <div style={{ ...card, color: 'var(--text3)', fontSize: 13 }}>
          No groups yet. Create one in{' '}
          <a href="/settings/users" style={{ color: 'var(--text)', textDecoration: 'underline' }}>
            Settings → Users &amp; Groups
          </a>
          .
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groups.map(group => {
          const unchanged = (selections[group.id] ?? '') === (group.dashboard_id ?? '');
          return (
            <div key={group.id} style={card}>
              <span
                style={{ width: 10, height: 10, borderRadius: '50%', background: group.color, flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', flex: 1, minWidth: 120 }}>
                {group.name}
              </span>
              <select
                aria-label={`Dashboard for ${group.name}`}
                value={selections[group.id] ?? ''}
                onChange={e => setSelections(prev => ({ ...prev, [group.id]: e.target.value }))}
                style={{
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: 13,
                  minWidth: 180,
                }}
              >
                <option value="">No default</option>
                {(data?.dashboards ?? []).map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <button
                onClick={() => void handleSave(group.id)}
                disabled={unchanged || saving === group.id}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--text)',
                  color: 'var(--bg)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: unchanged || saving === group.id ? 'not-allowed' : 'pointer',
                  opacity: unchanged || saving === group.id ? 0.6 : 1,
                  flexShrink: 0,
                }}
              >
                {saving === group.id ? 'Saving…' : 'Save'}
              </button>
              {feedback[group.id] === 'saved' && (
                <span style={{ fontSize: 12, color: 'var(--green)', flexShrink: 0 }}>Saved</span>
              )}
              {feedback[group.id] === 'error' && (
                <span style={{ fontSize: 12, color: 'var(--red)', flexShrink: 0 }}>Could not save</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the type-check**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no new errors attributable to this file.

- [ ] **Step 3: Manually verify**

Run: `pnpm --filter web dev`, log in as admin, visit Settings → Modules, confirm the Dashboard row now has a gear icon, click it.
Expected: lands on `/settings/dashboards`, shows one row per existing group with a dashboard dropdown, Save disabled until you change the selection, "Saved" appears after a successful save, and reloading the page shows the persisted choice.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/settings/dashboards/page.tsx"
git commit -m "feat: add Dashboard settings page for group-to-dashboard assignment"
```

---

### Task 5: Dark mode fix — shared `Sidebar` and `Button`

**Files:**
- Modify: `apps/web/modules/shared/components/Sidebar.tsx:80,104`
- Modify: `apps/web/modules/shared/components/ui/Button.tsx:8,15`

**Interfaces:**
- No signature changes — purely color-value edits.

- [ ] **Step 1: Fix `Sidebar.tsx`**

Line 80, change:
```typescript
  const fg = active ? '#fff' : hover ? 'var(--text)' : 'var(--text2)';
```
to:
```typescript
  const fg = active ? 'var(--bg)' : hover ? 'var(--text)' : 'var(--text2)';
```

Line 104 (the unread-count badge), change:
```typescript
          marginLeft: 'auto', background: 'var(--text)', color: '#fff',
```
to:
```typescript
          marginLeft: 'auto', background: 'var(--text)', color: 'var(--bg)',
```

- [ ] **Step 2: Fix `Button.tsx`**

Line 8 (the `primary` variant base), change:
```typescript
  primary:   { background: 'var(--text)',    color: '#fff',         border: '1px solid var(--text)' },
```
to:
```typescript
  primary:   { background: 'var(--text)',    color: 'var(--bg)',    border: '1px solid var(--text)' },
```

Line 15 (the `primary` hover-darken color), change:
```typescript
  primary:   '#1a2244',
```
to:
```typescript
  primary:   'var(--text2)',
```

This makes the hover state theme-aware: light mode hovers from dark navy (`--text`) to a lighter ink-blue (`--text2`, still dark enough for `var(--bg)`-colored text to stay readable); dark mode hovers from light cream (`--text`) to a dimmer light gray (`--text2`, still light enough for `var(--bg)`-colored — near-black — text to stay readable).

- [ ] **Step 3: Type-check**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no new errors attributable to either file.

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/shared/components/Sidebar.tsx apps/web/modules/shared/components/ui/Button.tsx
git commit -m "fix: correct dark-mode contrast in Sidebar and shared Button"
```

---

### Task 6: Dark mode fix — Dashboard module

**Files:**
- Modify: `apps/web/modules/dashboard/components/CreateDashboardModal.tsx:90`
- Modify: `apps/web/modules/dashboard/components/DashboardHeader.tsx:104`
- Modify: `apps/web/modules/dashboard/components/GroupAssignModal.tsx:123`
- Modify: `apps/web/modules/dashboard/pages/page.tsx:64`

**Interfaces:**
- No signature changes — purely color-value edits, same pattern as Task 5.

- [ ] **Step 1: Fix `CreateDashboardModal.tsx`**

Line 90, change:
```typescript
                color: name.trim() ? '#fff' : 'var(--text3)',
```
to:
```typescript
                color: name.trim() ? 'var(--bg)' : 'var(--text3)',
```

- [ ] **Step 2: Fix `DashboardHeader.tsx`**

Line 104, change:
```typescript
                color: '#fff',
```
to:
```typescript
                color: 'var(--bg)',
```

(this is the "Save Layout" button — confirm by checking the surrounding block has `background: 'var(--text)',` on line 103 immediately above it before editing).

- [ ] **Step 3: Fix `GroupAssignModal.tsx`**

Line 123, change:
```typescript
              color: '#fff',
```
to:
```typescript
              color: 'var(--bg)',
```

(this is the modal's "Save" button — confirm `background: 'var(--text)',` is on line 122 immediately above before editing).

- [ ] **Step 4: Fix `pages/page.tsx`**

Line 64, change:
```typescript
            color: '#fff',
```
to:
```typescript
            color: 'var(--bg)',
```

(this is the empty-state "Create Dashboard" button — confirm `background: 'var(--text)',` is on line 63 immediately above before editing).

- [ ] **Step 5: Type-check**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no new errors attributable to any of these 4 files.

- [ ] **Step 6: Commit**

```bash
git add apps/web/modules/dashboard/components/CreateDashboardModal.tsx apps/web/modules/dashboard/components/DashboardHeader.tsx apps/web/modules/dashboard/components/GroupAssignModal.tsx apps/web/modules/dashboard/pages/page.tsx
git commit -m "fix: correct dark-mode contrast across Dashboard module buttons"
```

---

### Task 7: Dark mode fix — Settings module, batch 1 (Users & Groups, Appearance)

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/(users-groups)/groups/page.tsx:79,105`
- Modify: `apps/web/app/(dashboard)/settings/(users-groups)/groups/[groupId]/page.tsx:110`
- Modify: `apps/web/app/(dashboard)/settings/(users-groups)/users/page.tsx:76`
- Modify: `apps/web/app/(dashboard)/settings/appearance/page.tsx:46`

**Interfaces:**
- No signature changes — purely color-value edits, same pattern as Task 5.

- [ ] **Step 1: Fix `groups/page.tsx`**

Line 79, change:
```typescript
          style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--text)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
```
to:
```typescript
          style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: 13, cursor: 'pointer' }}
```

Line 105, change:
```typescript
                style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--text)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
```
to:
```typescript
                style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: 13, cursor: 'pointer' }}
```

- [ ] **Step 2: Fix `groups/[groupId]/page.tsx`**

Line 110, change:
```typescript
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--text)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
```
to:
```typescript
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: 13, cursor: 'pointer' }}
```

- [ ] **Step 3: Fix `users/page.tsx`**

Line 76, change:
```typescript
          style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--text)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
```
to:
```typescript
          style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: 13, cursor: 'pointer' }}
```

- [ ] **Step 4: Fix `appearance/page.tsx`**

Line 46 — this is the literal theme-selector button named in the bug report. Change:
```typescript
                  color: theme === option ? '#fff' : 'var(--text)',
```
to:
```typescript
                  color: theme === option ? 'var(--bg)' : 'var(--text)',
```

- [ ] **Step 5: Type-check**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no new errors attributable to any of these 4 files.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(dashboard)/settings/(users-groups)/groups/page.tsx" "apps/web/app/(dashboard)/settings/(users-groups)/groups/[groupId]/page.tsx" "apps/web/app/(dashboard)/settings/(users-groups)/users/page.tsx" "apps/web/app/(dashboard)/settings/appearance/page.tsx"
git commit -m "fix: correct dark-mode contrast in Users/Groups and Appearance settings"
```

---

### Task 8: Dark mode fix — Settings module, batch 2 (Pipelines, Plugins, Tasks)

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/pipelines/page.tsx:103,104,163,164`
- Modify: `apps/web/app/(dashboard)/settings/plugins/page.tsx:107,307,451`
- Modify: `apps/web/app/(dashboard)/settings/plugins/[pluginId]/page.tsx:222`
- Modify: `apps/web/app/(dashboard)/settings/tasks/page.tsx:107`

**Interfaces:**
- No signature changes — purely color-value edits, same pattern as Task 5.

- [ ] **Step 1: Fix `pipelines/page.tsx`**

Lines 103-104, change:
```typescript
            background: addHovered ? '#1a2244' : 'var(--text)',
            color: '#fff',
```
to:
```typescript
            background: addHovered ? 'var(--text2)' : 'var(--text)',
            color: 'var(--bg)',
```

Lines 163-164, change:
```typescript
              background: !newName.trim() ? 'var(--text3)' : createHovered ? '#1a2244' : 'var(--text)',
              color: '#fff',
```
to:
```typescript
              background: !newName.trim() ? 'var(--text3)' : createHovered ? 'var(--text2)' : 'var(--text)',
              color: 'var(--bg)',
```

- [ ] **Step 2: Fix `plugins/page.tsx`**

Line 107, change:
```typescript
              background: 'var(--text)', color: '#fff', border: 'none',
```
to:
```typescript
              background: 'var(--text)', color: 'var(--bg)', border: 'none',
```

Line 307, change:
```typescript
            background: 'var(--text)', color: '#fff', border: 'none',
```
to:
```typescript
            background: 'var(--text)', color: 'var(--bg)', border: 'none',
```

Line 451, change:
```typescript
                        background: 'var(--text)', color: '#fff', border: 'none',
```
to:
```typescript
                        background: 'var(--text)', color: 'var(--bg)', border: 'none',
```

- [ ] **Step 3: Fix `plugins/[pluginId]/page.tsx`**

Line 222, change:
```typescript
                  background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8,
```
to:
```typescript
                  background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 8,
```

- [ ] **Step 4: Fix `tasks/page.tsx`**

Line 107, change:
```typescript
              style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', background: filter === f ? 'var(--text)' : 'transparent', color: filter === f ? '#fff' : 'var(--text2)', transition: 'all .15s' }}
```
to:
```typescript
              style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', background: filter === f ? 'var(--text)' : 'transparent', color: filter === f ? 'var(--bg)' : 'var(--text2)', transition: 'all .15s' }}
```

- [ ] **Step 5: Type-check**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no new errors attributable to any of these 4 files.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(dashboard)/settings/pipelines/page.tsx" "apps/web/app/(dashboard)/settings/plugins/page.tsx" "apps/web/app/(dashboard)/settings/plugins/[pluginId]/page.tsx" "apps/web/app/(dashboard)/settings/tasks/page.tsx"
git commit -m "fix: correct dark-mode contrast in Pipelines, Plugins, and Tasks settings"
```

---

### Task 9: Global `:focus-visible` style

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: a global focus-ring rule. No component changes needed to consume it — it applies automatically to every native interactive element.

- [ ] **Step 1: Add the rule**

Append to the end of `apps/web/app/globals.css` (after the existing `.db-sidebar-scroll` rule, which is currently the last rule in the file):

```css

a:focus-visible,
button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Manually verify**

Run: `pnpm --filter web dev`, open any Settings page, press Tab repeatedly.
Expected: a visible 2px outline appears around each focused interactive element as you tab through, in both light and dark mode (since it uses `var(--text)`, which is theme-correct in both). Clicking with the mouse should NOT show the ring (that's what `:focus-visible` over bare `:focus` buys you).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat: add global focus-visible outline for keyboard navigation"
```

---

### Task 10: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full API test suite**

Run: `pnpm --filter api test`
Expected: all new tests pass (Tasks 1-2, 6 tests total across the two new files). The repo has a pre-existing, unrelated baseline of failing tests (pipelines, installer, setup-db, auth, contacts-import, ssh-permission, setup-route) — confirm the failure count and specific failing test names match that pre-existing baseline exactly, with zero new failures.

- [ ] **Step 2: Type-check**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no errors attributable to any file touched in this plan (pre-existing unrelated errors elsewhere are not your concern).

- [ ] **Step 3: Manual walkthrough — new feature**

Run the dev servers, log in as admin:
1. Settings → Modules: confirm the Dashboard row has a gear icon.
2. Click it, land on `/settings/dashboards`: confirm one row per group, a dashboard dropdown, Save button.
3. Pick a dashboard for a group, save, confirm "Saved" appears and the choice persists across reload.
4. Pick "No default" for a group that had one, save, confirm it clears.
5. Visit `/settings/dashboards` as a non-admin (or check the layout's redirect logic): confirm redirect to `/settings/profile`.

- [ ] **Step 4: Manual walkthrough — dark mode contrast**

With dark mode enabled (Settings → Appearance):
1. Confirm the Appearance theme selector's active button (Light/Dark) has clearly readable text — no light-on-light.
2. Tab through the sidebar and confirm the active nav item's text is readable, and a focus ring appears on keyboard navigation.
3. Visit Settings → Users & Groups, Pipelines, Plugins, Tasks: confirm every primary/active button (Create, Save, Install, filter tabs) has readable text in dark mode.
4. Confirm hovering a primary button (e.g. "+ New pipeline") shows a visibly different, still-readable state.
5. Switch back to light mode and spot-check 2-3 of the same buttons to confirm nothing regressed there.

- [ ] **Step 5: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: regression fixes from manual walkthrough"
```

(Skip this step if the walkthrough found nothing to fix.)
