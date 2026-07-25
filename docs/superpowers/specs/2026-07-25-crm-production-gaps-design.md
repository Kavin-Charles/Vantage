# CRM Production-Readiness Fixes — Design

**Date:** 2026-07-25
**Branch:** `fix/crm-production-gaps`
**Scope:** Fluid CRM (`apps/web/modules/crm/fluid/**`) + supporting API/DB. Legacy `(dashboard)` CRM untouched except where a route is shared.

## Context

A browser audit of the Fluid CRM surfaced 18 gaps across pipeline, contacts, companies, tasks, and CRM settings — ranging from dead routes/buttons to missing CRUD and absent list controls. This spec covers fixing all 18. Each fix ships as its own small commit.

## Decisions (locked)

- **Schema — mixed.** Add migrations for `deal.priority` (enum) and `contact.title` (string). Do **not** add columns for company status / type / annual revenue — instead remove the unbacked UI that references them.
- **Build fresh.** New Fluid-styled components over existing `lib` mutation helpers (`createCompany`, `updateContact`, pipeline libs, etc.). Do not mount legacy dashboard-styled forms.
- **Email action** → `mailto:` link.
- **CRM settings ownership.** CRM settings live in `modules/crm` (registered via `settings-registry`). No per-module page file under `app/`. A registry-driven dynamic route renders them.
- **Company detail actions** → Edit + Add Deal + Add Contact (both prefilled with the company).

## Workstreams

### A. Routing / dead links (#1, #2)

**#1 — CRM settings 404.** Root cause: registered settings entry `crm-preferences` has no Next route; existing settings pages are per-entry static dirs. Fix: add a registry-driven dynamic route `app/(fluid)/settings/[entryId]/page.tsx` that resolves `getSettingsEntryById(entryId)` and renders its `component` (calling `notFound()` when absent / gated). `CrmPreferencesPanel` and `register.ts` stay in `modules/crm/fluid/settings`. Static segments (about, profile, …) keep priority over the dynamic segment, so nothing else changes. Ensure the module's `register.ts` is imported on the settings host bootstrap so the entry is registered.

**#2 — Pipeline config unreachable in fluid.** Build fresh Fluid pipeline-settings screen (Stages / Fields / General tabs) at `app/(fluid)/settings/pipelines/[id]` + an index at `app/(fluid)/settings/pipelines`, using existing `modules/crm/pipeline/lib` mutations. Add a settings-gear action on `PipelineBoard` header linking there. Fix the two hardcoded `/settings/pipelines*` links in `PipelineBoard.tsx` and `PipelineIndexScreen.tsx` to the fluid routes.

### B. Company CRUD (#4, #5)

Fresh Fluid `CompanyFormModal` (create + edit) over `createCompany` / `updateCompany`. Zod-validated, `{data,error}` handling, workspace-scoped.
- `CompaniesScreen`: add "Add Company" header button → create modal.
- `CompanyDetailScreen`: add **Edit** (prefilled), **Add Deal** (deal form prefilled `company_id`), **Add Contact** (contact form prefilled `company_id`).

### C. Contacts (#3, #6, #7, #9, #18)

- Fresh Fluid `ContactFormModal` (create + edit) over `createContact` / `updateContact`, incl. **Company** selector (#7) and **Status**.
- `ContactDetailScreen`: wire **Edit** → modal (#3), **Add Task** → task panel add, **Email** → `mailto:contact.email` (#18).
- **#6 — list company join.** Contacts list API returns no `company{name}`; column always shows "—". Fix the list endpoint to join and return `company: { id, name } | null`; `ContactsScreen` already renders `r.company?.name`.
- **#9 — detail info.** "Detailed Information" gains Company (link to company detail), Status, and Title (after `contact.title` migration).

### D. Pipeline / Deal (#8, #10, #11, #16, #17)

- **#8 — priority + owner.** Migration `deal.priority` enum (`low|medium|high|urgent`) + API/Zod + seed. Add/Edit-deal form gains Priority + Owner selectors. Card badge reads the real column.
- **#11 — table view.** View toggle (Board / Table) on `PipelineBoard`; fresh Fluid table view of pipeline items.
- **#10 — activity logging.** Activity tab in deal detail (and contact detail) gains a log form (type: note/call/meeting/email + body) → `POST /activity`; list refreshes.
- **#16 — card date.** `DealCard` shows the **close date** with a clear label instead of `created_at` (drop the bare `schedule` icon + created date, or relabel to "Created").
- **#17 — delete confirm.** Deal delete opens a confirm dialog before the soft-delete mutation.

### E. Lists: filter / sort / pagination / bulk (#12, #13, #14, #15)

- **#13 — strip fake company UI.** Remove unbacked **Annual Revenue** + **Status** columns and **Enterprise / Startup / Partner** filters. Keep size-based filtering (real `employee_count`) as needed; keep **All**.
- **#12 — filter + sort.** Add filter controls (owner / value range / stage / date) and column sort to pipeline, contacts, companies. Client-side over already-fetched pages where feasible; server params where the API supports them.
- **#14 — pagination.** Paginated lists (contacts, companies, deals, tasks) using the API's existing pagination; UI page controls.
- **#15 — bulk + tags.** Fluid contacts: row selection + bulk actions (status change / delete), and tag display + assignment (`contact_tags` is real).

## Migrations

New files only (never edit existing):
- `deal.priority` — enum column, default `medium`, backfill existing rows.
- `contact.title` — nullable string.
Both mirrored in API Zod schemas, DB query types, and seed data.

## Component boundaries

- `CompanyFormModal`, `ContactFormModal`, `DealFormModal` — self-contained create/edit modals; props: `mode`, optional `initial`, optional prefill (`companyId`), `onClose`. Own their form state + mutation; parent just toggles open.
- Pipeline settings screens (Stages/Fields/General) — each a focused component over the pipeline lib.
- Activity log form — small controlled component; emits `POST /activity`, invalidates the activity query.
- List controls (filter/sort/pagination/bulk) — extracted so each list screen composes them without duplicating logic.

## Testing

- Unit: form validation, `deriveViews`/list filter+sort logic, activity payload shaping.
- API: contacts list returns company join; `deal.priority` create/update; `/activity` POST.
- Migration: up/down apply cleanly; seed loads.
- Manual browser pass per fix (audit re-run).

## Out of scope

- CSV import/export, Gmail/Zapier, public API (roadmap-deferred).
- Legacy `(dashboard)` CRM redesign.
- Company `status`/`type`/`revenue` as real fields (explicitly removed instead).

## Commit sequence (one small commit each)

DB migrations → API (company join, priority, activity) → routing fixes (A) → company CRUD (B) → contact fixes (C) → deal/pipeline (D) → list controls (E). Each fix its own conventional commit. Run `Update Graphify` at the end (new routes/components).
