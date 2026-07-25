# CRM Production-Readiness Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all 18 audited production-readiness gaps in the Fluid CRM (routing, CRUD, list controls, activity logging) without touching legacy `(dashboard)` CRM.

**Architecture:** Fresh Fluid-styled components over existing `@vencore/api-client` mutation helpers and `modules/crm/**/lib` wrappers. New DB columns via Kysely migrations in `packages/db/migrations`. CRM settings surface through a registry-driven dynamic Next route so the module owns its own settings.

**Tech Stack:** Next.js App Router (React 19, TS strict), TanStack Query, Kysely + Postgres, Zod (API validation), Vitest/Jest for tests.

## Global Constraints

- TypeScript strict; no `any`, no `console.log` in production paths.
- All API routes: `requireWorkspace(req)`, Zod-validate input, scope every query by `workspace_id`, respond `{ data, error }`.
- New migration files only — never edit an existing migration.
- Soft delete only for Contact/Company/Deal.
- Author every commit as Kavin-Charles only; conventional messages; one small commit per task. No AI attribution.
- Fluid UI kit: `FluidModal {open,onClose,title,subtitle}`, `FluidInput {value,onChange,placeholder,type}`, `FluidSelect {value,onChange,options:{label,value}[]}`, `FluidButton {variant?,icon?,onClick,disabled}`, `FluidTable {columns:FluidColumn<T>[],rows,rowKey,onRowClick?}`, `PageHeader {title,subtitle,actions}`, `EmptyState`, `MetricPill`. Import from `@/modules/shared/fluid/ui`.
- Fluid modal+mutation reference pattern: `apps/web/modules/crm/fluid/contacts/AddContactModal.tsx`.
- `contact.title` column ALREADY EXISTS (`packages/db/src/schema.ts`) — no migration for it.
- Deals are `pipeline_items` records; custom values live in `field_values`. `createDeal`/`updateDeal` (`packages/api-client/src/deals.ts`) already accept `field_values`.

---

## Phase 1 — Data & API foundations

### Task 1: Contacts list returns joined company

**Files:**
- Modify: contacts list route in `apps/api/src/routes/contacts.ts` (list handler)
- Test: `apps/api/src/__tests__/contacts.test.ts` (add case)

**Interfaces:**
- Produces: each contact row in the list response includes `company: { id: string; name: string } | null`.

- [ ] **Step 1: Write failing test** — seed a contact with `company_id` set; assert the list endpoint response row has `company: { id, name }` matching the seeded company; a contact with null `company_id` has `company: null`.
- [ ] **Step 2: Run test, verify FAIL** — Run: `pnpm --filter @vencore/api test contacts` — expect fail (company undefined).
- [ ] **Step 3: Implement** — in the list query, `leftJoin('companies', 'companies.id', 'contacts.company_id')`, select `companies.id as company_id_j`, `companies.name as company_name`, and map each row to `company: row.company_id ? { id, name } : null`. Keep `workspace_id` scope. Follow the existing select/map shape in the file.
- [ ] **Step 4: Run test, verify PASS**.
- [ ] **Step 5: Commit** — `fix(crm): include joined company in contacts list response`.

### Task 2: `deal.priority` migration + API support

**Files:**
- Create: `packages/db/migrations/20260725_001_pipeline_item_priority.ts`
- Modify: `packages/db/src/schema.ts` (add `priority` to the pipeline_items row type)
- Modify: deals create/update route in `apps/api/src/routes/deals.ts` (Zod + persistence)
- Modify: `packages/api-client/src/deals.ts` (`createDeal`/`updateDeal` bodies)
- Test: `apps/api/src/__tests__/deals.test.ts`

**Interfaces:**
- Produces: pipeline_items gain nullable `priority` text (`'low'|'medium'|'high'|'urgent'`); `createDeal`/`updateDeal` accept optional `priority`; API validates the enum.

- [ ] **Step 1: Write the migration**

```ts
// packages/db/migrations/20260725_001_pipeline_item_priority.ts
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('pipeline_items')
    .addColumn('priority', 'text')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('pipeline_items').dropColumn('priority').execute();
}
```

