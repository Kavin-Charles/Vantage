# Pipeline Overhaul — Design Spec
**Date:** 2026-06-02  
**Status:** Approved  

## Goal

Replace the deals-specific pipeline with a generic pipeline engine. Migrate all existing deal data into the new engine. Rewrite API routes and UI from scratch for quality and completeness. Merge conversions into the pipeline/record-types system. Ship: DnD kanban, table view, list view, pipeline settings UI, record type + field editor, contextual conversion workflow.

---

## What Gets Deleted

```
apps/api/src/routes/deals.ts
apps/api/src/routes/v1/deals.ts
apps/api/src/__tests__/deals-import.test.ts
apps/api/src/routes/records.ts                      ← rewrite
apps/api/src/routes/records.test.ts                 ← rewrite
apps/api/src/routes/record-types.ts                 ← rewrite
apps/api/src/routes/record-types.test.ts            ← rewrite
apps/api/src/routes/conversions.ts                  ← merge into records + record-types
apps/api/src/routes/conversions.test.ts             ← rewrite as part of record-types tests
apps/web/components/deals/                          ← whole folder
apps/web/components/pipeline/DealKanban.tsx
apps/web/lib/deals.ts
apps/web/app/(dashboard)/settings/pipelines/conversions/  ← whole folder
```

---

## Database Migration

**File:** `packages/db/migrations/20260602_001_migrate_deals_to_records.ts`

### Steps (in order, wrapped in transaction where possible)

1. **Seed Deal record type per workspace**
   - Insert into `record_types`: `name='Deal'`, `icon='💰'`, `auto_number_prefix='DEAL'`, `auto_number_enabled=true`
   - One per workspace (from distinct `workspace_id` values in `deals`)
   - Insert default permissions: admin (all), member (view/create/edit)

2. **Seed Deal record type fields**
   - `value` — type `number`, position 0
   - `probability` — type `number`, position 1
   - `close_date` — type `date`, position 2
   - Keyed to the Deal record type per workspace

3. **Migrate deals → pipeline_records**
   - Map: `name`, `pipeline_id`, `stage_id`, `contact_id`, `company_id`, `owner_id`, `workspace_id`, `deleted_at`, `created_at`, `updated_at`
   - Set `record_type_id` to the Deal record type for that workspace
   - Auto-generate `record_number` from sequence

4. **Migrate deal field values**
   - `deals.value` → `record_field_values` (field: value field id, value: jsonb number)
   - `deals.probability` → `record_field_values` (field: probability field id)
   - `deals.close_date` → `record_field_values` (field: close_date field id)
   - Existing `deal_field_values` → `record_field_values` (remapped to `record_type_fields` ids)

5. **Drop old tables**
   ```sql
   DROP TABLE deal_field_values;
   DROP TABLE stage_fields;
   DROP TABLE deals;
   ```

6. **Backfill `pipelines.record_type_id`**
   - Update each pipeline's `record_type_id` to the Deal record type for its workspace

---

## API Routes

### Convention
- All responses: `{ data, error }` shape
- Auth: JWT middleware (`AuthenticatedRequest`)
- Workspace scoping: always filter by `workspace.id`
- Error codes: `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`

### `/api/record-types`

```
GET    /                          List all record types (workspace-scoped, ordered by position)
POST   /                          Create record type + seed default permissions
PATCH  /:id                       Update (name, icon, description, auto_number_*)
DELETE /:id                       Delete — 409 CONFLICT if pipeline_records exist for this type

GET    /:id/fields                List fields ordered by position
POST   /:id/fields                Add field (label, field_type, is_required, options, position)
PATCH  /:id/fields/reorder        Bulk reorder — body: { ids: string[] }
PATCH  /:id/fields/:fid           Update field
DELETE /:id/fields/:fid           Delete field + cascade record_field_values

GET    /:id/conversions           List conversion templates (with field_mappings enriched)
POST   /:id/conversions           Create template + field_mappings in one call
PATCH  /:id/conversions/:tid      Update template — replaces field_mappings atomically
DELETE /:id/conversions/:tid      Delete template + cascade mappings
```

**Create record type body:**
```ts
{
  name: string
  icon?: string
  description?: string
  auto_number_enabled?: boolean
  auto_number_prefix?: string   // required if auto_number_enabled
}
```

**Create field body:**
```ts
{
  label: string
  field_type: 'text' | 'number' | 'date' | 'select' | 'boolean'
  is_required?: boolean
  options?: { label: string; value: string }[]  // for select type only
  position?: number
}
```

**Create conversion template body:**
```ts
{
  name: string
  target_type_id: string
  target_pipeline_id: string
  target_stage_id: string
  position?: number
  field_mappings: Array<{
    source_field_id?: string    // xor source_builtin
    source_builtin?: 'name' | 'contact_id' | 'company_id' | 'owner_id'
    target_field_id?: string    // xor target_builtin
    target_builtin?: 'name' | 'contact_id' | 'company_id' | 'owner_id'
  }>
}
```

---

### `/api/pipelines`

