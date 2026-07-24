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
    its related contact/deal** (jump to the record). New grouped/bento layout, glass cards,
    Space Grotesk headings, metric pills, pill filters. Retire the legacy-styled inner components
    for the Fluid hub (leave the legacy `(dashboard)` tasks module untouched).
- **Settings access.** Dock gear → `/settings`. In `/settings/modules`, every module **row shows
  a gear icon**; the CRM gear → `/settings/modules/crm` (existing `[moduleId]` page rendering the
  module's registered settings panel).
- **CRM module settings — finish.** Complete `CrmPreferencesPanel` to production quality: real
  controls, persisted via the existing module/cross-module settings mechanism, fluid styling.
- **Design consistency.** All CRM screens on Fluid tokens (glass surfaces, pill controls,
  Space Grotesk + Inter, blue `--fl-primary`), matching the six source mocks + `DESIGN.md`.

## Data model reconciliation (critical)

The original overview endpoint assumed the CLAUDE.md `Deal` table. The running app has **no
`deals` table**. Deals are `pipeline_items`:

```
pipeline_items(
  id uuid, pipeline_id uuid, stage_id uuid, workspace_id uuid,
  position int, field_values jsonb, deleted_at timestamptz, created_at, updated_at
)
```

- Deal **name/value** live in `field_values` (`field_values.name`, `field_values.value`),
  consistent with `crm-provider.ts` (`searchCrmRecords` reads `field_values->>'name'` / `'value'`).
- **Stage name** resolves via `pipeline_stages` (join `stage_id`).
- **Contact/Company linkage** is NOT a column — it lives in `field_values` (e.g.
  `field_values.contact_id` / `field_values.company_id`). The implementer MUST confirm the exact
  link key from seed data (`apps/api/src/lib/seed-pipeline.ts`) and the pipeline field schema
  before writing filters; do not assume a column.
- Activities: `activities` table with `contact_id` (exists and works).
- Tasks: `tasks` table with `contact_id`, `deal_id` (→ `pipeline_items.id`), `assignee_id`,
  `status`, `due_date`, `title` — `GET /api/tasks` already filters by `contact_id`/`deal_id`.

### New/updated endpoints

- `GET /api/contacts/:id/overview` — **fix**. Return `{ contact, deals, activities, tasks,
  metrics, stage_funnel }` where `deals` come from `pipeline_items` (mapped to `{id, name, value,
  stage, stage_id}`), `stage` from `pipeline_stages`, `tasks` from `tasks WHERE contact_id`, and
  metrics recomputed from the mapped deals. Keep the `{ data, error }` envelope and
  `contacts:view` permission.
- `GET /api/companies/:id/overview` — **new**. Return `{ company, contacts, deals, activities,
  tasks, metrics }`: the company row, its contacts (`contacts WHERE company_id`), its deals
  (`pipeline_items` linked to the company via `field_values` or via linked contacts — confirm from
  seed), recent activity, tasks across those contacts/deals, and rolled-up metrics (total deal
  value, open deal count, contact count, last activity). Same envelope; `companies:view` (or the
  existing companies read permission) guard.

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
- No new DB migration required for this pass (overview fixes are read-only; tasks/panels use
  existing tables).
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
