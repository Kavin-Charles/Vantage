# CRM Module Merge — Design

**Date:** 2026-07-12
**Branch:** `feat/crm-module` (off `origin/development`)
**Status:** Approved

## Goal

Merge the four CRM-related modules — `contacts`, `companies`, `pipelines`, `tasks` — into a single `crm` module: one registry definition, one workspace toggle, one sidebar entry at `/crm` with tabbed sub-pages, physically merged web code. The `activity` module stays separate.

## Decisions (user-confirmed)

| Question | Decision |
|---|---|
| Merge depth | Full merge including web code directories |
| Modules merged | contacts, companies, pipelines, tasks (activity excluded) |
| Routes | `/crm/*` with permanent redirects from old paths, plus a `/crm` overview landing page |
| Toggle migration | `crm` enabled only if ALL four old modules were enabled |
| Base branch | `development` (sidebar grouping already merged there, PR #76) |
| Route approach | Real nested routes with shared CRM layout (approach A) |

## Current state (on development)

- `packages/modules/src/{contacts,companies,pipelines,tasks}` each export a `ModuleDefinition` with granular permissions, nav items, `apiPrefixes`, workers.
- `pipelines` is the largest: nav `/pipeline` + `/items`; apiPrefixes `/deals /pipelines /stages /items /item-groups /conversions /record-types /records`. Note: the `/items` nav entry is dangling — no `app/(dashboard)/items` route exists and `BUILTIN_ITEM_KEYS` omits it; item UI lives inside the pipeline pages.
- `tasks` has worker `task-due-notifier`.
- Sidebar layout is DB-driven (`workspace_sidebar_groups`, `user_sidebar_prefs`); item keys are nav hrefs. `BUILTIN_ITEM_KEYS` and the seed `Sales` group reference `/pipeline /contacts /companies /tasks /activity`.
- Per-module toggles live in `workspace_modules`, keyed by `module_id`.
- User permission rows store granular keys (`contacts:view`, `pipelines:stage.edit`, ...).
- Web pages live in `apps/web/app/(dashboard)/{pipeline,contacts,companies,tasks}`; feature code in `apps/web/modules/{pipeline,contacts,companies,tasks}`.

## Design

### 1. Module registry (`packages/modules`)

- New `packages/modules/src/crm/index.ts` exporting `CRM_MODULE`:
  - `id: 'crm'`, `name: 'CRM'`, `icon: 'Kanban'`, `defaultEnabled: true`.
  - `permissions`: union of the four modules' permission lists, **keys unchanged** (`contacts:view`, `companies:edit`, `pipelines:config`, `tasks:delete`, ...). No `user_permissions` data migration needed.
  - `nav: [{ label: 'CRM', path: '/crm', icon: 'Kanban' }]` — single entry. The dangling `/items` nav entry from `pipelines` is dropped, not carried over.
  - `apiPrefixes`: union — `/contacts /companies /deals /pipelines /stages /items /item-groups /conversions /record-types /records /tasks`.
  - `workers: ['task-due-notifier']`, `emitsActivity: true`.
- Remove `contacts/`, `companies/`, `pipelines/`, `tasks/` directories from `packages/modules/src`; `MODULE_REGISTRY` lists `CRM_MODULE` in their place. `MODULE_IDS` shrinks accordingly.
- `getModuleForPermission('contacts:view')` now returns `'crm'`; permission checks keep working because keys are unchanged.

### 2. DB migration (`packages/db/migrations`, one new file)

- `workspace_modules`: for each workspace, insert row `module_id = 'crm'` with `enabled = AND` over the four old rows (a missing row counts as that module's `defaultEnabled`); then delete the four old rows.
- `workspace_sidebar_groups.item_keys`: in each group, replace the first occurrence among `/pipeline /contacts /companies /tasks` with `/crm` at that position and remove the remaining ones.
- `user_sidebar_prefs` pinned keys: same replace-first-and-dedupe rewrite.
- No table shape changes. Never modify existing migration files.

### 3. API (`apps/api`)

- Route files unchanged (`routes/contacts.ts`, `routes/deals.ts`, `routes/tasks.ts`, ...). Module middleware resolves prefixes via the registry, so `/deals` etc. now map to `crm` automatically.
- `apps/api/src/lib/sidebar-layout.ts`:
  - `BUILTIN_ITEM_KEYS`: remove `/pipeline /contacts /companies /tasks`, add `/crm`.
  - Seed `Sales` group becomes `['/crm', '/activity']`.
- Update affected API tests.

### 4. Web routes (`apps/web/app/(dashboard)`)

- New `crm/layout.tsx`: tab bar — Overview | Pipeline | Contacts | Companies | Tasks. Tabs filtered by the user's permissions. Styling per `_design` tokens.
- Move existing page directories under `crm/`: `crm/pipeline`, `crm/contacts`, `crm/companies`, `crm/tasks`, preserving dynamic segments (`[pipelineId]`, `[id]` etc.).
- New `crm/page.tsx` overview: read-only compact cards — pipeline value by stage, tasks due this week, recently added contacts, recent CRM activity — each linking into its tab. Uses existing API endpoints only; no new API routes.
- `next.config.ts` permanent redirects: `/pipeline → /crm/pipeline`, `/contacts → /crm/contacts`, `/companies → /crm/companies`, `/tasks → /crm/tasks`, plus `/:path*` variants for nested paths (e.g. `/contacts/:id → /crm/contacts/:id`, `/pipeline/:pipelineId → /crm/pipeline/:pipelineId`).

### 5. Web code merge (`apps/web/modules`)

- Physically move `apps/web/modules/{pipeline,contacts,companies,tasks}` to `apps/web/modules/crm/{pipeline,contacts,companies,tasks}`. Update import paths (`@/modules/crm/contacts/...`). No logic rewrites.
- All `ModuleGuard` / `useModules().isEnabled` checks for `pipelines`, `contacts`, `companies`, `tasks` become checks for `crm`.
- Internal `<Link>` hrefs pointing at old paths updated to `/crm/*`.

### 6. Settings UI

- Modules settings page shows a single "CRM" toggle in place of the four.
- Permission management shows one CRM section containing all granular keys, visually grouped by sub-area (Contacts, Companies, Pipeline, Tasks).

### 7. Testing

- API (vitest): migration helpers — AND-derivation of the toggle, `item_keys` rewrite (first-occurrence replace + dedupe); sidebar seed/merge with new keys; module middleware resolving `crm` for `/deals`, `/contacts`, `/tasks`.
- Web: no component-test harness — verify via preview tools: sidebar shows single CRM item, tabs render and route, old URLs redirect, `/crm` overview loads, disabling `crm` hides nav and blocks API prefixes.

## Out of scope

- `activity` module — untouched, stays in sidebar.
- Permission key renames — keys stay as-is.
- API URL changes — all endpoint paths unchanged.
- Plugins — unaffected.
- Any new CRM features beyond the `/crm` overview page.