- [ ] **Step 2: Run migration** — Run: `pnpm --filter @vencore/db db:migrate` (or repo migrate script). Expect: applies cleanly.
- [ ] **Step 3: Write failing API test** — POST a deal with `priority: 'high'`; assert stored + returned `priority === 'high'`. POST with `priority: 'bogus'` → 400.
- [ ] **Step 4: Run test, verify FAIL**.
- [ ] **Step 5: Implement** — add `priority: z.enum(['low','medium','high','urgent']).optional()` to the deal create/update Zod schemas; persist to the `priority` column; include it in the record select. Add `priority?` to `createDeal`/`updateDeal` bodies in the api-client. Add `priority: string | null` to the pipeline_items schema type.
- [ ] **Step 6: Run test, verify PASS**.
- [ ] **Step 7: Commit** — `feat(crm): add deal priority column and API support`.

### Task 3: Verify `/api/activity` POST accepts CRM logging

**Files:**
- Modify (if needed): `apps/api/src/routes/activity.ts`
- Test: `apps/api/src/__tests__/activity.test.ts`

**Interfaces:**
- Produces: `POST /api/activity` accepts `{ type: 'note'|'call'|'meeting'|'email', body?, contact_id?, deal_id? }`, scoped to workspace + `user_id` from `req.user`; returns `{ data: Activity }`.

- [ ] **Step 1: Write failing test** — POST `{ type:'note', body:'hi', deal_id }`; assert 200 + row persisted with `workspace_id`, `user_id`. POST invalid `type` → 400.
- [ ] **Step 2: Run test** — if it already passes, note that and skip to commit; else FAIL.
- [ ] **Step 3: Implement** — ensure Zod enum includes the four CRM types and handler sets `user_id = req.user.id`. Match existing route conventions.
- [ ] **Step 4: Run test, verify PASS**.
- [ ] **Step 5: Commit** — `fix(crm): allow note/call/meeting/email activity logging`.

---

## Phase 2 — Routing / dead links (audit #1, #2)

### Task 4: Registry-driven CRM settings route (#1)

**Files:**
- Create: `apps/web/app/(fluid)/settings/[entryId]/page.tsx`
- Verify import: settings host bootstrap imports `modules/crm/fluid/settings/register.ts`
- Test: `apps/web/modules/crm/fluid/settings/__tests__/crm-settings-route.test.tsx` (render smoke)

**Interfaces:**
- Consumes: `getSettingsEntryById(id)` from `@/modules/shared/fluid/settings-registry`.
- Produces: navigating `/settings/crm-preferences` renders `CrmPreferencesPanel`; unknown id → `notFound()`.

- [ ] **Step 1: Write failing test** — render the route component with `params={{entryId:'crm-preferences'}}`; assert the CRM preferences panel heading is present. (Ensure `register.ts` is imported in the test setup.)
- [ ] **Step 2: Run test, verify FAIL** — Run: `pnpm --filter @vencore/web test crm-settings-route`.
- [ ] **Step 3: Implement**

```tsx
// apps/web/app/(fluid)/settings/[entryId]/page.tsx
import { notFound } from 'next/navigation';
import { getSettingsEntryById } from '@/modules/shared/fluid/settings-registry';
import '@/modules/crm/fluid/settings/register';

export default async function SettingsEntryPage({
  params,
}: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  const entry = getSettingsEntryById(entryId);
  if (!entry) notFound();
  const Component = entry.component;
  return <Component />;
}
```

- [ ] **Step 4: Confirm registry bootstrap** — grep where `modules/settings/fluid/register.ts` is imported at app startup; add `import '@/modules/crm/fluid/settings/register';` alongside it so the entry registers for the nav too. Run: `pnpm --filter @vencore/web test crm-settings-route` → PASS.
- [ ] **Step 5: Manual verify** — dev server, click Settings → CRM; panel renders (no 404).
- [ ] **Step 6: Commit** — `fix(crm): render registered CRM settings via dynamic route`.

### Task 5: Fluid pipeline settings screen (#2)

