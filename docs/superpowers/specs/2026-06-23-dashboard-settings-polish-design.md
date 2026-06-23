# Dashboard & Settings Production Polish — Design Spec

Date: 2026-06-23

## Context

The Dashboard module has a visual bug where an admin with a single dashboard sees its name rendered twice (header + tab strip). Widgets are already dynamically registered (not hardcoded), so that part of the original ask is UX polish rather than a data-layer fix.

The Settings module is not empty — it already has working tabs (Profile, Users & Groups, SSH Keys, API Keys, Modules, Plugins) plus deep-linked per-module config pages (Pipelines, Record Types, Tasks, Conversions) reached from the Modules tab. It's missing: Appearance, Notifications, Preferences, Workspace Settings, Account Settings, Security, About. This spec reorganizes the whole settings IA to fit the larger tab count and adds the missing sections.

## Goals

1. Fix the duplicate dashboard title bug.
2. Polish dashboard loading/empty states (skeletons, copy).
3. Reorganize Settings into a grouped left-hand sub-nav (current flat tab strip won't scale to 13 tabs).
4. Add missing Settings sections: Appearance (real dark/light theme), Notifications (placeholder), Preferences (placeholder), Workspace Settings (functional), Account Settings (functional), Security (placeholder), About (static).
5. Add lightweight, consistent CSS-transition polish across both modules — no new animation library.

## Non-goals

- Touching `team/page.tsx` (legacy duplicate of `users/page.tsx`) — out of scope.
- Changing how Pipelines/Record Types/Tasks/Conversions are reached (stays deep-linked from Modules tab).
- Building real notification-preference or 2FA backends — both stay UI-only with "Coming Soon" badges.
- Mobile push-token preferences (`apps/api/src/routes/push-token.ts`) are unrelated leftover infra from the removed mobile app; not reused or touched here.

## A. Dashboard fixes

### A1. Duplicate title bug

Root cause: [`DashboardTabs.tsx`](../../../apps/web/modules/dashboard/components/DashboardTabs.tsx) only hides itself when `dashboards.length <= 1 && !isAdmin` (line 14). For an admin with exactly one dashboard, the tab strip still renders, showing that dashboard's name as the lone active tab directly beneath [`DashboardHeader`](../../../apps/web/modules/dashboard/components/DashboardHeader.tsx)'s `<h1>{name}</h1>` — visually duplicating the title.

Fix: change the guard to `dashboards.length <= 1` (drop the `isAdmin` exception). The "create new dashboard" affordance (currently the `+` button in the tab strip, admin-only) moves into `DashboardHeader` itself, next to "Edit Layout", so admins can still create a second dashboard without the tab strip being forced to render.

Files touched:
- `apps/web/modules/dashboard/components/DashboardTabs.tsx` — guard condition.
- `apps/web/modules/dashboard/components/DashboardHeader.tsx` — add `onCreateNew` prop + button (admin-only, always visible, not just in edit mode).
- `apps/web/modules/dashboard/pages/[id]/page.tsx` — wire `showCreate` trigger to the header instead of `DashboardTabs`.

### A2. Loading & empty states

- Replace the plain `Loading…` text (`pages/[id]/page.tsx:121`) with a skeleton: a header-shaped bar + a grid of placeholder widget-card rectangles (shimmer animation, see Section D).
- Empty state copy/box (`pages/[id]/page.tsx:149-163`) gets an icon (reuse `Icon` component, e.g. a grid/layout icon) above the text, slightly larger touch target, and a fade-in on mount.
- `DashboardGrid`'s non-edit-mode empty state (`DashboardGrid.tsx:77-82`) gets matching icon + copy treatment for consistency.

### A3. Widget add/remove transitions

When a widget is added via `AddWidgetPanel` or removed via `WidgetCard`, the new/removed card should fade+scale rather than popping in/out abruptly. Implemented via a CSS class toggle (`widget-enter` / a `transition: opacity, transform` rule), no layout library changes — `DashboardGrid` keeps its existing grid/layout logic untouched.

## B. Settings IA restructure

### B1. Navigation shape

Replace the flat horizontal tab strip in [`settings/layout.tsx`](../../../apps/web/app/(dashboard)/settings/layout.tsx) with a grouped vertical sub-nav (similar visual weight to the main `Sidebar.tsx`, ~200px wide) on the left of the settings content area. Groups, in order:

- **Personal** (everyone): Profile, Appearance, Notifications, Preferences
- **Account** (everyone): Account, Security
- **Workspace** (admin only, entire group hidden for non-admins): Workspace, Users & Groups, Modules, Plugins, API Keys, SSH Keys
- **About** (everyone, no group header, pinned to bottom, visually separated by a divider)

Mobile/narrow-width fallback: below a breakpoint the sub-nav becomes a horizontal scrollable strip (same pattern `DashboardTabs` already uses for overflow) rather than a second sidebar — avoids building a new responsive pattern from scratch.

The existing admin-redirect effect (`layout.tsx:35-48`) is updated to include the new admin-only routes (`/settings/workspace`).

### B2. New route files

```
apps/web/app/(dashboard)/settings/
  appearance/page.tsx
  notifications/page.tsx
  preferences/page.tsx
  workspace/page.tsx
  account/page.tsx
  security/page.tsx
  about/page.tsx
```

Each follows the existing page convention seen in `profile/page.tsx`: a `max-width: 560px` column of `card`-styled sections, `h2` section title + one-line description, no `ModuleGuard` (settings isn't a toggleable module).

### B3. Section behavior

**Profile** (existing page, made functional): add an editable "Full name" field (currently read-only display, `profile/page.tsx:46-56`). Save button calls `PATCH /api/me`. Email/Role/User ID stay read-only.

**Appearance** (new, functional): light/dark theme toggle.
- Data: new `theme` column on `users` (`'light' | 'dark'`, default `'light'`), migration `packages/db/migrations/<next>_user_theme.ts`.
- API: extend `PATCH /api/me` to accept `{ name?, theme? }`.
- Frontend: new `ThemeContext` (in `modules/shared/contexts/`) that reads `user.theme` from `AuthContext`, applies `document.documentElement.dataset.theme = theme`, and exposes a `setTheme` that optimistically updates UI + calls `PATCH /api/me`. Mounted once in the root layout, above `AuthContext`'s consumers so it's available everywhere immediately (avoids a flash-of-wrong-theme by reading an initial value from `localStorage` synchronously before the API response lands, then reconciling).
- CSS: `globals.css` gets a `[data-theme="dark"]` block redefining the same variable names (`--bg`, `--surface`, `--surface2`, `--border`, `--border2`, `--text`, `--text2`, `--text3`, plus the semantic color `-bg` pairs adjusted for contrast). No component changes needed since everything already consumes these variables.

**Notifications** (new, placeholder): category list (e.g. "Critical alerts", "Deal updates", "Task reminders", "Weekly digest") each with a disabled toggle + "Coming Soon" badge. Static, no API calls.

**Preferences** (new, placeholder): example rows (default landing page, density, date format) each disabled + "Coming Soon" badge. Static, no API calls.

**Workspace** (new, functional, admin-only): edit workspace `name` and `domain`.
- API: new `apps/api/src/routes/workspace.ts` with `PATCH /api/workspace` (admin-only via existing role check pattern), mounted at `app.use('/api/workspace', requireAuth, createWorkspaceRouter(db))` in `index.ts`. Validates with Zod, updates `workspaces` table.
- Frontend: form pre-filled from `useAuth().workspace`, on save invalidates whatever query underlies `AuthContext`'s workspace data (or calls its refetch).

**Account** (new, functional): email shown read-only (it's the login identity — no email-change flow in scope) + a change-password form (current password, new password, confirm) calling a new `PATCH /api/me/password` (verifies current via `bcrypt.compare` against `password_hash`, same pattern as `auth.ts`'s login check, then re-hashes and updates).

**Security** (new, placeholder): "Two-factor authentication" and "Active sessions" rows, both disabled + "Coming Soon" badge — no 2FA columns/tables and no session table exist (JWT is stateless), so there is nothing real to wire up.

**About** (new, static): app name/version (read from root `package.json` at build time via a small constant, not a runtime fetch), links to docs/changelog/support (placeholder hrefs if not already defined elsewhere), license line.

## C. Error & loading handling

- All new functional forms (Profile name, Appearance toggle, Workspace, Account password) follow the existing mutation pattern already used elsewhere in the app: local `isSaving` state, disable submit while in flight, inline error text below the form on failure (matching `DashboardHeader`'s `isSaving` button-disable convention already in the codebase).
- Theme toggle is optimistic (UI flips immediately); if the `PATCH /api/me` call fails, revert and show a small inline error — flipping theme should never feel laggy.
- Coming-soon sections render no network calls at all, so they have no error states to handle.

## D. Visual polish (shared across both modules)

No new dependency — extend `globals.css`:
- `@keyframes shimmer` for skeleton loading blocks (dashboard widget skeletons, can also replace the plain-text loading states elsewhere in settings if convenient, but not required).
- A `.fade-in` utility class (`opacity`/`translateY` via the existing `slideDown` keyframe, reused as-is) for: settings panel switching between tabs, dashboard empty states, widget add/remove.
- "Coming Soon" badge: a small reusable inline component (`modules/shared/components/ui/ComingSoonBadge.tsx`) — pill shape using existing `--radius-pill`, muted `--surface2`/`--text3` colors, used by Notifications/Preferences/Security.
- All new interactive elements (theme toggle, save buttons, new nav items) use the existing `--motion-fast`/`--transition` tokens — no new timing values introduced.

## E. Testing

- Migration: add/verify via existing migration test pattern (`apps/api/src/__tests__/workspace-modules.test.ts` is the closest analogue) — a focused test for the new `theme` column default and `PATCH /api/me` accepting it.
- API: unit tests for `PATCH /api/me` (name/theme update, validation rejects bad theme value), `PATCH /api/me/password` (rejects wrong current password, accepts correct + rehashes), `PATCH /api/workspace` (admin-only 403 for members, updates name/domain).
- Frontend: no new test framework introduced; manual verification via the dev server (Settings nav across all groups, theme toggle persisting across reload, dashboard single/multi-dashboard tab-strip behavior) since that's the existing project convention (no component test suite currently covers Settings or Dashboard pages).

## Files touched (summary)

**API:**
- `packages/db/migrations/<next>_user_theme.ts` (new)
- `apps/api/src/routes/me.ts` (extend with PATCH)
- `apps/api/src/routes/workspace.ts` (new)
- `apps/api/src/index.ts` (mount new/extended routes)

**Web:**
- `apps/web/modules/dashboard/components/DashboardTabs.tsx`
- `apps/web/modules/dashboard/components/DashboardHeader.tsx`
- `apps/web/modules/dashboard/pages/[id]/page.tsx`
- `apps/web/modules/dashboard/components/DashboardGrid.tsx`
- `apps/web/app/(dashboard)/settings/layout.tsx` (restructure to grouped sub-nav)
- `apps/web/app/(dashboard)/settings/profile/page.tsx` (make name editable)
- `apps/web/app/(dashboard)/settings/{appearance,notifications,preferences,workspace,account,security,about}/page.tsx` (new)
- `apps/web/modules/shared/contexts/ThemeContext.tsx` (new)
- `apps/web/modules/shared/components/ui/ComingSoonBadge.tsx` (new)
- `apps/web/app/globals.css` (dark theme variables, shimmer keyframe, fade-in utility)
