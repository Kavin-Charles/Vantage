# Pipeline Views (Table + List) — Design Spec

**Date:** 2026-05-20
**Sub-project:** 2 of 2 for the Pipeline Engine

---

## Goal

Add Table and List views to the pipeline engine record system. Currently every pipeline renders only a Kanban board. Each pipeline will have a configured view type (set by an admin in pipeline settings), and the pipeline page will render the appropriate view component.

---

## Scope

**In scope:**
- DB migration: `view` + `table_columns` columns on `pipelines`
- API: expose + accept those fields in pipelines routes
- Settings UI: view selector + column picker in pipeline settings
- `RecordTable` component — sortable table with configurable columns
- `RecordList` component — flat, always-sorted-by-created list
- `[typeSlug]/page.tsx` — route conditionally renders the correct component

**Out of scope:**
- Calendar view (deferred)
- Per-user view overrides (YAGNI)
- Custom field columns in Table view
- Pagination (existing `RecordKanban` has none; List/Table match)

---

## Data Model

One migration adds two nullable columns to `pipelines`:

```sql
ALTER TABLE pipelines
  ADD COLUMN view varchar(20) NOT NULL DEFAULT 'kanban',
  ADD COLUMN table_columns jsonb;
```

- `view`: `'kanban' | 'table' | 'list'`, default `'kanban'`. Existing pipelines get `'kanban'` automatically.
- `table_columns`: ordered JSON array of column keys. `null` = use the default column set.

### Available column keys (Table view)

| Key | Label | Default? |
|---|---|---|
| `record_number` | Record # | ✓ |
| `name` | Name | ✓ |
| `stage` | Stage | ✓ |
| `owner_id` | Owner | ✓ |
| `contact_id` | Contact | ✗ |
| `company_id` | Company | ✗ |
| `created_at` | Created | ✓ |

Default set when `table_columns` is null: `['record_number', 'name', 'stage', 'owner_id', 'created_at']`

---

## API Changes

### `GET /api/pipelines` + `GET /api/pipelines/:id`

Return `view` and `table_columns` fields in all pipeline responses (already returned via `selectAll()` once migration runs).

### `PATCH /api/pipelines/:id`

Extend Zod update schema to accept:
```ts
view: z.enum(['kanban', 'table', 'list']).optional(),
table_columns: z.array(z.string()).nullable().optional(),
```

No new routes.

---

## Settings UI — Pipeline Settings Page

**File:** `apps/web/app/(dashboard)/settings/pipelines/page.tsx`

Each pipeline card/row gets two new controls:

1. **View** — `<select>` with options: Kanban · Table · List
2. **Columns** — checkbox group, visible only when View = Table

Columns available: Record #, Name, Stage, Owner, Contact, Company, Created.

**Auto-save on change** — `onChange`/`onBlur` fires a `PATCH /api/pipelines/:id` immediately. No explicit save button. Consistent with existing settings patterns.

When switching from Table to another view, `table_columns` is left as-is (preserve config for when admin switches back).

---

## Frontend Components

### `RecordTable` (`apps/web/components/pipeline/RecordTable.tsx`)

Props: `{ recordTypeId: string; pipelineId: string; columns: string[] }`

- Fetches records via `GET /api/records?pipeline_id=&record_type_id=` (same query as `RecordKanban`)
- Renders `<table>` with `<thead>` driven by `columns` prop
- Column header click → toggles sort asc/desc on that column (client-side, `Array.sort`)
- Sort state: `{ col: string; dir: 'asc' | 'desc' }`, default `{ col: 'created_at', dir: 'desc' }`
- Click row → sets `selectedRecordId` → renders `<RecordDetail>` drawer (existing component, zero changes)
- No drag-and-drop

**Column rendering:**

| Key | Render |
|---|---|
| `record_number` | Monospace `<code>` tag, dim color |
| `name` | Plain text, font-weight 500 |
| `stage` | Colored badge (reuse stage color logic from `RecordKanban`) |
| `owner_id` | Owner UUID truncated (future: resolve to name) |
| `contact_id` | Contact UUID truncated, or `—` |
| `company_id` | Company UUID truncated, or `—` |
| `created_at` | `toLocaleDateString()` |

### `RecordList` (`apps/web/components/pipeline/RecordList.tsx`)

Props: `{ recordTypeId: string; pipelineId: string }`

- Same fetch as RecordTable
- Always sorted `created_at` desc (no sort controls)
- Each row: `record_number` (monospace) · `name` (bold) · stage badge · owner initials pill · relative date
- Click row → `RecordDetail` drawer (same pattern)
- Hover: `background: var(--surface2)` on row

**Relative date:** if < 7 days use "N days ago", else `toLocaleDateString()`.

**Owner initials pill:** first letter of `owner_id` as placeholder (matches existing app pattern until user resolution is added).

### `[typeSlug]/page.tsx` — View dispatch

After resolving `pipeline`, read `pipeline.view`:

```tsx
{(!pipeline.view || pipeline.view === 'kanban') && (
  <RecordKanban recordTypeId={activeType.id} pipelineId={pipeline.id} />
)}
{pipeline.view === 'table' && (
  <RecordTable
    recordTypeId={activeType.id}
    pipelineId={pipeline.id}
    columns={pipeline.table_columns ?? DEFAULT_TABLE_COLUMNS}
  />
)}
{pipeline.view === 'list' && (
  <RecordList recordTypeId={activeType.id} pipelineId={pipeline.id} />
)}
```

`DEFAULT_TABLE_COLUMNS` constant: `['record_number', 'name', 'stage', 'owner_id', 'created_at']`

Pipeline interface extended to include `view: string | null` and `table_columns: string[] | null`.

---

## Error Handling

- Records fetch fails → show inline error message (same amber banner pattern as `RecordKanban`)
- Pipeline fetch fails → existing "No pipeline found" fallback
- PATCH in settings fails → show red inline error next to the control, revert optimistic state

---

## Testing

- Unit tests for `RecordTable`: renders correct columns, sort toggle works, clicking row calls detail
- Unit tests for `RecordList`: renders records sorted by `created_at` desc, relative date logic
- Unit tests for pipeline settings: PATCH called with correct payload on view change, column checkboxes toggle correctly
- API integration test: `PATCH /api/pipelines/:id` with `view` and `table_columns` persists correctly

---

## File Map

| Action | File |
|---|---|
| Create | `packages/db/migrations/20260520_001_pipeline_views.ts` |
| Modify | `packages/db/src/schema.ts` — add `view`, `table_columns` to `PipelinesTable` |
| Modify | `apps/api/src/routes/pipelines.ts` — add fields to update schema + selects |
| Modify | `packages/types/src/index.ts` — add `view: string`, `table_columns: string[] \| null` to `Pipeline` interface |
| Modify | `apps/web/lib/pipelines.ts` — add `view?: string`, `table_columns?: string[] \| null` to `updatePipeline` body type |
| Modify | `apps/web/app/(dashboard)/settings/pipelines/page.tsx` — view + column controls |
| Create | `apps/web/components/pipeline/RecordTable.tsx` |
| Create | `apps/web/components/pipeline/RecordList.tsx` |
| Modify | `apps/web/app/(dashboard)/pipeline/[typeSlug]/page.tsx` — view dispatch |
| Create | `apps/api/src/routes/pipelines.views.test.ts` |
| Create | `apps/web/components/pipeline/RecordTable.test.tsx` |
| Create | `apps/web/components/pipeline/RecordList.test.tsx` |
