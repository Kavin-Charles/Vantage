# Fluid CRM — Production-Ready Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the Fluid CRM module to production-ready: fix the glitchy shell (dock + remove topbar), repair the broken per-contact page, wire real deal↔contact/company linkage, build the per-company detail page, integrate Tasks into the CRM (contextual panels + redesigned hub), and finish Settings access + CRM module settings — all matching the Vencore Fluid source-of-truth.

**Architecture:** Next.js App Router `(fluid)` route group over a shared `FluidShell`. Express + Kysely API. Deals live in `pipeline_items` (`field_values` jsonb) — the live pipeline model; this plan adds real `contact_id`/`company_id` FK columns to it. Overview endpoints aggregate contact/company + deals + activities + tasks. Fluid UI primitives in `modules/shared/fluid/ui`.

**Tech Stack:** TypeScript (strict), Next.js, React, @tanstack/react-query, Express, Kysely, PostgreSQL, Zod, vitest. Fonts: Space Grotesk + Inter + Material Symbols.

Spec: `docs/superpowers/specs/2026-07-24-fluid-crm-production-design.md`.

## Global Constraints

- NEVER commit to `main`. Branch `refactor/crm-module`. Sole author **Kavin-Charles**; NEVER add AI/Claude/Anthropic attribution to any commit.
- Multi-tenant: every query scoped by `workspace_id`. Never return cross-workspace data.
- API responses: `{ data: ..., error: null }` or `{ data: null, error: { code, message } }`.
- Validate all inputs with Zod before touching the DB. All queries via Kysely (no raw SQL strings without parameterisation). No `any` types. No `console.log` in prod paths — use the structured logger.
- Write DB migrations; NEVER modify an existing migration file.
- Do NOT change `contacts.status` enum; Active/Lead/Dormant remain derived views.
- Route-conflict landmine: `(dashboard)/[slug]` catches one-segment top-level paths; keep CRM paths two-segment; never duplicate a path across `(fluid)` and `(dashboard)`.
- Fluid tokens only for styling (`--fl-*`, `glass-panel`/`GlassCard`, `--fl-font-display` = Space Grotesk, `--fl-primary`), matching `stitch_enterprise_clarity_standard_prd/vencore_fluid/DESIGN.md` and the 6 mocks.
- Verify each screen live: web `:3000`, API `:3001`, login `admin@localhost` / `admin123`. Backend tests use the hand-rolled Kysely mock (see `apps/api/src/__tests__/contacts-overview.test.ts`) — no live DB for `vitest run`.
- Green bar before done: `pnpm -w typecheck` and `vitest run` (api).

---

## File Structure

Shell:
- `apps/web/modules/shared/fluid/shell/FluidDock.tsx` — NEW, replaces `FluidSidebar.tsx` (deleted).
- `apps/web/modules/shared/fluid/shell/FluidShell.tsx` — MODIFY (drop topbar, reflow padding).
- `apps/web/modules/shared/fluid/shell/FluidTopbar.tsx` — DELETE.

Deal linkage:
- `packages/db/migrations/20260724_001_pipeline_items_links.ts` — NEW migration.
- `packages/db/src/schema.ts` — MODIFY `PipelineItemTable`.
- `apps/api/src/routes/pipeline-items.ts` — MODIFY create/update to capture links.
- `apps/api/src/lib/seed-demo.ts` — MODIFY deals to set links; `apps/api/src/scripts/backfill-pipeline-item-links.ts` — NEW backfill.

Overview + detail:
- `apps/api/src/routes/contacts-overview.ts` — MODIFY (query pipeline_items + tasks).
- `apps/api/src/routes/companies-overview.ts` — NEW; mounted in `apps/api/src/index.ts`.
- `packages/types/src/index.ts` — MODIFY `ContactOverview` (+tasks) and add `CompanyOverview`.
- `apps/web/modules/crm/fluid/contacts/ContactDetailScreen.tsx` — MODIFY (deals + tasks panel).
- `apps/web/modules/crm/fluid/companies/CompanyDetailScreen.tsx` — NEW; route `apps/web/app/(fluid)/crm/companies/[id]/page.tsx` — NEW.
- `apps/web/modules/crm/fluid/companies/CompaniesScreen.tsx` — MODIFY (clickable rows).
- `apps/web/modules/crm/fluid/lib/useCompanyOverview.ts` — NEW.
- `apps/web/modules/crm/fluid/shared/TasksPanel.tsx` + `useRecordTasks.ts` — NEW (embedded panel).

Tasks hub:
- `apps/web/modules/crm/fluid/tasks/TasksScreen.tsx` — REWRITE (fluid, reuse hooks, contact links).

