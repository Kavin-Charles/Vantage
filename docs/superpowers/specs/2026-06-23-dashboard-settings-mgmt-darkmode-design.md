# Dashboard Settings Management & Dark Mode Contrast Fix — Design Spec

Date: 2026-06-23

## Context

Two production-readiness gaps remain in the Dashboard/Settings work:

1. There is no way to configure, from Settings, which dashboard a user group sees. The capability exists today only from the *dashboard's* side (a "Groups" button on each dashboard, backed by a real many-to-many `dashboard_group_assignments` table) — there's no group-centric view, and the Dashboard module isn't even listed on the Modules settings page, so it has no gear icon at all.
2. Dark mode (shipped in the previous plan) has a real contrast bug: several buttons set `background: 'var(--text)'` with a **hardcoded** `color: '#fff'`. In light mode `--text` is dark navy, so white text reads fine. In dark mode `--text` becomes light cream, making the "selected"/primary button render as light-text-on-light-background — exactly the user-reported symptom.

## Goals

1. Add a Dashboard Settings page (group → dashboard assignment), reached via a gear icon on the Modules settings page, matching the existing Pipelines/Tasks/Messaging gear-icon pattern exactly.
2. Fix the dark-mode contrast bug everywhere it appears within the Dashboard and Settings modules, plus the two shared components it originates from (`Sidebar.tsx`, `Button.tsx`).
3. Add a global `:focus-visible` style, since there are currently zero focus-visible styles anywhere in the app — a flat accessibility gap, not a regression.

## Non-goals

