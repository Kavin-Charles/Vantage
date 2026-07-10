# Projects Revamp PR1 Foundation — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Projects a dashboard widget (the only core module without one) and apply the same mount-stagger entrance animation already used on the Tasks list (`TaskRow.tsx`) to the Projects grid and board views — no new dependency.

**Architecture:** `ProjectsWidget.tsx` follows the `ServersWidget.tsx` pattern exactly (`useApiToken` + `useQuery` + the shared `WidgetSkeleton`/`WidgetError`/`Stat`/`EmptyState` helpers), calling a new `pmApi.getWidgetStats()` method backed by the `/api/projects/widget-stats` endpoint from the backend plan (Plan 1A, Task 10). It registers centrally in `register-module-widgets.ts`, the path already used by contacts/pipeline/servers. Animation polish reuses the exact `@keyframes` + `animationDelay` per-row pattern already shipped in `apps/web/modules/tasks/components/TaskRow.tsx:118-133` — no new CSS, no new library.

**Tech Stack:** Next.js (App Router), React, `@tanstack/react-query`, inline style objects (existing convention — no CSS modules/Tailwind in this module), vitest (logic-only, no DOM).

**A note on testing:** this codebase has zero frontend component test infrastructure — no `vitest.config.ts` in `apps/web`, no `@testing-library/react`, no `.test.tsx` file anywhere in the repo. Adding that harness is out of scope for this plan (YAGNI — it would be a unilateral architecture decision affecting every future frontend PR, not something this plan should sneak in). Where a change is pure logic (the `api.ts` addition in Task 1), this plan writes a real, zero-config vitest test, mirroring how `apps/api`'s own test files run with no config file. Where a change is a React component or visual/animation behavior (Tasks 2–5), the step is a manual browser verification instead of a fabricated automated test — each step states exactly what to click and what to look for.

---

## File Structure

| File | Change |
|---|---|
| `apps/web/modules/projects/lib/api.ts` | Add `WidgetStats` type + `pmApi.getWidgetStats()` |
| `apps/web/modules/projects/lib/api.test.ts` | New file — logic test for `getWidgetStats` |
| `apps/web/modules/projects/components/ProjectsWidget.tsx` | New file |
| `apps/web/modules/shared/lib/register-module-widgets.ts` | Register `core:projects` |
| `apps/web/modules/projects/pages/ProjectsPage.tsx` | Add entrance stagger animation to the project grid |
| `apps/web/modules/projects/pages/ProjectBoardPage.tsx` | Add entrance stagger animation to board task cards |

---

### Task 1: Add `getWidgetStats` to the Projects API client

**Files:**
- Modify: `apps/web/modules/projects/lib/api.ts`
- Test: `apps/web/modules/projects/lib/api.test.ts` (new file)

- [ ] **Step 1: Write the failing test**

Create `apps/web/modules/projects/lib/api.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/modules/shared/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { pmApi } from './api';
import { apiFetch } from '@/modules/shared/lib/api';

describe('pmApi.getWidgetStats', () => {
  it('fetches /api/projects/widget-stats with the given token', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        active_projects: 3,
        at_risk_projects: 1,
        overdue_tasks: 2,
        upcoming_milestones: [],
      },
      error: null,
    });

    const result = await pmApi.getWidgetStats('token-123');

    expect(apiFetch).toHaveBeenCalledWith('/api/projects/widget-stats', { token: 'token-123' });
    expect(result.data?.active_projects).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run modules/projects/lib/api.test.ts`
Expected: FAIL — `pmApi.getWidgetStats is not a function`.

- [ ] **Step 3: Implement**

In `apps/web/modules/projects/lib/api.ts`, add the new type near the other interfaces (after `Milestone`):

```ts
export interface WidgetStats {
  active_projects: number;
  at_risk_projects: number;
  overdue_tasks: number;
  upcoming_milestones: { id: string; name: string; due_date: string; project_id: string }[];
}
```

Add the method to the `pmApi` object (alongside `listMembers`):

```ts
  getWidgetStats: (token: string) =>
    apiFetch<{ data: WidgetStats }>('/api/projects/widget-stats', { token }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run modules/projects/lib/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/modules/projects/lib/api.ts apps/web/modules/projects/lib/api.test.ts
git commit -m "feat(projects): add getWidgetStats to the projects API client"
```

---

### Task 2: Build `ProjectsWidget.tsx`

**Files:**
- Create: `apps/web/modules/projects/components/ProjectsWidget.tsx`

Follows `apps/web/modules/servers/components/ServersWidget.tsx` exactly: `useModules().isEnabled('projects')` guard, `useApiToken` + `useQuery`, `WidgetSkeleton`/`WidgetError`/`Stat`/`EmptyState` from `@/modules/shared/components/ui/WidgetHelpers`, click-through via `useRouter`.

- [ ] **Step 1: Implement**