```
GET    /                          List pipelines with stages + record_type (ordered by position)
POST   /                          Create pipeline (must supply record_type_id)
PATCH  /:id                       Update (name, view, table_columns)
DELETE /:id                       Delete — 409 CONFLICT if pipeline_records exist
GET    /:id                       Get pipeline with stages + record_type + record_type_fields

POST   /:id/stages                Add stage
PATCH  /:id/stages/reorder        Bulk reorder — body: { ids: string[] }
PATCH  /:id/stages/:sid           Update stage (name, color, is_won, is_lost)
DELETE /:id/stages/:sid           Delete — 409 CONFLICT if records exist in stage
```

**GET /:id response:**
```ts
{
  data: {
    id, workspace_id, name, view, table_columns, record_type_id, position,
    record_type: RecordType & { fields: RecordTypeField[] },
    stages: PipelineStage[]
  }
}
```

**Create pipeline body:**
```ts
{
  name: string
  record_type_id: string
  view?: 'kanban' | 'table' | 'list'
}
```

---

### `/api/records`

```
GET    /                          List records (always joins field_values)
POST   /                          Create record + field_values atomically
GET    /:id                       Get record + field_values
PATCH  /:id                       Update record + field_values (enforces stage_required_fields)
DELETE /:id                       Soft delete (sets deleted_at)
POST   /:id/convert               Execute conversion → returns { source, target } records
```

**GET / query params:**
```
pipeline_id, stage_id, record_type_id, owner_id, contact_id, company_id
q (name search), page, per_page
```

**GET / response item shape:**
```ts
{
  id, workspace_id, record_type_id, pipeline_id, stage_id, record_number,
  name, contact_id, company_id, owner_id, deleted_at, created_at, updated_at,
  field_values: { field_id: string; value: unknown }[]
}
```

**Create record body:**
```ts
{
  record_type_id: string
  pipeline_id: string
  stage_id: string
  name: string
  owner_id: string
  contact_id?: string
  company_id?: string
  field_values?: Record<string, unknown>  // field_id → value
}
```

**PATCH /:id — stage enforcement:**
- If `stage_id` changes, load `stage_required_fields` for the target stage
- If any required field has no value in body or existing `record_field_values` → 422 with list of missing field labels

**POST /:id/convert body:**
```ts
{
  template_id: string
  field_overrides?: Record<string, unknown>  // builtin or field_id → value
}
```

**POST /:id/convert response:**
```ts
{
  data: {
    source: PipelineRecord,
    target: PipelineRecord & { field_values: RecordFieldValue[] }
  }
}
```

---

## UI Structure

### Pages

#### `pipeline/page.tsx`
- Fetch pipelines list
- Redirect to `pipeline/[defaultPipelineId]` (first with `is_default=true`, else first)
- If no pipelines: empty state with "Create your first pipeline" CTA

#### `pipeline/[pipelineId]/page.tsx`
Toolbar: pipeline switcher | view toggle (kanban/table/list) | search | filter dropdown | "+ Add record" button

Renders based on `pipeline.view`:
- `'kanban'` → `<PipelineKanban />`
- `'table'` → `<PipelineTable />`
- `'list'` → `<PipelineList />`

View toggle calls `PATCH /api/pipelines/:id { view }` — optimistic update.

#### `settings/pipelines/page.tsx`
- List pipelines (cards with name, record type, stage count)
- "+ Create pipeline" → modal: name + record type picker
- Click pipeline → inline stage editor:
  - Drag to reorder stages
  - Click stage to edit: name, color, is_won/is_lost toggle
  - "+ Add stage" appends
  - Delete stage (warns if records exist)

#### `settings/pipelines/record-types/page.tsx`
- List record types
- "+ Create record type" → modal: name, icon, auto-number settings
- Click record type → expands to two tabs:
  - **Fields** — add/edit/reorder/delete fields (drag to reorder)
  - **Converts to →** — list conversion templates. Click "+ Add conversion": pick target type → target pipeline → target stage → field mapper

---

### Components

#### `PipelineKanban.tsx`
- Columns = active stages (filtered: `!is_won && !is_lost`)
- Won/Lost stages shown as collapsed summary rows at end
- Column header: stage name (colored dot), record count, sum of `value` field (if field named 'value' of type number exists on the record type)
- HTML5 DnD: `draggable` on `RecordCard`, `onDragOver`/`onDrop` on column
- Drop → `PATCH /api/records/:id { stage_id }` — optimistic move, revert on error
- Keyboard: `+` or toolbar button → `RecordForm` create modal

#### `PipelineTable.tsx`
- Columns from `pipeline.table_columns` (saved per pipeline) or defaults (name, stage, owner, created_at)
- Sortable by column header click
- Inline edit: click cell → edit in place for text/number fields
- Column picker: gear icon → toggle visible fields

#### `PipelineList.tsx`
- Simple rows: record_number, name, stage pill, owner, contact, value
- Click row → opens `RecordDetailPanel`

#### `RecordCard.tsx`
- Compact: record_number (if enabled), name, contact name, value (if exists), owner avatar
- Click → opens `RecordDetailPanel`

