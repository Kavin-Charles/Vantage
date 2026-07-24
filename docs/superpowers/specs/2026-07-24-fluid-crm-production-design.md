# Fluid CRM — Production-Ready Pass (Design Spec)

Date: 2026-07-24
Branch: `refactor/crm-module`
Author: Kavin-Charles
Builds on: `docs/superpowers/specs/2026-07-22-fluid-crm-design.md` (original Fluid CRM),
`docs/superpowers/specs/2026-07-22-fluid-foundation-design.md` (shell + tokens).
Source of truth: `stitch_enterprise_clarity_standard_prd/` (6 mocks + `vencore_fluid/DESIGN.md`).

## Goal

Take the Fluid CRM module from "mostly built, several broken/rough screens" to **production
ready**, matching the Vencore Fluid source-of-truth mocks. Fix the shell (dock + topbar),
repair the broken per-contact page, build the missing per-company detail page, deeply
integrate Tasks into the CRM, wire up Settings access, and finish CRM module settings.

## Problems being solved (observed)

1. **Sidebar glitchy.** `FluidSidebar` hover-expands by mutating width in JS
   (`onMouseEnter`/`onMouseLeave`, 72↔232px) with labels always rendered — janky, and it
   diverges from the source (a floating, vertically-centered dock using pure-CSS hover-expand).
2. **Per-contact page broken (HTTP 500).** `GET /api/contacts/:id/overview` queries a
   nonexistent `deals` table on a nonexistent `contact_id` column
   (`relation "deals" does not exist`). Real deals live in `pipeline_items`.
3. **Per-company page missing.** No `/crm/companies/[id]` route exists; rows aren't clickable.
4. **Tasks feel bolted-on.** Standalone list wrapping legacy-styled inner components; not
   surfaced on the records tasks belong to.
5. **No way to reach Settings** from the Fluid shell; the current topbar is a glass pill with
   search/theme/New and no Settings entry.
6. **CRM settings not done** — `CrmPreferencesPanel` is a stub.
7. **General** design drift from the source mocks.

## Decisions (from brainstorm)

- **Shell — dock, not rail.** Replace `FluidSidebar` with a source-matched **floating,
  vertically-centered dock**: `fixed left-6 top-1/2 -translate-y-1/2`, collapsed `w-16`,
  `hover:w-48`, **pure-CSS** `group-hover` width transition + label opacity fade (no JS width
  mutation). Grouped nav (General/Sales/Infra/Projects/Insights) with uppercase group labels
  that also fade in on hover. Internal `overflow-y-auto` with a custom thin scrollbar so all
  items fit. Logo (`cloud_done` + "Vencore") pinned at dock top. **Dock bottom (pinned below
  the scroll area):** a Settings gear → `/settings`, and the user avatar as a button opening a
  small menu (Profile → `/settings/profile`, theme toggle, Sign out).
- **Topbar — removed.** Delete `FluidTopbar` (the glass pill). Reflow `(fluid)/layout.tsx`
  content padding to account for the floating dock (left gutter ≈ collapsed dock width + margin;
  the dock overlays on hover, content does not reflow) and restore a normal top padding.
- **Nav model.** Keep `BASE_NAV` items and groups. Tasks stays in nav (hub redesigned, not cut).
- **Per-contact.** Rewrite the overview endpoint against the real model (below). No schema
  change. Verify `ContactDetailScreen` renders. Add an embedded **Tasks** panel.
- **Per-company.** Build `/crm/companies/[id]` mirroring the contact-detail fluid layout, backed
  by a new `GET /api/companies/:id/overview`. Make company rows clickable. Add an embedded
  **Tasks** panel.
- **Tasks integration (two-way).**
  - **Contextual panels:** embed a Tasks panel on contact detail (tasks for that contact,
    `GET /api/tasks?contact_id=`) and on company detail (tasks across the company's contacts and
    deals). Each panel: list + inline toggle (done) + quick-add.
  - **Hub — complete fluid redesign.** Rebuild the standalone `/crm/tasks` screen from scratch in
    Fluid style (reuse existing data hooks/mutations only). Every task row shows and **links to
    its related contact** (`task.contact_id` → `/crm/contacts/:id`; tasks have no `deal_id`
    column, so the record link is the contact). New grouped/bento layout, glass cards,
    Space Grotesk headings, metric pills, pill filters. Retire the legacy-styled inner components
    for the Fluid hub (leave the legacy `(dashboard)` tasks module untouched).