Create `apps/web/modules/projects/components/ProjectsWidget.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { pmApi, type WidgetStats } from '@/modules/projects/lib/api';
import { WidgetSkeleton, WidgetError, Stat, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';

function MilestoneRow({
  milestone,
  last,
  onOpen,
}: {
  milestone: WidgetStats['upcoming_milestones'][number];
  last: boolean;
  onOpen: () => void;
}) {
  const dueDate = new Date(milestone.due_date);
  const isSoon = dueDate.getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000;

  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px',
        border: 'none', borderBottom: last ? 'none' : '1px solid var(--border)',
        cursor: 'pointer', borderRadius: 4, background: 'transparent', width: '100%', textAlign: 'left',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: isSoon ? 'var(--amber)' : 'var(--text3)',
      }} />
      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {milestone.name}
      </span>
      <span style={{ fontSize: 12, color: isSoon ? 'var(--amber)' : 'var(--text3)', flexShrink: 0, fontWeight: isSoon ? 600 : 400 }}>
        {dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </span>
    </button>
  );
}

export function ProjectsWidget() {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'projects'],
    queryFn: async () => pmApi.getWidgetStats(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('projects'),
  });

  if (!isEnabled('projects')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const stats: WidgetStats | undefined = data?.data;

  if (!stats || (stats.active_projects === 0 && stats.upcoming_milestones.length === 0)) {
    return <EmptyState href="/projects/new" label="Create your first project" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', gap: 20 }}>
        <Stat label="Active" value={stats.active_projects} color="var(--text)" />
        <Stat label="At risk" value={stats.at_risk_projects} color={stats.at_risk_projects > 0 ? 'var(--amber)' : 'var(--text)'} />
        <Stat label="Overdue" value={stats.overdue_tasks} color={stats.overdue_tasks > 0 ? 'var(--red)' : 'var(--text)'} />
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {stats.upcoming_milestones.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 12 }}>
            No milestones due this week
          </div>
        ) : (
          stats.upcoming_milestones.slice(0, 5).map((m, i) => (
            <MilestoneRow
              key={m.id}
              milestone={m}
              last={i === Math.min(stats.upcoming_milestones.length, 5) - 1}
              onOpen={() => router.push(`/projects/${m.project_id}/milestones`)}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

Run: `cd apps/web && pnpm dev`
Navigate to the dashboard with `ProjectsWidget` not yet registered — confirm no errors in the console from importing this file in isolation (it has no registration side-effect yet, so it won't render anywhere; this step only confirms the file compiles). Use `npx tsc --noEmit -p apps/web` to confirm no type errors.
Expected: clean compile, no console errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/components/ProjectsWidget.tsx
git commit -m "feat(projects): add ProjectsWidget dashboard component"
```

---

### Task 3: Register the widget

**Files:**
- Modify: `apps/web/modules/shared/lib/register-module-widgets.ts`

- [ ] **Step 1: Implement**

In `apps/web/modules/shared/lib/register-module-widgets.ts`, add the import:

```ts
import { ProjectsWidget } from '@/modules/projects/components/ProjectsWidget';
```

Add the registration call (after the `core:servers` block):

```ts
registerDashboardWidget({
  id: 'core:projects',
  label: 'Projects',
  description: 'Active project health and upcoming milestones',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  permission: 'projects:view',
  component: ProjectsWidget,
});
```

- [ ] **Step 2: Verify manually**

Run: `cd apps/web && pnpm dev`
Open the dashboard, click "Add Widget", confirm "Projects" appears in the list with the description "Active project health and upcoming milestones". Add it to the dashboard, confirm it renders: stat row (Active/At risk/Overdue) and a milestone list or the "Create your first project" empty state if the workspace has no projects yet. Click a milestone row and confirm it navigates to `/projects/<id>/milestones`.
Expected: widget appears in the Add Widget panel, renders without errors, navigation works.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/shared/lib/register-module-widgets.ts
git commit -m "feat(dashboard): register the Projects widget"
```

---

### Task 4: Entrance stagger animation on `ProjectsPage.tsx`

**Files:**
- Modify: `apps/web/modules/projects/pages/ProjectsPage.tsx`

`ProjectCard.tsx` already has hover polish (box-shadow/translateY/border-color transitions on `:hover`) — do not touch it. This task only wraps each card in the grid with the same per-item mount animation already used in `apps/web/modules/tasks/components/TaskRow.tsx:118-133` (`@keyframes` fade-up + `animationDelay` staggered by index, capped at 300ms).

- [ ] **Step 1: Implement**

In `apps/web/modules/projects/pages/ProjectsPage.tsx`, replace the grid block:

```tsx
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {filtered.map(p => (
                  <ProjectCard key={p.id} project={p} onClick={() => router.push(`/projects/${p.id}/tasks`)} />
                ))}
              </div>