- No schema migration. The existing `dashboard_group_assignments` table already supports everything needed; this work reinterprets it as single-select per group at the UI/API layer, not the data layer.
- Not touching the existing per-dashboard `GroupAssignModal` (still multi-select, still reachable from a dashboard's own page) — the two surfaces can coexist; saving from either eventually reaches the same table.
- Not redesigning the dark palette's color values — only fixing the specific hardcoded-white-text bug and adding focus-visible support.
- Not auditing modules outside Dashboard/Settings (e.g. Pipeline board, Contacts) for the same bug pattern — out of scope per the request, though the same `Button.tsx` fix incidentally benefits every consumer of that shared component app-wide.

## A. Dashboard Settings Management

### A1. Data model (no migration)

Reuses `dashboard_group_assignments (dashboard_id, group_id)` exactly as-is. "Single-select per group" is enforced procedurally: setting a group's dashboard deletes that group's existing rows across *all* dashboards in the workspace, then inserts (at most) one new row. If a group currently has multiple assignments from prior use of the per-dashboard multi-select UI, the new page will display the first one found and saving from the new page will collapse it to one.

### A2. New backend endpoints

`apps/api/src/routes/dashboards.ts` (extend the existing router):

- `GET /api/dashboards/group-assignments` — one query joining `groups` and `dashboard_group_assignments` for the workspace, returning:
  Confirmed `apps/api/src/index.ts:268` mounts this router with only `requireAuth` (admin checks happen per-route inside the file, e.g. `router.post('/', requireAdmin, ...)`), so this new route needs an explicit `requireAdmin` middleware, matching that existing in-file pattern. It must also be registered **before** the existing `router.get('/:id', ...)` (currently the file's third route) — Express matches routes in registration order, and a literal path registered after a `:id` param route would never be reached because `/:id` would already match `"group-assignments"` as the id value first.
  ```ts
  { data: { groups: Array<{ id: string; name: string; color: string; dashboard_id: string | null }>, dashboards: DashboardSummary[] }, error: null }
  ```
- `PUT /api/groups/:groupId/dashboard` (new small addition to `apps/api/src/routes/groups.ts`) — body `{ dashboard_id: string | null }` (Zod: `z.object({ dashboard_id: z.string().uuid().nullable() })`). Validates the group belongs to the workspace and (if non-null) the dashboard belongs to the workspace, then in a transaction: deletes all `dashboard_group_assignments` rows for that `group_id`, and if `dashboard_id` is non-null, inserts one row `{ dashboard_id, group_id }`. Returns `{ data: { group_id, dashboard_id }, error: null }`. No in-router admin check needed — confirmed `apps/api/src/index.ts:309` already mounts the whole `groups.ts` router with `requireAuth, requireAdmin`, same as the existing routes in that file.

### A3. Frontend

**Modules page** (`apps/web/app/(dashboard)/settings/modules/page.tsx`): add a `dashboard` entry to `MODULE_META`:
```ts
{ id: 'dashboard', name: 'Dashboard', description: 'Custom dashboards and widget layouts.', settingsHref: '/settings/dashboards' },
```
This is the only change needed for the gear icon to appear — the existing `settingsHref &&` rendering logic already handles it.

**New page** `apps/web/app/(dashboard)/settings/dashboards/page.tsx`:
- Deep-link only (not added to the `GROUPS` sub-nav array in `settings/layout.tsx`), matching the existing Pipelines/Tasks/Messaging convention. Added to `ADMIN_ONLY_DEEP_LINKS` in that same file so non-admins are redirected away if they navigate there directly.
- Fetches `GET /api/dashboards/group-assignments` via React Query.
- Loading state: skeleton rows (reuse the `.skeleton` class from the existing dark-mode/animation work).
- Empty state: "No groups yet. Create one in Settings → Users & Groups." with a link, if `groups.length === 0`.
- One row per group: group color dot + name, a `<select>` of all dashboards plus a "No default" option, and a per-row Save button that's disabled until the selection changes from its loaded value (same `unchanged` pattern used in the Workspace settings page from the prior plan).
- Per-row inline success ("Saved") / error feedback, matching the existing Profile/Workspace/Account pages' pattern exactly — no new feedback pattern invented.
- Responsive: rows stack to full-width on narrow viewports (existing `maxWidth` + flex-wrap pattern, no new breakpoint logic needed since each row is already a simple flex row that wraps naturally).
- Accessible: native `<select>` (full keyboard/screen-reader support for free), `aria-label` on each select naming the group, Save button disabled state uses the real `disabled` attribute.

## B. Dark mode contrast fix

### B1. Root cause

`background: 'var(--text)'` + literal `color: '#fff'`. `--text` and `--bg` are already defined as a correct-contrast opposite pair in *both* themes (light: `--text` dark navy / `--bg` near-white; dark: `--text` light cream / `--bg` near-black). The fix is mechanical: replace the literal `'#fff'` with `'var(--bg)'` everywhere it's paired with a `var(--text)` background. No new CSS variables, no palette changes.

This does **not** apply to small white toggle-switch knobs (e.g. `background: '#fff'` inside a colored pill track) — those sit on `--green`/`--border`, not `--text`, and remain correctly high-contrast in both themes already.

### B2. Exact occurrences to fix

- `apps/web/modules/shared/components/Sidebar.tsx:80` — active nav-link foreground (paired with the active background two lines below, line 81's `bg = active ? 'var(--text)' : ...`).
- `apps/web/modules/shared/components/Sidebar.tsx:104` — unread-count badge pill.
- `apps/web/modules/shared/components/ui/Button.tsx:8` — `primary` variant (affects every page using `<Button variant="primary">`, including the Settings Profile/Account/Workspace Save buttons from the prior plan).
- `apps/web/modules/dashboard/components/CreateDashboardModal.tsx:90`
- `apps/web/modules/dashboard/components/DashboardHeader.tsx:104` ("Save Layout" button)
- `apps/web/modules/dashboard/components/GroupAssignModal.tsx:123` ("Save" button)
- `apps/web/modules/dashboard/pages/page.tsx:64` ("Create Dashboard" empty-state button)
- `apps/web/app/(dashboard)/settings/(users-groups)/groups/page.tsx:79,105`
- `apps/web/app/(dashboard)/settings/(users-groups)/groups/[groupId]/page.tsx:110`
- `apps/web/app/(dashboard)/settings/(users-groups)/users/page.tsx:76`
- `apps/web/app/(dashboard)/settings/appearance/page.tsx:46` — the theme selector itself, the example named in the bug report.
- `apps/web/app/(dashboard)/settings/pipelines/page.tsx:104,164`
- `apps/web/app/(dashboard)/settings/plugins/page.tsx:107,307,451`
- `apps/web/app/(dashboard)/settings/plugins/[pluginId]/page.tsx:222`
- `apps/web/app/(dashboard)/settings/tasks/page.tsx:107`

### B3. Focus-visible states (new, not a regression fix)

Add one rule to `apps/web/app/globals.css`:
```css
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, [tabindex]:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
```
Using `:focus-visible` (not bare `:focus`) means mouse clicks don't show the ring, only keyboard navigation does — standard accessibility practice, and it doesn't fight the existing `Input`/`Textarea` components' own JS-driven focus `boxShadow` (both can coexist; the outline sits outside the element's box).

### B4. Hover / disabled — already correct, verified not broken

The existing hover states (`Button.tsx`'s `HOVER_BG` map, `Sidebar.tsx`'s `hover` state, hand-rolled `onMouseEnter`/`onMouseLeave` color swaps throughout Settings pages) all reference `var(--surface2)`/`var(--text)`/`var(--text2)` — all theme-aware, none hardcoded. Disabled states use `opacity: 0.6` + `cursor: not-allowed` over already-theme-correct colors. Both verified by inspection to need no changes; called out here so the plan doesn't waste a task "fixing" things that aren't broken.

## Testing

- No new automated tests for B (CSS/contrast changes have no meaningful unit-test surface in this codebase's existing conventions — verified instead via the live preview in both themes, screenshotting the Appearance page, Sidebar, and a Settings form in dark mode).
- API tests for the two new endpoints, following the exact pattern already established in `workspace.test.ts`/`me.test.ts` (mocked Kysely, `buildApp` helper, admin-only assertion via mount-level `requireAdmin` for the new dashboards endpoint, and an in-router role check assertion for the groups endpoint since `PUT /api/groups/:groupId/dashboard` is being added to the existing `groups.ts` router which is mounted with `requireAuth, requireAdmin` already — confirm this before assuming a 403 test is even reachable, since mount-level admin gating would make an in-router check redundant; if the existing mount already enforces admin, the test simply asserts the route's success path plus input validation, not a duplicate 403 check).
- Manual verification: toggle dark mode, visit every fixed page, confirm selected/active state text is readable; tab through the Appearance toggle and a Settings nav link to confirm the focus ring appears only on keyboard navigation.

## Files touched (summary)

**API:**
- `apps/api/src/routes/dashboards.ts` — add `GET /group-assignments`.
- `apps/api/src/routes/groups.ts` — add `PUT /:groupId/dashboard`.
- `apps/api/src/__tests__/dashboards-group-assignments.test.ts` (new)
- `apps/api/src/__tests__/groups-dashboard.test.ts` (new)

**Web — new feature:**
- `apps/web/app/(dashboard)/settings/modules/page.tsx` — add `dashboard` to `MODULE_META`.
- `apps/web/app/(dashboard)/settings/dashboards/page.tsx` (new)
- `apps/web/app/(dashboard)/settings/layout.tsx` — add `/settings/dashboards` to `ADMIN_ONLY_DEEP_LINKS`.

**Web — dark mode fix:**
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