Settings:
- `apps/web/modules/settings/fluid/modules/ModulesListPanel.tsx` — MODIFY (gear per row).
- `apps/web/app/(fluid)/settings/modules/[moduleId]/page.tsx` — MODIFY (render module settings; crm → CrmPreferencesPanel).
- `apps/api/src/routes/*` + `apps/web/modules/crm/fluid/settings/CrmPreferencesPanel.tsx` — MODIFY (real persistence).

---

# PHASE 0 — Shell (dock + topbar removal)

### Task 1: Floating centered dock (replace FluidSidebar)

Source of truth: `stitch_enterprise_clarity_standard_prd/vencore_sales_pipeline_unified_navigation/code.html` — the `<nav class="group flex flex-col ... fixed left-6 top-1/2 -translate-y-1/2 w-16 hover:w-48 transition-all duration-300 ...">` dock. Collapsed 64px, hover→192px, pure-CSS `group-hover` reveal, groups (GENERAL/SALES/INFRA/PROJECTS/INSIGHTS), internal scroll.

**Files:**
- Create: `apps/web/modules/shared/fluid/shell/FluidDock.tsx`
- Delete: `apps/web/modules/shared/fluid/shell/FluidSidebar.tsx` (after FluidShell no longer imports it — Task 2)
- Reference (read, do not change): `apps/web/modules/shared/fluid/nav/nav-model.ts` (`BASE_NAV`, `GROUP_LABEL`, `GROUP_ORDER`), `filter-nav.ts` (`buildNav`), current `FluidSidebar.tsx` (nav-building logic to reuse).

**Interfaces:**
- Consumes: `buildNav(BASE_NAV, pluginNav, { hasPermission, isModuleEnabled, isAdmin })` → `{ group, items:[{id,label,icon,href}] }[]`; `useAuth()` (`user`, `hasPermission`), `useModules().isEnabled`, `useInstalledPlugins()`, `useTheme()`.
- Produces: `export function FluidDock()` — the sole shell nav. Renders a fixed, vertically-centered glass dock.

- [ ] **Step 1: Build `FluidDock`** — reuse the exact plugin-nav mapping + `buildNav` call from `FluidSidebar.tsx` (lines 19–42). Render this structure:
  - Root `<nav className="glass-panel group fl-dock">`, inline style: `position:fixed; left:16; top:'50%'; transform:'translateY(-50%)'; maxHeight:'calc(100vh - 32px)'; zIndex:40; borderRadius:28; padding:'16px 12px'; display:flex; flexDirection:column; gap:8; overflow:hidden;`. Width via CSS class (Step 2), NOT JS. Remove ALL `onMouseEnter`/`onMouseLeave`.
  - Top: logo `MSIcon name="cloud_done"` (primary) + a `<span className="fl-dock-label">Vencore</span>`.
  - Middle: `<div style={{flex:1, overflowY:'auto', minHeight:0}} className="fl-dock-scroll">` containing the groups. Each group: `<p className="fl-dock-group-label">{GROUP_LABEL[g.group]}</p>` then items. Each item is a `<Link>` with `MSIcon name={item.icon}` + `<span className="fl-dock-label">{item.label}</span>`. Active when `pathname === item.href || pathname.startsWith(item.href + '/')` → `background:'var(--fl-primary)'; color:'var(--fl-on-primary)'`. Item row: `display:flex; align-items:center; gap:14; padding:10px; border-radius:var(--fl-radius-pill); white-space:nowrap; text-decoration:none;`.
  - Bottom (pinned, `marginTop:auto`, `borderTop:'1px solid var(--fl-glass-border)'`, `paddingTop:8`): a `<Link href="/settings">` gear row (`MSIcon name="settings"` + `<span className="fl-dock-label">Settings</span>`, same item styling, active on `/settings`), then the user block: an avatar button that toggles a small menu. Use `Avatar name={user?.name} size={32}` as a `<button>`; on click set `open` state; render an absolutely-positioned glass menu to the right (`left:'100%'`) with three rows: `Profile` (`<Link href="/settings/profile">`), `Theme` (button calling `setTheme(theme==='dark'?'light':'dark')`, icon `light_mode`/`dark_mode`), `Sign out` (button calling `useAuth().logout` — confirm the logout fn name from `AuthContext`; the legacy `Sidebar.tsx` "Sign out" button shows the call to reuse). Close the menu on outside click (a `useEffect` document listener) and on route change.