```

with:

```tsx
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {filtered.map((p, i) => (
                  <div
                    key={p.id}
                    style={{
                      opacity: 0,
                      transform: 'translateY(6px)',
                      animation: 'projectCardFadeIn 0.2s ease forwards',
                      animationDelay: `${Math.min(i * 30, 300)}ms`,
                    }}
                  >
                    <ProjectCard project={p} onClick={() => router.push(`/projects/${p.id}/tasks`)} />
                  </div>
                ))}
                <style>{`
                  @keyframes projectCardFadeIn {
                    to { opacity: 1; transform: translateY(0); }
                  }
                `}</style>
              </div>
```

- [ ] **Step 2: Verify manually**

Run: `cd apps/web && pnpm dev`
Navigate to `/projects` with at least 4-5 projects in the workspace. Confirm cards fade up into place in a left-to-right, top-to-bottom stagger on page load (not all at once), and that hovering a card still shows the existing lift/shadow effect from `ProjectCard.tsx` unaffected by the new wrapper. Switch filter pills (All/Active/Archived/At Risk) and confirm the stagger replays on the newly filtered set.
Expected: visible staggered fade-in on load and on filter change; hover behavior unchanged.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/pages/ProjectsPage.tsx
git commit -m "feat(projects): add entrance stagger animation to the project grid"
```

---

### Task 5: Entrance stagger animation on `ProjectBoardPage.tsx`

**Files:**
- Modify: `apps/web/modules/projects/pages/ProjectBoardPage.tsx`

Same pattern, applied per-column so each column's cards stagger independently (so a column with 1 task isn't delayed by another column's 20).

- [ ] **Step 1: Implement**

In `apps/web/modules/projects/pages/ProjectBoardPage.tsx`, replace the task-card mapping block inside each column:

```tsx
                      {columnTasks.map(task => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onClick={() => void openTask(task)}
                          onDragStart={() => setDraggedTaskId(task.id)}
                        />
                      ))}
```

with:

```tsx
                      {columnTasks.map((task, i) => (
                        <div
                          key={task.id}
                          style={{
                            opacity: 0,
                            transform: 'translateY(6px)',
                            animation: 'boardCardFadeIn 0.2s ease forwards',
                            animationDelay: `${Math.min(i * 30, 300)}ms`,
                          }}
                        >
                          <TaskCard
                            task={task}
                            onClick={() => void openTask(task)}
                            onDragStart={() => setDraggedTaskId(task.id)}
                          />
                        </div>
                      ))}
                      <style>{`
                        @keyframes boardCardFadeIn {
                          to { opacity: 1; transform: translateY(0); }
                        }
                      `}</style>
```

- [ ] **Step 2: Verify manually**

Run: `cd apps/web && pnpm dev`
Navigate to a project's board view (`/projects/<id>/board`) with tasks spread across at least 2-3 statuses. Confirm each column's cards fade up in a stagger on load, independently per column. Drag a card to a different column and confirm the drag-and-drop behavior still works (the new wrapper div must not interfere with the existing `draggable`/`onDragStart` on `TaskCard` itself, since `draggable` stays on the inner `TaskCard`'s root div, not the new wrapper).
Expected: staggered fade-in per column; drag-and-drop unaffected.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/pages/ProjectBoardPage.tsx
git commit -m "feat(projects): add entrance stagger animation to board task cards"
```

---

## Self-Review

**Spec coverage:** Dashboard widget (Task 2, 3) ✅ — matches the design spec's "rich stat-card style like the recent Tasks widget revamp" via the `Stat`/`WidgetHelpers` components and a milestone list. Animation polish (Task 4, 5) ✅ — explicitly reuses the existing CSS-transition approach with no new dependency, per the locked scope decision. `ProjectCard.tsx` hover polish is correctly left untouched since it already exists; this plan only adds the missing entrance/mount animation, not a hover redo.

**Placeholder scan:** No TBD/similar-to-task-N patterns. Every step has complete, runnable code.

**Type consistency:** `WidgetStats` (Task 1) field names (`active_projects`, `at_risk_projects`, `overdue_tasks`, `upcoming_milestones[].{id,name,due_date,project_id}`) match exactly what Plan 1A's Task 10 (`project-widget-stats.ts`) returns in its `{ data: {...} }` envelope. `pmApi.getWidgetStats(token)` (Task 1) matches the call site in `ProjectsWidget.tsx` (Task 2). `useModules().isEnabled('projects')` matches the module id `'projects'` used throughout `packages/modules/src/projects/index.ts`. `permission: 'projects:view'` (Task 3) matches the existing permission key defined in that same module file.

**Dependency note:** This plan deliberately introduces zero new npm packages (no `@testing-library/react`, no animation library) — consistent with both the design spec's "no new dependency" constraint and YAGNI, given the repo's existing total absence of a frontend test harness.
