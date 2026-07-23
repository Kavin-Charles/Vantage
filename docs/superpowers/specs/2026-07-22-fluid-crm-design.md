# Vencore Fluid — Spec 2: CRM

**Date:** 2026-07-22
**Status:** Draft (awaiting review)
**Part:** 2 of 3 — Foundation (spec 1) → **CRM** → Settings (spec 3)
**Depends on:** Spec 1 (Foundation) — `(fluid)` shell, tokens, primitives, registries, hosts.

## Context

Rebuild the CRM module's presentation in the **Vencore Fluid** design language, consuming the
Foundation from spec 1. Data/logic layer is reused; the schema and API are **extended** where
the new design needs data the current model lacks (per the "old design must not cap features"
constraint). Other modules are untouched.

CRM screens in scope (from the redesign HTML): **Contacts list**, **Add-Contact modal**,
**Contact (individual) detail**, **Companies list** (+ company detail), **Pipeline** (kanban),
**Tasks**, **Activity** feed. The Dashboard belongs to the General module and is out of scope
(only its shell/bento chrome comes from Foundation).

## Existing data/API to reuse

- **Types:** `packages/types/src/index.ts` — `Contact`, `Company`, `Deal`, `Task`, `Activity`.
- **DB:** `packages/db/src/schema.ts`, migrations in `packages/db/migrations` (never edit
  existing migrations; add new ones).
- **API:** `apps/api/src/routes/contacts.ts` (+ `routes/v1/contacts.ts` public), `companies.ts`,
  `contact-tags.ts`; deals via pipeline items. All Zod-validated, `{data,error}` envelope,
  `requireWorkspace` scoped.
- **Web data hooks:** `modules/crm/{contacts,companies,pipeline,tasks}/lib/*` (react-query /
  RTK). Pipeline: `listItems/createItem/getItem/updateItem/moveItem/getItemActivity`.

## Current model vs redesign — gap analysis

| Screen | Design shows | In model today? | Action |
|---|---|---|---|
| Contacts list | Name **& Role/title**, Company, email+phone, Status, **Last Activity** (note + time), Actions | `Contact` has no `title`; has `last_contacted_at` but no activity note | **Add `title`**; derive last-activity note from `Activity` join |
| Contacts filters | All / Active Deals / Leads / Dormant | status enum = prospect/customer/cold/churned | **Reconcile** (see Status semantics) |
| Add modal | Avatar, First name, Last name, Title, Company, Email, Phone | `Contact.name` single; no title/avatar | Add `title`; keep single `name` (split in UI) or add `first/last`; add avatar (storage) |
| Contact detail | Total Deal Value, Interaction count, Pipeline Stage, Last Contact, Interaction History, Stage Funnel, Full name, Direct email, Phone, **Social Connections**, **Schedule/calendar** | No aggregate endpoint; no social links; no calendar | **New aggregate endpoint**; add `social_links`; schedule from Tasks/meetings |
| Company list | Name, Industry, **Size** band, Location, Status, **Annual Revenue**; stats (Growth, Market Cap) | `Company` has industry/location/employee_count/website; no status/revenue | **Add `status`, `annual_revenue`**; Size = band over `employee_count` |
| Pipeline | Stage columns w/ total value + count, deal cards w/ **priority** badge, date | `Deal` has stage/value/probability/close_date; no priority | **Add `priority`** (or derive from probability — decide in plan) |
| Tasks | Fluid task list | `Task` exists | Reskin only |
| Activity | Timeline feed | `Activity` exists | Reskin only |

### Status semantics (decision)

Design labels (Active / Lead / Dormant) differ from the stored enum
(`prospect | customer | cold | churned`). **Do not change the enum** (multi-tenant data,
migrations, other consumers). Instead map for display, and treat filter pills as **derived
views**:

- **Active** = has an open deal (join to deals) OR `status = customer`.
- **Leads** = `status = prospect`.
- **Dormant** = `status IN (cold, churned)` OR no activity in N days.
- **All Contacts** = no filter.

"Active Deals" pill = contacts with ≥1 non-won/lost deal. These become `ContactFilter`
extensions or a dedicated list query param, not schema changes.