- [ ] **Step 2: Add dock CSS** — append to `apps/web/modules/shared/fluid/fluid.css`:
```css
.fl-dock { width: 64px; transition: width .3s cubic-bezier(0.4,0,0.2,1); }
.fl-dock:hover { width: 232px; }
.fl-dock-label { opacity: 0; transition: opacity .2s; white-space: nowrap; font-family: var(--fl-font-body); font-size: 13px; font-weight: 600; }
.fl-dock:hover .fl-dock-label { opacity: 1; }
.fl-dock-group-label { margin: 0 0 4px; padding: 0 10px; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--fl-outline); white-space: nowrap; opacity: 0; transition: opacity .2s; }
.fl-dock:hover .fl-dock-group-label { opacity: .5; }
.fl-dock-scroll { scrollbar-width: thin; scrollbar-color: var(--fl-outline-variant) transparent; }
.fl-dock-scroll::-webkit-scrollbar { width: 6px; }
.fl-dock-scroll::-webkit-scrollbar-thumb { background: var(--fl-outline-variant); border-radius: 3px; }
```

- [ ] **Step 3: Typecheck** — `pnpm --filter @vencore/web exec tsc --noEmit` (or `pnpm -w typecheck`). Expected: no new errors from `FluidDock`. (Deletion of `FluidSidebar` happens in Task 2 to keep this compiling.)

- [ ] **Step 4: Commit**
```bash
git add apps/web/modules/shared/fluid/shell/FluidDock.tsx apps/web/modules/shared/fluid/fluid.css
git commit -m "feat(fluid): centered floating dock nav with settings + account menu"
```

### Task 2: Remove topbar, wire dock, reflow layout

**Files:**
- Modify: `apps/web/modules/shared/fluid/shell/FluidShell.tsx`
- Delete: `apps/web/modules/shared/fluid/shell/FluidTopbar.tsx`, `apps/web/modules/shared/fluid/shell/FluidSidebar.tsx`

**Interfaces:**
- Consumes: `FluidDock` (Task 1).
- Produces: shell with no topbar; `<main>` padding accounts for the collapsed dock (does not reflow on hover, since the dock overlays).

- [ ] **Step 1: Edit `FluidShell.tsx`** — replace the `FluidSidebar`/`FluidTopbar` imports with `import { FluidDock } from './FluidDock';`. In the JSX, replace `<FluidSidebar /><FluidTopbar />` with `<FluidDock />`. Change the `<main>` style to: `style={{ paddingTop: 32, paddingLeft: 104, paddingRight: 32, paddingBottom: 48, minHeight: '100vh' }}` (104 = 16 left + 64 dock + 24 gap). Keep the provider wrappers and `fluid-root` div unchanged.

- [ ] **Step 2: Delete stale files**
```bash
git rm apps/web/modules/shared/fluid/shell/FluidTopbar.tsx apps/web/modules/shared/fluid/shell/FluidSidebar.tsx
```

- [ ] **Step 3: Grep for stragglers** — `grep -rn "FluidTopbar\|FluidSidebar" apps/web` must return nothing. Fix any remaining import.

- [ ] **Step 4: Typecheck** — `pnpm -w typecheck`. Expected: clean.