**Files:**
- Create: `apps/web/app/(fluid)/settings/pipelines/page.tsx` (index → default pipeline)
- Create: `apps/web/app/(fluid)/settings/pipelines/[id]/page.tsx`
- Create: `apps/web/modules/crm/fluid/pipeline/settings/PipelineSettingsScreen.tsx` (Stages / Fields / General via `PillTabs`)
- Modify: `apps/web/modules/crm/fluid/pipeline/PipelineBoard.tsx:191` (fix link) + header gear
- Modify: `apps/web/modules/crm/fluid/pipeline/PipelineIndexScreen.tsx` (fix "Go to pipeline settings" push target)
- Test: `apps/web/modules/crm/fluid/pipeline/settings/__tests__/PipelineSettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `modules/crm/pipeline/lib/pipelines.ts` (`listPipelines`, and stage/field mutation helpers already used by legacy tabs).
- Produces: `/settings/pipelines/:id` renders stages + fields + general editors; board has a gear linking there.

- [ ] **Step 1: Write failing test** — render `PipelineSettingsScreen` with a mock pipeline (2 stages); assert both stage names show and a "Add stage" control exists.
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement `PipelineSettingsScreen`** — `PillTabs` with Stages/Fields/General. Stages tab lists `pipeline.stages`, rename/add/reorder/delete via the existing pipeline lib mutations (same calls the legacy `StagesTab` uses). Fields tab over pipeline fields lib. General tab: name + default toggle. Fluid styling (GlassCard, FluidInput, FluidButton).
- [ ] **Step 4: Add route files** — index redirects to default pipeline (mirror `PipelineIndexScreen` resolve logic); `[id]/page.tsx` renders `<PipelineSettingsScreen pipelineId={id} />`.
- [ ] **Step 5: Fix links + gear** — in `PipelineBoard`, change the no-stages link and add a header `FluidButton icon="settings"` → `/settings/pipelines/${pipelineId}`. In `PipelineIndexScreen`, `router.push('/settings/pipelines')`.
- [ ] **Step 6: Run test PASS + manual** — board gear opens fluid settings; add/rename a stage persists.
- [ ] **Step 7: Commit** — `feat(crm): fluid pipeline settings screen and board access`.

---

## Phase 3 — Company CRUD (audit #4, #5)

### Task 6: `CompanyFormModal` (create/edit)

**Files:**
- Create: `apps/web/modules/crm/fluid/companies/CompanyFormModal.tsx`
- Test: `apps/web/modules/crm/fluid/companies/__tests__/CompanyFormModal.test.tsx`

**Interfaces:**
- Consumes: `createCompany`, `updateCompany` from `@/modules/crm/companies/lib/companies`.
- Produces: `CompanyFormModal({ open, mode:'create'|'edit', initial?, onClose, onSaved })`. Fields: name (required), industry, location, website, employee_count (number). Invalidates `['companies']`.

- [ ] **Step 1: Write failing test** — render create mode; type a name; click Create; assert `createCompany` called with `{ name, ... }` and `onSaved` fired. Empty name → submit disabled.
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement** — copy the `AddContactModal` structure: local state per field, `useMutation` over `createCompany`/`updateCompany` (branch on `mode`), `field_values`-free plain company body, error banner, disabled submit until name present. Prefill from `initial` in edit mode.
- [ ] **Step 4: Run test, verify PASS**.
- [ ] **Step 5: Commit** — `feat(crm): fluid company create/edit modal`.

### Task 7: Add-Company on list (#4)

**Files:**
- Modify: `apps/web/modules/crm/fluid/companies/CompaniesScreen.tsx`

- [ ] **Step 1: Write failing test** — render `CompaniesScreen`; assert an "Add Company" button exists and clicking opens the modal (mock modal). 
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement** — add `PageHeader` action `FluidButton icon="add"` toggling `useState` open; render `<CompanyFormModal mode="create" .../>`; `onSaved` → `refetch()`.
- [ ] **Step 4: Run test PASS + manual** — create a company end-to-end appears in list.
- [ ] **Step 5: Commit** — `feat(crm): add company creation from companies list`.

### Task 8: Company detail Edit + Add Deal + Add Contact (#5)

**Files:**
- Modify: `apps/web/modules/crm/fluid/companies/CompanyDetailScreen.tsx`

**Interfaces:**
- Consumes: `CompanyFormModal`, `ContactFormModal` (Task 10), `DealFormModal` (Task 14) — all accept a `companyId` prefill.

- [ ] **Step 1: Write failing test** — render detail; assert Edit, Add Deal, Add Contact actions render; Edit opens `CompanyFormModal` in edit mode with the company as `initial`.
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement** — header actions: Edit → `CompanyFormModal mode="edit" initial={company}`; Add Deal → `DealFormModal` prefilled `companyId`; Add Contact → `ContactFormModal` prefilled `companyId`. Each with its own open state; `onSaved` refetches the detail query.
- [ ] **Step 4: Run test PASS + manual**.
- [ ] **Step 5: Commit** — `feat(crm): edit company and add deal/contact from detail`.

> Note: Tasks 10 and 14 produce `ContactFormModal`/`DealFormModal`. Implement Task 8's wiring after those, or stub the buttons then wire in — sequence Phase 4/5 before finalizing Step 3.

---

## Phase 4 — Contacts (audit #3, #7, #9, #18)

### Task 9: Company selector on contact create (#7)

**Files:**
- Modify: `apps/web/modules/crm/fluid/contacts/AddContactModal.tsx`
- Modify (client body): ensure `createContact` accepts `company_id` (check `packages/api-client/src/contacts.ts`)

- [ ] **Step 1: Write failing test** — render modal; select a company; submit; assert `createContact` body includes `company_id`.
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement** — fetch companies (`useQuery(['companies'])`), render a `FluidSelect` (None + companies); include `company_id` in body when set. Add `company_id?` to the create body type if missing.
- [ ] **Step 4: Run test, verify PASS**.
- [ ] **Step 5: Commit** — `feat(crm): assign company when creating a contact`.

### Task 10: `ContactFormModal` edit mode (#3 edit)

**Files:**
- Create: `apps/web/modules/crm/fluid/contacts/ContactFormModal.tsx` (generalize `AddContactModal`: `mode`, `initial`, optional `companyId` prefill, `status` field)
- Test: `apps/web/modules/crm/fluid/contacts/__tests__/ContactFormModal.test.tsx`

**Interfaces:**
- Consumes: `createContact`, `updateContact`.
- Produces: `ContactFormModal({ open, mode, initial?, companyId?, onClose, onSaved })` with name/email/title/phone/company/status.

- [ ] **Step 1: Write failing test** — edit mode with `initial`; change name; submit; assert `updateContact(id, { name, ... })` called; `status` FluidSelect present.
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement** — refactor `AddContactModal` internals into `ContactFormModal`; keep `AddContactModal` as a thin `mode="create"` wrapper (DRY) so existing callers still work. Add `status` select (`prospect|customer|cold|churned`) and `companyId` prefill.
- [ ] **Step 4: Run test, verify PASS**.
- [ ] **Step 5: Commit** — `feat(crm): reusable contact form modal with edit and status`.

### Task 11: Wire contact detail actions (#3, #18)

**Files:**
- Modify: `apps/web/modules/crm/fluid/contacts/ContactDetailScreen.tsx`

- [ ] **Step 1: Write failing test** — render detail; assert Edit opens `ContactFormModal` edit; Email is an anchor `href="mailto:<email>"`; Add Task focuses/opens the task add in `TasksPanel`.
- [ ] **Step 2: Run test, verify FAIL** — currently buttons have no handlers.
- [ ] **Step 3: Implement** — Edit → open `ContactFormModal mode="edit" initial={contact}`, `onSaved` refetch. Email → replace with `<a href={`mailto:${contact.email}`}>` styled as `FluidButton` (or `FluidButton onClick={() => { window.location.href = ... }}`). Add Task → lift a ref/state into `TasksPanel` to open its add row (add an `autoFocusAdd` prop if needed).
- [ ] **Step 4: Run test PASS + manual**.
- [ ] **Step 5: Commit** — `fix(crm): wire contact detail edit, email, add-task actions`.

### Task 12: Contact detail "Detailed Information" fields (#9)

**Files:**
- Modify: `apps/web/modules/crm/fluid/contacts/ContactDetailScreen.tsx`
- Depends on Task 1 (company on contact) — ensure the detail query returns `company` + `status` + `title`.

- [ ] **Step 1: Write failing test** — detail with a contact having company+status+title; assert Company (as link to `/crm/companies/:id`), Status, and Title render in the info block.
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement** — add rows: Company (`<Link>` when present, else "—"), Status (`FluidBadge`), Title. Ensure the detail fetch (`useContactOverview`) selects these; extend the API select if missing (workspace-scoped).
- [ ] **Step 4: Run test PASS + manual**.
- [ ] **Step 5: Commit** — `feat(crm): show company, status, title on contact detail`.

---

## Phase 5 — Pipeline / Deal (audit #8, #10, #11, #16, #17)

### Task 13: Deal card shows close date, not created_at (#16)

**Files:**
- Modify: `apps/web/modules/crm/fluid/pipeline/DealCard.tsx:99-100`

- [ ] **Step 1: Write failing test** — render `DealCard` with `created_at` and a close-date field differing; assert the displayed date equals the close date (labelled), not `created_at`.
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement** — read the close-date field value from the record; render `Closes {date}` when present, else nothing (or `Created {date}` explicitly labelled). Remove the ambiguous bare `schedule`+`created_at`.
- [ ] **Step 4: Run test, verify PASS**.
- [ ] **Step 5: Commit** — `fix(crm): deal card shows labelled close date`.

### Task 14: `DealFormModal` with Priority + Owner (#8)

**Files:**
- Create: `apps/web/modules/crm/fluid/pipeline/DealFormModal.tsx`
- Modify: `apps/web/modules/crm/fluid/pipeline/PipelineBoard.tsx` (use it for Add Deal + column adds), `DealCard`/detail (edit)
- Test: `apps/web/modules/crm/fluid/pipeline/__tests__/DealFormModal.test.tsx`

**Interfaces:**
- Consumes: `createDeal`/`updateDeal` (now with `priority`), owner list (`listUsers`/team endpoint), contacts, companies.
- Produces: `DealFormModal({ open, mode, pipelineId, stages, initial?, contactId?, companyId?, onClose, onSaved })` with name/value/probability/close-date/stage/contact/company/**priority**/**owner**.

- [ ] **Step 1: Write failing test** — create mode; set name+priority='high'+owner; submit; assert `createDeal` body includes `priority:'high'` and owner (via `owner_id` or field). 
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement** — build the form (reuse the current inline Add-Deal modal fields already in `PipelineBoard`), add `FluidSelect` Priority (low/medium/high/urgent) and Owner (workspace users). Persist priority via `createDeal`/`updateDeal`. For owner: confirm `owner_id` is accepted by the deals route; if not, add it to Zod+persistence in this task (owner_id column exists on the Deal/records schema).
- [ ] **Step 4: Run test PASS + manual** — new deal shows chosen priority badge (Task 15 reads it).
- [ ] **Step 5: Commit** — `feat(crm): deal form with priority and owner`.

### Task 15: Card priority badge reads real field (#8 cont.)

**Files:**
- Modify: `apps/web/modules/crm/fluid/pipeline/DealCard.tsx`

- [ ] **Step 1: Write failing test** — card with `priority:'urgent'` renders "Urgent" badge; card with null priority renders no badge (or neutral).
- [ ] **Step 2: Run test, verify FAIL** (currently derived from probability).
- [ ] **Step 3: Implement** — badge reads `item.priority`; drop probability-derivation.
- [ ] **Step 4: Run test, verify PASS**.
- [ ] **Step 5: Commit** — `fix(crm): deal card priority badge uses stored priority`.

### Task 16: Delete-deal confirmation (#17)

**Files:**
- Modify: `apps/web/modules/crm/fluid/pipeline/PipelineBoard.tsx` (delete handler) — reuse a small confirm via `FluidModal`
- Create (if none): `apps/web/modules/shared/fluid/ConfirmDialog.tsx`

- [ ] **Step 1: Write failing test** — trigger delete; assert a confirm dialog appears and the delete mutation only fires after confirm.
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement** — `ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onClose })` over `FluidModal`; gate `deleteDeal` behind it.
- [ ] **Step 4: Run test, verify PASS**.
- [ ] **Step 5: Commit** — `feat(crm): confirm before deleting a deal`.

### Task 17: Activity logging form (#10)

**Files:**
- Create: `apps/web/modules/crm/fluid/shared/ActivityLogForm.tsx`
- Modify: deal detail Activity tab (`apps/web/modules/crm/pipeline/components/detail/ItemActivity.tsx` fluid equivalent / fluid deal detail) and `ContactDetailScreen` Interaction History
- Test: `apps/web/modules/crm/fluid/shared/__tests__/ActivityLogForm.test.tsx`

**Interfaces:**
- Consumes: `createActivity(token, { type, body, contact_id?, deal_id? })`.
- Produces: `ActivityLogForm({ contactId?, dealId?, onLogged })` — type select (note/call/meeting/email) + body textarea + Log button; invalidates the relevant activity query.

- [ ] **Step 1: Write failing test** — render with `dealId`; pick "call", type body, click Log; assert `createActivity` called `{ type:'call', body, deal_id }` and `onLogged` fired.
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement** — controlled form; `useMutation` over `createActivity`; on success invalidate `['activity', ...]` and call `onLogged`.
- [ ] **Step 4: Mount** — render `ActivityLogForm` above the activity list in deal detail Activity tab and contact detail; wire query invalidation so the list refreshes ("No activity yet" replaced).
- [ ] **Step 5: Run test PASS + manual**.
- [ ] **Step 6: Commit** — `feat(crm): log notes/calls/meetings on deals and contacts`.

### Task 18: Pipeline Board/Table view toggle (#11)

**Files:**
- Create: `apps/web/modules/crm/fluid/pipeline/PipelineTableView.tsx`
- Modify: `apps/web/modules/crm/fluid/pipeline/PipelineBoard.tsx` (add `PillTabs` Board/Table)
- Test: `apps/web/modules/crm/fluid/pipeline/__tests__/PipelineTableView.test.tsx`

**Interfaces:**
- Consumes: same `items` + `pipeline` already loaded by `PipelineBoard`.
- Produces: Table view listing all items (name, stage, value, probability, priority, close date, contact, company) via `FluidTable`; row click opens deal detail.

- [ ] **Step 1: Write failing test** — render `PipelineTableView` with 3 items; assert 3 rows + a stage column value.
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement `PipelineTableView`** — `FluidTable` columns as above; `onRowClick` opens the existing deal detail panel.
- [ ] **Step 4: Toggle** — `PillTabs` Board/Table in `PipelineBoard` header; local `view` state switches rendering; search applies to both.
- [ ] **Step 5: Run test PASS + manual**.
- [ ] **Step 6: Commit** — `feat(crm): table view for pipeline`.

---

## Phase 6 — List controls (audit #12, #13, #14, #15)

### Task 19: Strip unbacked company columns/filters (#13)

**Files:**
- Modify: `apps/web/modules/crm/fluid/companies/CompaniesScreen.tsx`

- [ ] **Step 1: Write failing test** — render list; assert NO "Annual Revenue" and NO "Status" columns; filter tabs do not include "Partner". Size-based filter (Startup/Enterprise via `employee_count`) remains and works.
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement** — remove the Annual Revenue + Status columns from the column list; remove the "Partner" filter and any "Status" filter with no data; keep All + employee-count buckets (define the bucket thresholds inline).
- [ ] **Step 4: Run test PASS + manual**.
- [ ] **Step 5: Commit** — `fix(crm): remove unbacked company revenue/status/partner UI`.

### Task 20: Shared list controls — sort + filter (#12)

**Files:**
- Create: `apps/web/modules/crm/fluid/shared/useListControls.ts` (sort + filter state helper)
- Create: `apps/web/modules/crm/fluid/shared/ListToolbar.tsx` (sort dropdown + filter chips)
- Modify: `ContactsScreen`, `CompaniesScreen`, pipeline table view to consume it
- Test: `apps/web/modules/crm/fluid/shared/__tests__/useListControls.test.ts`

**Interfaces:**
- Produces: `useListControls<T>({ rows, sortKeys, filters })` → `{ visible, sort, setSort, filter, setFilter }`; pure, unit-testable.

- [ ] **Step 1: Write failing test** — given rows + a sort key `value` desc, assert `visible` ordering; given a filter predicate, assert filtered subset.
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement `useListControls`** — pure sort/filter over the passed rows; stable sort; support asc/desc.
- [ ] **Step 4: `ListToolbar`** — sort `FluidSelect` + filter `FluidChip`s driven by config.
- [ ] **Step 5: Wire into Contacts, Companies, pipeline table** — owner/value/stage/date filters where fields exist; column sort. Run test PASS + manual.
- [ ] **Step 6: Commit** — `feat(crm): sortable, filterable CRM lists`.

### Task 21: Pagination on lists (#14)

**Files:**
- Create: `apps/web/modules/crm/fluid/shared/Pagination.tsx`
- Modify: `ContactsScreen`, `CompaniesScreen`, tasks list, pipeline table to page results
- Test: `apps/web/modules/crm/fluid/shared/__tests__/Pagination.test.tsx`

**Interfaces:**
- Produces: `Pagination({ page, pageCount, onPage })`; screens pass `page`/`page_size` to the list APIs that support it and slice client-side otherwise.

- [ ] **Step 1: Write failing test** — render with `page=2,pageCount=5`; clicking Next calls `onPage(3)`; prev disabled on page 1.
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement `Pagination`** then wire into each list (prefer server `page`/`page_size` params; fall back to client slicing where the endpoint returns all).
- [ ] **Step 4: Run test PASS + manual**.
- [ ] **Step 5: Commit** — `feat(crm): paginate CRM lists`.

### Task 22: Bulk actions + tags on contacts (#15)

**Files:**
- Create: `apps/web/modules/crm/fluid/contacts/ContactBulkBar.tsx`
- Modify: `ContactsScreen.tsx` (row selection + tag column)
- Test: `apps/web/modules/crm/fluid/contacts/__tests__/ContactBulkBar.test.tsx`

**Interfaces:**
- Consumes: `updateContact` (bulk status), contact soft-delete, tag assignment endpoint (`contact_tags`).
- Produces: selection state in the list; a bulk bar appears when ≥1 selected (change status / delete / add tag); a Tags column renders `FluidChip`s.

- [ ] **Step 1: Write failing test** — select two rows; assert the bulk bar shows "2 selected" and a status action calls `updateContact` for each.
- [ ] **Step 2: Run test, verify FAIL**.
- [ ] **Step 3: Implement** — checkbox column + `selected` Set state; `ContactBulkBar` with Change Status / Delete / Add Tag; render a Tags column from the contact's tags. Wire tag assignment to the existing tag endpoint.
- [ ] **Step 4: Run test PASS + manual**.
- [ ] **Step 5: Commit** — `feat(crm): bulk actions and tags on contacts`.

---

## Phase 7 — Wrap-up

### Task 23: Finalize company-detail wiring + graph

- [ ] **Step 1** — return to Task 8 Step 3 and finalize `DealFormModal`/`ContactFormModal` wiring now that both exist; manual verify Add Deal / Add Contact from a company prefills the company.
- [ ] **Step 2** — full manual audit re-run of all 18 items against the dev server; note any regressions.
- [ ] **Step 3: Update Graphify** — run `Update Graphify` (new routes: `settings/[entryId]`, `settings/pipelines/*`; new components). 
- [ ] **Step 4: Commit** — `chore(crm): refresh knowledge graph after CRM fixes`.

---

## Audit → Task coverage map

| # | Gap | Task |
|---|-----|------|
| 1 | CRM settings 404 | 4 |
| 2 | Pipeline config unreachable | 5 |
| 3 | Contact detail Edit/Add-Task dead | 10, 11 |
| 4 | Cannot create company | 6, 7 |
| 5 | Cannot edit company / add deal/contact | 8 |
| 6 | Contacts list company "—" | 1 |
| 7 | Add-contact missing company | 9 |
| 8 | Deal missing owner/priority | 2, 14, 15 |
| 9 | Contact detail missing fields | 12 |
| 10 | No activity logging | 3, 17 |
| 11 | No table view | 18 |
| 12 | No filter/sort | 20 |
| 13 | Fake company columns/filters | 19 |
| 14 | No pagination | 21 |
| 15 | No bulk/tags | 22 |
| 16 | Card date misleads | 13 |
| 17 | No delete confirm | 16 |
| 18 | Email button dead | 11 |