## Schema & API changes (new migrations)

1. **`contacts.title`** `text null` — role/title.
2. **`contacts.social_links`** `jsonb null` — `{ linkedin?, twitter?, website? }`.
3. **`contacts.avatar_url`** `text null` — R2 storage key/url (optional; upload via existing
   storage path).
4. **`companies.status`** enum `active | prospect | churned` (or reuse a shared enum — decide in
   plan) `default 'active'`.
5. **`companies.annual_revenue`** `numeric(14,2) null`.
6. **`deals.priority`** enum `low | medium | high | urgent` `null` — OR derive from probability;
   plan decides. If derived, no migration.

Each change: new migration file + `schema.ts` + `packages/types` update + Zod schema update +
route handler update, TDD (write API test first).

### New / extended endpoints

- **`GET /api/contacts/:id/overview`** (new) — aggregate for the detail page:
  `{ contact, deals[], activities[], metrics: { total_deal_value, interaction_count,
  current_stage, last_contact_at }, stage_funnel[] }`. One call powers the whole detail view.
- **`GET /api/contacts`** — extend filter with derived views (active/leads/dormant/active_deals)
  and include a `last_activity` summary field per row (label + timestamp).
- **`GET /api/companies`** — return `status`, `annual_revenue`, and a `size_band` derived from
  `employee_count`; add filter pills (All/Active/Enterprise/Startup/Partner → size/status
  derived).
- **`PATCH/POST /api/contacts`, `/api/companies`, deals** — accept the new fields.
- **`GET /api/activity?contact_id=`** — reused for interaction history (verify it filters by
  contact).

All keep the `{data,error}` envelope, Zod validation, `requireWorkspace` scoping.

## Design (web)

### Routing (migrate into `(fluid)`)

Move CRM routes from `app/(dashboard)/crm/*` into `app/(fluid)/crm/*` (URLs unchanged; the
`(fluid)` layout supplies the FluidShell). Add `app/(fluid)/crm/contacts/[id]/page.tsx` for the
new detail route. Remove the old `(dashboard)/crm/*` route files once each screen is live.

```
app/(fluid)/crm/
  page.tsx                     # CRM hub (or redirect to pipeline/contacts — decide in plan)
  pipeline/page.tsx
  pipeline/[pipelineId]/page.tsx
  contacts/page.tsx            # list
  contacts/[id]/page.tsx       # NEW detail
  companies/page.tsx
  companies/[id]/page.tsx      # detail (if in HTML set; else defer)
  tasks/page.tsx
  activity/page.tsx
modules/crm/fluid/             # NEW Fluid presentation, reuses ../*/lib data hooks
  contacts/{ContactsTable,ContactRow,ContactFilters,AddContactModal,ContactDetail,...}.tsx
  companies/{CompaniesTable,CompanyFilters,CompanyDetail,...}.tsx
  pipeline/{PipelineBoard,KanbanColumn,DealCard,...}.tsx
  tasks/{TaskList,...}.tsx
  activity/{ActivityFeed,...}.tsx
```

### Screens

- **Contacts list** — `FluidTable` (glass, row hover-translate), columns per gap table; pill
  filters (derived views); search ("Find contact"); "Add Contact" opens `AddContactModal`.
  Status badge via `FluidBadge`. Row `more_vert` menu (edit/delete/add-task) RBAC-gated. Rows
  link to `contacts/[id]`.
- **Add-Contact modal** — `FluidModal`: avatar upload, first/last name, title, company
  (autocomplete against companies), email, phone. Zod-validated; POST `/api/contacts`.