- [ ] **Step 5: Verify live** — load `/crm/contacts`: dock centered-left, collapsed to icons, smoothly expands on hover with labels fading in, groups scroll internally, no topbar, content not shifting on hover. Settings gear + avatar menu present; menu opens/closes; theme toggle works; Sign out works; Profile links to `/settings/profile`.

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat(fluid): remove topbar, mount dock, reflow shell padding"
```

---

# PHASE 1 — Deal linkage (backend)

### Task 3: Migration + schema for pipeline_items links

**Files:**
- Create: `packages/db/migrations/20260724_001_pipeline_items_links.ts`
- Modify: `packages/db/src/schema.ts` (`PipelineItemTable`, ~line 298)

**Interfaces:**
- Produces: `pipeline_items.contact_id: uuid | null`, `pipeline_items.company_id: uuid | null` (FKs, indexed). `PipelineItemTable` gains `contact_id: string | null; company_id: string | null`.

- [ ] **Step 1: Write migration** (mirror the style of `20260722_002_companies_fluid_fields.ts`):
```ts
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('pipeline_items')
    .addColumn('contact_id', 'uuid', c => c.references('contacts.id').onDelete('set null'))
    .addColumn('company_id', 'uuid', c => c.references('companies.id').onDelete('set null'))
    .execute();
  await db.schema.createIndex('pipeline_items_contact_id_idx').on('pipeline_items').column('contact_id').execute();
  await db.schema.createIndex('pipeline_items_company_id_idx').on('pipeline_items').column('company_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('pipeline_items_company_id_idx').execute();
  await db.schema.dropIndex('pipeline_items_contact_id_idx').execute();
  await db.schema.alterTable('pipeline_items').dropColumn('company_id').dropColumn('contact_id').execute();
}
```

- [ ] **Step 2: Update `PipelineItemTable`** in `packages/db/src/schema.ts` — add `contact_id: string | null;` and `company_id: string | null;` to the interface (nullable, insert-optional — follow how other nullable FK columns are typed in that file, e.g. `ColumnType`/`| null`).

- [ ] **Step 3: Build db package + run migration on local DB**
```bash
pnpm --filter @vencore/db build
cd apps/api && pnpm db:migrate && cd -
```
Expected: migration `20260724_001_pipeline_items_links` applied. Verify: `docker exec vencore-db-1 psql -U vencore -d vencore -c "\\d pipeline_items"` shows `contact_id`, `company_id`.

- [ ] **Step 4: Commit**
```bash
git add packages/db/migrations/20260724_001_pipeline_items_links.ts packages/db/src/schema.ts
git commit -m "feat(db): add contact_id/company_id links to pipeline_items"
```

### Task 4: Capture links on deal create/update

**Files:**
- Modify: `apps/api/src/routes/pipeline-items.ts` (create at ~line 128; find the update/patch handler — the `createItemRouter`/`PATCH` path; `updateItem` in `crm/pipeline/lib/items` calls it)
- Test: `apps/api/src/__tests__/pipeline-items-links.test.ts` (new; mirror the Kysely-mock pattern in `apps/api/src/__tests__/contacts-overview.test.ts`)

**Interfaces:**
- Consumes: `createItemSchema`, `updateItemSchema` (in `pipeline-items.ts` — read them).
- Produces: create + update accept optional `contact_id?: string (uuid)`, `company_id?: string (uuid)` and persist to the columns.

- [ ] **Step 1: Write failing test** — assert the create handler inserts `contact_id`/`company_id` when provided. Use the existing mock harness; assert the values passed to `insertInto('pipeline_items').values(...)` include `contact_id`/`company_id`. (Copy the mock scaffolding from `contacts-overview.test.ts` verbatim, adapt the asserted call.)

- [ ] **Step 2: Run test → FAIL** — `pnpm --filter @vencore/api exec vitest run src/__tests__/pipeline-items-links.test.ts`. Expected: FAIL (columns not passed).

- [ ] **Step 3: Implement** — extend `createItemSchema` with `contact_id: z.string().uuid().nullish()` and `company_id: z.string().uuid().nullish()`. In the create `.values({...})`, add `contact_id: body.contact_id ?? null, company_id: body.company_id ?? null`. Do the same for the update handler + `updateItemSchema` (only set when present).

- [ ] **Step 4: Run test → PASS**.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/routes/pipeline-items.ts apps/api/src/__tests__/pipeline-items-links.test.ts
git commit -m "feat(api): capture contact/company on deal create+update"
```

### Task 5: Seed + backfill deal links

**Files:**
- Modify: `apps/api/src/lib/seed-demo.ts` (the deals insert — confirm it writes `pipeline_items`; if it still writes `deals`, correct it to `pipeline_items` with `field_values` + new columns)
- Create: `apps/api/src/scripts/backfill-pipeline-item-links.ts` (mirror an existing script in `apps/api/src/scripts/`)

**Interfaces:**
- Produces: seeded deals carry `contact_id`/`company_id`; a runnable backfill sets links on existing rows by matching `field_values.name` prefix (before " — ") to a company name, and the company's first contact.

- [ ] **Step 1: Seed links** — in `seed-demo.ts`, for each seeded deal set `contact_id` and `company_id` to the already-known seed ids (the deal rows already reference `contact_id: amir.id, company_id: stackline.id`, etc.). Ensure the insert targets `pipeline_items` with `field_values: { name, value, probability, close_date }` AND top-level `contact_id`/`company_id`. (If seed currently inserts into a `deals` table that no longer exists, this also fixes seed.)

- [ ] **Step 2: Backfill script** — query `pipeline_items WHERE contact_id IS NULL AND deleted_at IS NULL`; for each, take `field_values->>'name'`, split on `' — '`, match the prefix to `companies.name` (ilike), set `company_id`, and set `contact_id` to that company's first contact. Log counts with the structured logger. Guard by workspace.

- [ ] **Step 3: Run backfill on local DB**
```bash
pnpm --filter @vencore/api exec tsx src/scripts/backfill-pipeline-item-links.ts
```
Verify: `docker exec vencore-db-1 psql -U vencore -d vencore -c "SELECT count(*) FILTER (WHERE contact_id IS NOT NULL) FROM pipeline_items;"` > 0.

- [ ] **Step 4: Commit**
```bash
git add apps/api/src/lib/seed-demo.ts apps/api/src/scripts/backfill-pipeline-item-links.ts
git commit -m "feat(api): seed + backfill deal contact/company links"
```

---

# PHASE 2 — Contact + Company detail

### Task 6: Fix contact overview endpoint

**Files:**
- Modify: `apps/api/src/routes/contacts-overview.ts`
- Modify: `packages/types/src/index.ts` (`ContactOverview` — add `tasks: Task[]`)
- Test: `apps/api/src/__tests__/contacts-overview.test.ts` (update assertions)