#### `RecordDetailPanel.tsx`
Slide-over (right side, 480px wide):
- Header: name (editable inline), record_number, stage pill
- Sections: built-in fields (contact, company, owner) + dynamic `record_type_fields`
- Each field: label + editable value (input type matched to field_type)
- Auto-save on blur (debounced `PATCH`)
- Footer: "Convert to →" button group (one button per conversion template) — only shown if templates exist
- Delete button (soft delete, confirm dialog)

#### `RecordForm.tsx`
Create modal:
- Name (required)
- Pipeline + stage picker (pre-filled from current context)
- Owner picker (workspace users)
- Contact + company pickers (optional)
- Dynamic fields from `record_type.fields` (rendered by field_type)
- Submit → `POST /api/records`

#### `ConversionWizard.tsx`
3-step modal:
1. **Select template** (shown only if multiple templates) — source → target label, description
2. **Preview & override** — shows mapped fields pre-filled from source; user can edit any value
3. **Confirm** — shows summary, "Convert" button → `POST /api/records/:id/convert`

On success: dismiss + navigate to or highlight the new target record.

#### `ViewSwitcher.tsx`
Icon toggle: kanban / table / list. Active view highlighted. On switch: `PATCH /api/pipelines/:id { view }` + update local state.

#### `PipelineEditor.tsx` (settings)
Stage list with:
- Drag handle (reorder)
- Color swatch (click → color picker: 8 presets)
- Name (inline edit)
- Won/Lost badge toggle
- Delete icon

#### `RecordTypeEditor.tsx` (settings)
Field list with:
- Drag handle (reorder)
- Label (inline edit)
- Type badge (not editable after creation)
- Required toggle
- Options editor (for select type): add/remove/reorder options
- Delete icon

#### `FieldMappingEditor.tsx` (settings — inside conversion template editor)
Two-column mapper:
- Left column: source record type fields (builtins + custom)
- Right column: target record type fields (builtins + custom)
- Draw mapping lines with `+` add-row interface
- Each row: source field dropdown → target field dropdown → delete

---

## Type Changes (`packages/types/src/index.ts`)

**Remove:** `Deal`, `StageField` (keep `Pipeline`, `PipelineStage` — still used)

**Add:**
```ts
export interface PipelineRecord {
  id: string
  workspace_id: string
  record_type_id: string
  pipeline_id: string
  stage_id: string
  record_number: string | null
  name: string
  contact_id: string | null
  company_id: string | null
  owner_id: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface RecordFieldValue {
  id: string
  record_id: string
  field_id: string
  value: unknown
}

export interface RecordType {
  id: string
  workspace_id: string
  name: string
  icon: string | null
  description: string | null
  auto_number_enabled: boolean
  auto_number_prefix: string | null
  auto_number_sequence: number
  position: number
  created_at: string
  updated_at: string
}

export interface RecordTypeField {
  id: string
  record_type_id: string
  label: string
  field_type: 'text' | 'number' | 'date' | 'select' | 'boolean'
  options: { label: string; value: string }[] | null
  is_required: boolean
  position: number
  created_at: string
}

export interface RecordTypePermission {
  id: string
  record_type_id: string
  role: 'admin' | 'member'
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

export interface ConversionTemplate {
  id: string
  workspace_id: string
  name: string
  source_type_id: string
  target_type_id: string
  target_pipeline_id: string
  target_stage_id: string
  position: number
  created_at: string
}

export interface ConversionFieldMapping {
  id: string
  template_id: string
  source_field_id: string | null
  source_builtin: string | null
  target_field_id: string | null
  target_builtin: string | null
}
```

---

## Lib Files (`apps/web/lib/`)

**`records.ts`** — `listRecords`, `getRecord`, `createRecord`, `updateRecord`, `deleteRecord`, `convertRecord`

**`pipelines.ts`** — clean up existing: `listPipelines`, `getPipeline`, `updatePipeline`, `createPipeline`, `deletePipeline`, `addStage`, `updateStage`, `deleteStage`, `reorderStages`

**`record-types.ts`** — `listRecordTypes`, `createRecordType`, `updateRecordType`, `deleteRecordType`, `addField`, `updateField`, `deleteField`, `reorderFields`, `listConversions`, `createConversion`, `updateConversion`, `deleteConversion`

---

## Implementation Order

1. DB migration (data migration + drop deals)
2. Types package update
3. Rewrite `routes/record-types.ts` (includes conversions sub-routes)
4. Rewrite `routes/records.ts` (includes convert endpoint)
5. Rewrite `routes/pipelines.ts` (includes stages sub-routes)
6. Delete old route files, update app.ts mounts
7. Build lib files (records, pipelines, record-types)
8. Build settings UI (PipelineEditor, RecordTypeEditor, FieldMappingEditor)
9. Build pipeline pages + core components (PipelineKanban, PipelineTable, PipelineList)
10. Build RecordCard, RecordDetailPanel, RecordForm
11. Build ConversionWizard
12. Update analytics routes (remove deals references)
13. Delete deals components + lib/deals.ts