- **Settings access.** Dock gear → `/settings`. In `/settings/modules`, every module **row shows
  a gear icon**; the CRM gear → `/settings/modules/crm` (existing `[moduleId]` page rendering the
  module's registered settings panel).
- **CRM module settings — finish.** Complete `CrmPreferencesPanel` to production quality: real
  controls, persisted via the existing module/cross-module settings mechanism, fluid styling.
- **Design consistency.** All CRM screens on Fluid tokens (glass surfaces, pill controls,
  Space Grotesk + Inter, blue `--fl-primary`), matching the six source mocks + `DESIGN.md`.

## Data model reconciliation (critical — verified against the live DB)

The original overview endpoint assumed the CLAUDE.md `Deal` table. The running app has **no
`deals` table** (dropped in an earlier records migration → HTTP 500 `relation "deals" does not
exist`). Two parallel deal models coexist mid-refactor; the plan MUST target the live one:

- **`pipeline_items` — LIVE/canonical for CRM.** The fluid pipeline board and deal create/edit
  use it via `/api/pipelines/:pipelineId/items` (`pipeline-items.ts`, `crm/pipeline/lib/items`).
  ```
  pipeline_items(id, pipeline_id, stage_id, workspace_id, position,
                 field_values jsonb, deleted_at, created_at, updated_at)
  ```
  Deal **name/value/probability/close_date** live in `field_values`
  (`field_values.name`, `.value`, `.probability`, `.close_date` — confirmed from live rows).
  **Stage name** resolves via `pipeline_stages` (join `stage_id`).
- **`pipeline_records` — DORMANT.** Has `contact_id`/`company_id` columns but is written only by
  offline scripts (`backfill-pipeline-engine.ts`, `fix-atp-stages.ts`), never by the running app,
  and read only by `analytics.ts`. Do NOT build CRM overview on it. Leave it alone.

**Deal↔contact/company linkage does not exist today** on the live model: `pipeline_items` has no
contact/company column, and `field_values` on seeded rows contains only name/value/prob/close_date
(0 rows linked). The active create path (`pipeline-items.ts`) never captures a contact/company.

### Deal-linkage change (one migration — DECIDED)

Add real linkage to the live model:

- **Migration** `packages/db/migrations/20260724_001_pipeline_items_links.ts`: add nullable
  `contact_id uuid` and `company_id uuid` columns to `pipeline_items`, each a FK
  (`contact_id → contacts(id)`, `company_id → companies(id)`), indexed. Update `PipelineItemTable`
  in `packages/db/src/schema.ts`. Never edit an existing migration.
- **Create/edit capture:** `pipeline-items.ts` create + update accept optional `contact_id` /
  `company_id` (Zod-validated) and persist them to the new columns.
- **Backfill + seed:** a backfill maps existing `pipeline_items` to a contact/company using the
  deal `name` prefix → company name (seed deal names begin with the company, e.g. "Stackline —
  Developer Plan"), and `seed-demo.ts` writes `contact_id`/`company_id` directly for new deals.
- **Overview reads:** contact/company overview query `pipeline_items WHERE contact_id = :id`
  (or `company_id`), map `{id, name: field_values.name, value: field_values.value, stage,
  stage_id}`, stage from `pipeline_stages`.

Other linkages (already present, used as-is):

- Activities: `activities` table with `contact_id` (works today).
- Tasks: `tasks` table with `contact_id` (present); `GET /api/tasks` filters by `contact_id`.
  (No `deal_id` column on the live `tasks` table — the hub links tasks to their contact, not deal.)

### New/updated endpoints

- `GET /api/contacts/:id/overview` — **fix**. Return `{ contact, deals, activities, tasks,
  metrics, stage_funnel }` where `deals` come from `pipeline_items WHERE contact_id = :id`
  (mapped to `{id, name: field_values.name, value: field_values.value, stage, stage_id}`),
  `stage` from `pipeline_stages`, `tasks` from `tasks WHERE contact_id`, and metrics recomputed
  from the mapped deals. Keep the `{ data, error }` envelope and `contacts:view` permission.
- `GET /api/companies/:id/overview` — **new**. Return `{ company, contacts, deals, activities,
  tasks, metrics }`: the company row, its contacts (`contacts WHERE company_id`), its deals
  (`pipeline_items WHERE company_id = :id`, mapped like above), recent activity (across its
  contacts), tasks across those contacts, and rolled-up metrics (total deal value, open deal
  count, contact count, last activity). Same envelope; guard with the existing companies read
  permission (`companies:view` — confirm exact string from `companies.ts`).

Both endpoints unit-tested with the existing hand-rolled Kysely mock pattern
(`apps/api/src/__tests__/contacts-overview.test.ts`) — no live DB needed for `vitest run`.

## Screen inventory & target (vs source mocks)

| Screen | Route | Source mock | Action |
|---|---|---|---|
| Shell dock | (fluid)/layout | dashboard_expandable_shell / sales_pipeline_unified_navigation | Rebuild dock, remove topbar |
| Contacts list | /crm/contacts | contact_list_fluid, contact_list_with_add_modal | Fluid audit; add-modal a11y |
| Contact detail | /crm/contacts/[id] | individual_detail_fluid | Fix overview + add Tasks panel |
| Companies list | /crm/companies | company_list_synchronized_shell | Fluid audit; clickable rows |
| Company detail | /crm/companies/[id] | (none — derive from contact detail) | Build new |
| Pipeline | /crm/pipeline | sales_pipeline_unified_navigation | Fluid audit |
| Tasks hub | /crm/tasks | (none — design fresh, fluid) | Complete redesign |
| Settings modules | /settings/modules | (settings spec) | Gear per row → module settings |
| CRM settings | /settings/modules/crm | (settings spec) | Finish `CrmPreferencesPanel` |

## Constraints (carried from prior plans)

- NEVER commit to `main`. Sole author **Kavin-Charles**; no AI/Anthropic attribution.
- Multi-tenant: every query scoped by `workspace_id`. `{ data, error }` envelope on all responses.
- Zod-validate inputs. No `any`. No `console.log` in prod paths. Kysely query builder (no raw SQL).
- Do NOT change `contacts.status` enum; Active/Lead/Dormant remain derived views.
- Route-conflict landmine: `(dashboard)/[slug]` catches one-segment top-level paths; keep CRM
  paths two-segment, and never duplicate a path across `(fluid)` and `(dashboard)`.
- **One DB migration** this pass: `20260724_001_pipeline_items_links` (adds `contact_id` /
  `company_id` FK columns to `pipeline_items`). Never modify an existing migration. Migration is
  applied to the local DB (`db:migrate` reads `apps/api/.env`) before testing overview screens.
- Verify each screen live in the browser (stack is up: web :3000, API :3001, login
  `admin@localhost` / `admin123`) and against the source mocks.
- After the work: run graphify update (`/graphify . --update`, user-invoked) per CLAUDE.md.

## Out of scope

- No changes to the legacy `(dashboard)` shell/pages beyond what routing requires.
- No new CRM data model / migrations. No analytics/integrations/public-API work.
- No pipeline board behavioral rewrite (fluid audit only).

## Success criteria

1. Dock: smooth CSS hover-expand, centered floating, grouped, scrolls, no glitch; Settings gear +
   avatar menu reachable; topbar gone; content not reflowing on hover.
2. `/crm/contacts/[id]` loads (no 500), shows deals/activity/metrics/funnel + Tasks panel.
3. `/crm/companies/[id]` loads, mirrors contact detail, shows contacts/deals/activity/tasks.
4. Tasks: redesigned fluid hub with record links; contextual task panels on contact + company
   detail with add/toggle working.
5. Settings reachable from the dock; module rows have a gear; CRM gear opens finished CRM settings.
6. All CRM screens match Fluid tokens/DESIGN.md; `pnpm -w typecheck` + `vitest run` green.