**Interfaces:**
- Consumes: `pipeline_items` (with new `contact_id`), `pipeline_stages`, `tasks`, `activities`.
- Produces: `GET /api/contacts/:id/overview` → `{ contact, deals: Deal[], activities, tasks, metrics, stage_funnel }`. `Deal` mapped from `pipeline_items`: `{ id, name: field_values.name, value: Number(field_values.value ?? 0), stage_id, stage: <stage name>, contact_id, company_id }`.

- [ ] **Step 1: Update `ContactOverview` type** — add `tasks: Task[];` (import `Task` from this package; confirm the `Task` interface exists in `packages/types/src/index.ts` — it backs `GET /api/tasks`).

- [ ] **Step 2: Update test → FAIL** — change the mock so `selectFrom('pipeline_items')` returns rows with `field_values`+`contact_id`; assert the response `deals[0].value`/`.stage` are mapped from `field_values`/`pipeline_stages`, and that `tasks` is populated from `selectFrom('tasks')`. Run: `pnpm --filter @vencore/api exec vitest run src/__tests__/contacts-overview.test.ts` → FAIL.

- [ ] **Step 3: Rewrite the route** — replace the `selectFrom('deals')` block with:
  - `deals` from `db.selectFrom('pipeline_items').selectAll().where('workspace_id','=',ws).where('contact_id','=',id).where('deleted_at','is',null).execute()`.
  - Fetch stage names: `db.selectFrom('pipeline_stages').select(['id','name']).where('id','in', deals.map(d=>d.stage_id))` → `Map`. (Guard empty `in` list.)
  - Map each item to the `Deal` shape above (value/name from `field_values`, `stage` from the map).
  - `tasks` from `db.selectFrom('tasks').selectAll().where('workspace_id','=',ws).where('contact_id','=',id).orderBy('created_at','desc').limit(50).execute()`.
  - Keep `activities` query as-is. Recompute `total_deal_value` from mapped deals; `current_stage` = first deal's stage name; keep `stage_funnel` keyed by stage name now.
  - Return the envelope with `tasks` added.

- [ ] **Step 4: Run test → PASS**.

- [ ] **Step 5: Build types + verify live** — `pnpm --filter @vencore/types build`. Load `/crm/contacts/<id>` → no 500; deals + funnel + metrics render.

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/routes/contacts-overview.ts packages/types/src/index.ts apps/api/src/__tests__/contacts-overview.test.ts
git commit -m "fix(api): contact overview reads pipeline_items + tasks"
```

### Task 7: Company overview endpoint

**Files:**
- Create: `apps/api/src/routes/companies-overview.ts` (mirror `contacts-overview.ts`)
- Modify: `apps/api/src/index.ts` (mount it on `/api/companies`)
- Modify: `packages/types/src/index.ts` (add `CompanyOverview`, `CompanyOverviewMetrics`)
- Test: `apps/api/src/__tests__/companies-overview.test.ts` (new)

**Interfaces:**
- Produces: `GET /api/companies/:id/overview` → `{ company, contacts: Contact[], deals: Deal[], activities, tasks, metrics }`. `CompanyOverviewMetrics { total_deal_value; open_deal_count; contact_count; last_activity_at: string | null }`.

- [ ] **Step 1: Add types** — `CompanyOverviewMetrics` + `CompanyOverview` in `packages/types/src/index.ts`.

- [ ] **Step 2: Write test → FAIL** — mirror `contacts-overview.test.ts`; assert company + contacts (`WHERE company_id`) + deals (`pipeline_items WHERE company_id`) + metrics. Run → FAIL.

- [ ] **Step 3: Implement route** — `createCompaniesOverviewRouter(db, requirePermission)` with `router.get('/:id/overview', requirePermission('<companies read perm>'), ...)`. Confirm the exact companies read permission string from `apps/api/src/routes/companies.ts` (use the same one its `GET /:id` uses). Queries: company row; `contacts WHERE company_id=:id AND deleted_at IS NULL`; deals `pipeline_items WHERE company_id=:id` mapped like Task 6; activities across those contacts (`WHERE contact_id IN (...)`, guard empty); tasks across those contacts; metrics.

- [ ] **Step 4: Mount** — in `index.ts`, next to the contacts-overview mount, add `app.use('/api/companies', requireAuth, createCompaniesOverviewRouter(db, requirePermission));` (match how contacts-overview is mounted, including any `requireCrmFeature`).

- [ ] **Step 5: Run test → PASS**; `pnpm --filter @vencore/types build`.

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/routes/companies-overview.ts apps/api/src/index.ts packages/types/src/index.ts apps/api/src/__tests__/companies-overview.test.ts
git commit -m "feat(api): company overview endpoint"
```

### Task 8: Contact detail — deals section + Tasks panel