- **Contact detail** — driven by `GET /api/contacts/:id/overview`. Header (name, "Title @
  Company", status, Edit/Email/Add Task). Metric pills (`MetricPill`). Interaction History
  timeline. Stage Funnel (`GlassCard` + bars). Detailed Information (copyable email/phone,
  social links). Schedule/calendar (from tasks/meetings). **Plugin panels** for
  `record_type: contact` render via Foundation's `FluidPanelSlot` below the fold.
- **Companies list** — stats header (Growth, Market Cap — derive/aggregate), pill filters,
  `FluidTable` columns per gap table. Rows link to company detail.
- **Pipeline** — glass kanban: stage columns (total value + count header), `DealCard`
  (name, value, priority badge, date), drag via existing `moveItem`, "Add Deal"/"New
  Opportunity" RBAC-gated. Reuse existing pipeline data hooks.
- **Tasks / Activity** — reskin existing widgets/lists in Fluid; reuse hooks.

### RBAC

Every list action, create/edit/delete, and the detail edit controls gate on
`hasPermission` (e.g. `crm.contacts.write`) / `isAdmin`. Nav entries filtered by Foundation's
`FluidNav`. Server routes already enforce; UI hides affordances.

### Settings entries (cross-cutting req #2)

Register CRM settings via Foundation's `settings-registry`:
- **CRM preferences** (workspace scope, admin): default pipeline, contact status view mappings,
  visible list columns, page size.
- **Pipelines** management already exists under settings — reskin/route it through the registry.
Each CRM feature that has options exposes a registry entry so "every feature is customizable."

### Dashboard widgets (cross-cutting req #3)

Existing CRM widgets (`ContactsWidget`, `PipelineWidget`, `contacts/companies/pipeline/tasks`
widget sets) already register via `registerDashboardWidget`. Restyle them to Fluid
(`FluidWidgetCard` chrome) so they render correctly in the Foundation bento. No new registry.

### Analytics hook (cross-cutting req #4 — declared here)

Declare the **analytics hook-feature** for the CRM module: expose CRM analytics
(pipeline-by-stage, win-rate, revenue) as a hook-feature via the
`/api/settings/hooks/:moduleId/:featureId` contract, powered by the analytics module as
provider. Surfaces in the CRM module's Settings → Hooks tab (spec 3 renders it with Foundation's
`HookFeatureCard`). Backend: register the feature descriptor + provider mapping. Enables CRM
screens/widgets to consume analytics when the workspace enables the hook.

## Error handling

- Overview endpoint partial failure (e.g. activity fetch fails) → return contact + available
  sections, flag missing ones; detail page renders `EmptyState` per failed section.
- Optimistic updates on status/priority/move revert on API error (existing pattern).
- New fields nullable → screens tolerate missing title/revenue/social gracefully.

## Testing

- **API (TDD):** write failing tests first for each new/extended endpoint (overview aggregate,
  new fields on create/update, derived filters, company revenue/status). Workspace-scoping tests.
- **Migrations:** up/down tested; nullable/back-compat verified against existing rows.
- **Web:** render tests for each Fluid screen with mocked hooks; RBAC-gating tests
  (affordances hidden without permission); AddContact form validation; detail page assembles
  from overview payload; pipeline drag calls `moveItem`.
- **Visual:** each screen checked against the redesign PNGs, light + dark.

## Rollout / cleanup

- Migrate one screen at a time; delete the corresponding old `modules/crm/*/components` +
  `(dashboard)/crm` route only after the Fluid version is live and tested.
- Keep old CRM widgets until restyled (they feed the shared dashboard).
- Run `Update Graphify` after (new routes/components/endpoints).

## Open questions (resolve in plan)

1. **Deal priority** — new column vs derived from probability. (Lean: derived, no migration,
   unless design needs explicit override.)
2. **Company detail** — is it in the redesign set, or defer? (HTML set has company *list* only;
   individual detail is contact-only. Company detail may be a Fluid extrapolation.)
3. **Avatar upload** — wire to existing R2 storage path? Confirm the upload endpoint.
4. **`name` split** — add `first_name`/`last_name` columns, or keep single `name` and split in
   UI only? (Lean: keep `name`, UI-split, to avoid a data migration on existing rows.)
5. **Schedule/calendar source** — tasks with due dates + meeting activities, or a new concept?
   (Lean: compose from Task + Activity(meeting); no new model.)
6. **CRM hub page** — dedicated hub vs redirect to Pipeline/Contacts.

## Next

Spec 3 (Settings) — full settings module in Fluid (Personal + Workspace sections, per
module/plugin General + dynamic Hooks tabs), rendering CRM's registered settings entries and the
analytics hook declared here.