**Files:**
- Create: `apps/web/modules/crm/fluid/shared/useRecordTasks.ts`, `apps/web/modules/crm/fluid/shared/TasksPanel.tsx`
- Modify: `apps/web/modules/crm/fluid/lib/useContactOverview.ts` (type now includes `tasks`/mapped `deals` — no code change if it returns `ContactOverview`), `apps/web/modules/crm/fluid/contacts/ContactDetailScreen.tsx`

**Interfaces:**
- Produces:
  - `useRecordTasks(contactId: string)` → react-query over `GET /api/tasks?contact_id=` returning `Task[]` (reuse `apiFetch` + `useApiToken` like `useContactOverview`).
  - `TasksPanel({ contactId }: { contactId: string })` — a `GlassCard` titled "Tasks": list of tasks with a checkbox to toggle done (reuse the toggle mutation from `@/modules/crm/tasks/lib/taskMutations` — confirm signature), an inline quick-add (title + optional due) posting `POST /api/tasks` with `contact_id`, and an `EmptyState` when none.

- [ ] **Step 1: `useRecordTasks`** — query key `['record-tasks','contact',contactId]`, fetch `/api/tasks?contact_id=${contactId}`, return `res.data` (Task[]). (Confirm the list response envelope from `tasks.ts` — likely `{ data: Task[], ... }`.)

- [ ] **Step 2: `TasksPanel`** — render per Interfaces. Use `MSIcon`, `FluidButton`, `FluidInput`, `EmptyState`, `GlassCard`. On toggle/add, invalidate `['record-tasks',...]` (and `['contact-overview',contactId]`).

- [ ] **Step 3: Wire deals + panel into `ContactDetailScreen`** — destructure `deals` and `tasks` from overview `data`. Add a "Deals" `GlassCard` (below Interaction History or in the right column) listing `deals` (name, `$value`, stage `FluidBadge`); `EmptyState icon="account_tree" title="No linked deals"` when empty. Add `<TasksPanel contactId={id} />` in the layout (replace or complement `FluidPanelSlot`). Keep `PageHeader`/metrics.

- [ ] **Step 4: Typecheck** — `pnpm -w typecheck` clean.

- [ ] **Step 5: Verify live** — `/crm/contacts/<id>` shows deals, a Tasks panel; toggling a task + adding one works and persists on reload.

- [ ] **Step 6: Commit**
```bash
git add apps/web/modules/crm/fluid/shared apps/web/modules/crm/fluid/contacts/ContactDetailScreen.tsx
git commit -m "feat(crm): contact detail deals section + embedded tasks panel"
```

### Task 9: Company detail page

**Files:**
- Create: `apps/web/modules/crm/fluid/lib/useCompanyOverview.ts` (mirror `useContactOverview.ts`)
- Create: `apps/web/modules/crm/fluid/companies/CompanyDetailScreen.tsx` (mirror `ContactDetailScreen.tsx`)
- Create: `apps/web/app/(fluid)/crm/companies/[id]/page.tsx`
- Modify: `apps/web/modules/crm/fluid/companies/CompaniesScreen.tsx` (clickable rows)

**Interfaces:**
- Consumes: `GET /api/companies/:id/overview` (Task 7), `CompanyOverview` type.
- Produces: `/crm/companies/[id]` route rendering `CompanyDetailScreen`.

- [ ] **Step 1: `useCompanyOverview(id)`** — copy `useContactOverview.ts`, swap URL to `/api/companies/${id}/overview`, type `CompanyOverview`.

- [ ] **Step 2: `CompanyDetailScreen({ id })`** — mirror `ContactDetailScreen` layout: `PageHeader` (company name, industry subtitle); metric pills (Total Deal Value, Open Deals, Contacts, Last Activity from `metrics`); left `GlassCard` "Contacts" listing the company's contacts (each a `<Link href={/crm/contacts/${c.id}}>`), a "Deals" `GlassCard`; right column "Detailed Information" (industry/location/website/employee_count) + `<TasksPanel contactId={...}>`? — for company, add a company variant: pass the company's contact ids or add a `companyId` prop to `TasksPanel`. Simplest: render a read-only company tasks list from `overview.tasks` in a `GlassCard` (no company-scoped quick-add). Use `EmptyState` for empty sections.

- [ ] **Step 3: Route page** — `app/(fluid)/crm/companies/[id]/page.tsx`:
```tsx
import { CompanyDetailScreen } from '@/modules/crm/fluid/companies/CompanyDetailScreen';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompanyDetailScreen id={id} />;
}
```
(Match the exact params signature used by `app/(fluid)/crm/contacts/[id]/page.tsx` — copy its shape.)

- [ ] **Step 4: Clickable rows** — in `CompaniesScreen.tsx`, make the `name` column cell a `<Link href={/crm/companies/${r.id}}>` (or add an `onRowClick` if `FluidTable` supports it — check `FluidTable` props; if not, wrap the name). Keep styling.

- [ ] **Step 5: Verify live** — `/crm/companies` rows navigate to `/crm/companies/<id>`; detail shows contacts/deals/tasks/metrics; no 500.

- [ ] **Step 6: Commit**
```bash
git add apps/web/modules/crm/fluid/lib/useCompanyOverview.ts apps/web/modules/crm/fluid/companies/CompanyDetailScreen.tsx "apps/web/app/(fluid)/crm/companies/[id]/page.tsx" apps/web/modules/crm/fluid/companies/CompaniesScreen.tsx
git commit -m "feat(crm): company detail page + clickable company rows"
```

---

# PHASE 3 — Tasks hub redesign

### Task 10: Fluid Tasks hub rebuild with record links

**Files:**
- Rewrite: `apps/web/modules/crm/fluid/tasks/TasksScreen.tsx`
- Reference (read, reuse only the data layer): `apps/web/modules/crm/tasks/lib/useUnifiedTasks.ts`, `.../taskMutations.ts`, `.../types.ts` (`UnifiedTask`, `UnifiedTasksFilters`, `DueBucket`, `BUCKET_LABELS`, `BUCKET_ORDER`).

**Interfaces:**
- Consumes: `useUnifiedTasks(filters)` → `{ data?: { data: Record<DueBucket, UnifiedTask[]>, total } }`; mutations `useToggleTask`, `useDeleteTask`, `useEditTaskTitle`, `useBulkToggleTasks`, `useBulkDeleteTasks`; `useAuth().hasPermission`.
- Produces: a fully Fluid Tasks hub. Each task row links to its contact (`task.contact_id` → `/crm/contacts/:id`) when present.

- [ ] **Step 1: Rebuild the screen** — keep the existing state/handlers from the current `TasksScreen.tsx` (filters, selection, toggle/delete/bulk, confirm dialog) but replace the legacy inner components (`TaskGroup`, `TaskFilterBar`, `BulkActionBar`, `TaskDetailPanel`, `AddTaskModal` from `@/modules/crm/tasks/components/*`) with Fluid-native rendering:
  - `PageHeader title="Tasks"` + metric pills (Total / Overdue / Due Today / This Week) — reuse the existing `MetricPill` block.
  - Filters as `FluidChip` pills (status: To do / Done / All; plus assignee "Mine/All" if admin) instead of `TaskFilterBar`.
  - Each due-bucket (`BUCKET_ORDER`) → a `GlassCard` section titled `BUCKET_LABELS[bucket]` (Space Grotesk heading), overdue bucket accented red. Inside, one row per task: a round toggle button (done ↔ todo via `useToggleTask`), the title (inline-editable via `useEditTaskTitle` on blur), a due-date chip, and — when `task.contact_id` — a `FluidChip`/`<Link href={/crm/contacts/${task.contact_id}}>` showing the linked contact (fetch contact name if the task payload lacks it; if `UnifiedTask` already carries `contact_name`, use it — confirm from `types.ts`). Right-side actions: delete (perm-gated) via context menu or an icon button.
  - Keep bulk selection + a Fluid `BulkActionBar` equivalent (a floating glass bar) using the bulk mutations.
  - Quick-add: a Fluid inline add (title + optional due + optional contact) → existing add mutation/endpoint. Reuse `AddTaskModal`'s mutation logic but render Fluid; or a compact inline form.
  - `EmptyState` when `total === 0`.
- Do NOT import from `@/modules/crm/tasks/components/*`. Data hooks/mutations from `@/modules/crm/tasks/lib/*` are fine.

- [ ] **Step 2: Typecheck** — `pnpm -w typecheck` clean.

- [ ] **Step 3: Verify live** — `/crm/tasks`: Fluid look, buckets, toggle/edit/add/delete/bulk all work; contact chips link to contact detail.

- [ ] **Step 4: Commit**
```bash
git add apps/web/modules/crm/fluid/tasks/TasksScreen.tsx
git commit -m "feat(crm): redesign tasks hub in fluid with contact links"
```

---

# PHASE 4 — Settings access + CRM module settings

### Task 11: Module-row gear → CRM module settings page

**Files:**
- Modify: `apps/web/modules/settings/fluid/modules/ModulesListPanel.tsx` (add a gear per row)
- Modify: `apps/web/app/(fluid)/settings/modules/[moduleId]/page.tsx` (render the module's settings; `moduleId === 'crm'` → `CrmPreferencesPanel`)
- Reference: `apps/web/modules/crm/fluid/settings/register.ts`, `CrmPreferencesPanel.tsx`.

**Interfaces:**
- Produces: each module row in `/settings/modules` shows a gear icon linking to `/settings/modules/:moduleId`; `/settings/modules/crm` renders `CrmPreferencesPanel`.

- [ ] **Step 1: Read `ModulesListPanel.tsx` + `[moduleId]/page.tsx`** — learn how rows + moduleId are keyed today (module slug). Confirm the CRM module's slug (`crm`).

- [ ] **Step 2: Add gear to each row** — in `ModulesListPanel`, append to each module row a `<Link href={/settings/modules/${module.slug}}>` with `MSIcon name="settings"` (icon-button styling, `aria-label={`${module.name} settings`}`). Keep existing enable/disable controls.

- [ ] **Step 3: Render module settings in `[moduleId]/page.tsx`** — resolve `moduleId`; for `crm`, render `<CrmPreferencesPanel />` (import from `@/modules/crm/fluid/settings/CrmPreferencesPanel`) inside the fluid settings layout. For other modules, render a graceful "No settings for this module yet" `EmptyState`. Guard admin (match how other settings pages gate; the panel is admin-only per its registration).

- [ ] **Step 4: Verify live** — `/settings/modules` shows a gear on the CRM row; clicking it → `/settings/modules/crm` renders the CRM preferences panel. Dock Settings gear → `/settings` still works.

- [ ] **Step 5: Commit**
```bash
git add apps/web/modules/settings/fluid/modules/ModulesListPanel.tsx "apps/web/app/(fluid)/settings/modules/[moduleId]/page.tsx"
git commit -m "feat(settings): module-row gear opens per-module settings; crm wired"
```

### Task 12: Finish CRM settings persistence

**Files:**
- Modify: `apps/web/modules/crm/fluid/settings/CrmPreferencesPanel.tsx`
- Create/modify: an API route for CRM workspace settings — reuse the existing `cross_module_settings` table (grep `cross_module_settings` in `apps/api/src` for the existing read/write helper; there is a `cross-module-settings` mechanism) OR the module settings route if one exists. Test: settings route test mirroring an existing settings route test.

**Interfaces:**
- Produces: `CrmPreferences` persisted server-side (workspace-scoped) via `GET`/`PUT` `/api/settings/crm` (or the existing cross-module settings endpoint), replacing the `localStorage` stub.

- [ ] **Step 1: Locate the persistence mechanism** — grep `cross_module_settings` and `settings` routes in `apps/api/src`. Prefer an existing generic per-module settings endpoint. If one exists, use it; if not, add `GET`/`PUT /api/settings/crm` backed by `cross_module_settings` (workspace + module key `crm`, JSON value), Zod-validated, admin-gated. Write a route test (mirror an existing settings route test with the Kysely mock).

- [ ] **Step 2: Run route test → PASS**.

- [ ] **Step 3: Swap the panel's persistence** — replace `loadPrefs`/`savePrefs` (localStorage) with a react-query `useQuery`/`useMutation` against the endpoint (reuse `apiFetch` + `useApiToken`). Keep the same `CrmPreferences` shape + controls; show the "Saved" confirmation on mutation success. Keep it admin-gated.

- [ ] **Step 4: Verify live** — change a CRM preference, save, reload in another tab/session → persists server-side.

- [ ] **Step 5: Typecheck + api tests** — `pnpm -w typecheck` and `pnpm --filter @vencore/api exec vitest run` green.

- [ ] **Step 6: Commit**
```bash
git add apps/web/modules/crm/fluid/settings/CrmPreferencesPanel.tsx apps/api/src/routes apps/api/src/__tests__
git commit -m "feat(crm): persist CRM preferences via workspace settings"
```

---

## Final verification

- [ ] `pnpm -w typecheck` clean; `pnpm --filter @vencore/api exec vitest run` green.
- [ ] Walk every screen live (dock, contacts list + detail, companies list + detail, pipeline, tasks hub, settings modules + CRM settings) against the source mocks + `DESIGN.md`.
- [ ] Whole-branch review (`superpowers:requesting-code-review`), triage findings.
- [ ] Run graphify update (`/graphify . --update`, user-invoked) per CLAUDE.md.
- [ ] `superpowers:finishing-a-development-branch`.

## Self-review notes (coverage vs spec)

- Shell dock + topbar removal → Tasks 1–2. Deal-linkage migration/create/seed → Tasks 3–5. Contact detail fix + tasks panel → Tasks 6, 8. Company detail + overview → Tasks 7, 9. Tasks integration (panels + redesigned hub) → Tasks 8, 9, 10. Settings access (dock gear in Task 1; module-row gear in Task 11) + finish CRM settings → Tasks 11–12. Design consistency → enforced per-screen + final walkthrough.
- Open confirmations left to the implementer (each flagged inline, low-risk): exact companies read-permission string; `UnifiedTask.contact_name` presence; `FluidTable` row-click support; `AuthContext` logout fn name; existing cross-module settings endpoint shape.
