# Pipeline Engine — Design Spec

**Date:** 2026-05-17
**Feature:** Sub-project 1 of 2 — Core Record Engine (replaces Deals + Pipelines)

---

## Context

Vantage currently has a deals-based pipeline system: `deals` table, `pipelines`, `pipeline_stages`, `stage_fields`, `deal_field_values`. This feature replaces it with a fully generic, configurable record engine where:

- Record types are user-defined (e.g. Enquiry, Quote, Job — or Deal, Lead, Opportunity)
- Each type has its own field schema, auto-numbering, and role permissions
- Pipelines and stages belong to a record type
- Records can be converted between types via configurable templates with field mappings
- All existing deal data migrates automatically with zero data loss

This design is intentionally scoped to the core engine only. Views (Table, List, Calendar) are sub-project 2.

---

## Goals

- Replace ATP CRM (github.com/Kavin-Charles/atp-crm): model Enquiry → Quote → Job conversion flows, auto-numbering, and role-gated access — all configurable, not hardcoded
- Preserve full backwards compatibility for existing Vantage workspaces (existing deals become "Deal" record type automatically)
- Kanban view continues working unchanged (adapted for generic records)

---

## Data Model

### New Tables

#### `record_types`
```sql
id            uuid PK default gen_random_uuid()
workspace_id  uuid FK → workspaces NOT NULL
name          text NOT NULL
icon          text NOT NULL DEFAULT '📋'
color         text NOT NULL DEFAULT '#6b665c'
position      int NOT NULL DEFAULT 0
auto_number_enabled  boolean NOT NULL DEFAULT false
auto_number_prefix   text NOT NULL DEFAULT ''
auto_number_format   text NOT NULL DEFAULT 'PREFIX-YY-NNN'
  -- tokens: PREFIX, YY, YYYY, NNN (zero-padded seq), NNNN, NNNNN
auto_number_sequence int NOT NULL DEFAULT 0
created_at    timestamptz NOT NULL DEFAULT now()
updated_at    timestamptz NOT NULL DEFAULT now()
```

#### `record_type_fields`
Replaces `stage_fields`. Fields belong to the type, not the stage.
```sql
id              uuid PK
record_type_id  uuid FK → record_types NOT NULL
label           text NOT NULL
field_type      text NOT NULL CHECK (field_type IN ('text','number','date','select','boolean'))
options         jsonb         -- for select type: ["Option A", "Option B"]
is_required     boolean NOT NULL DEFAULT false   -- globally required (all stages)
position        int NOT NULL DEFAULT 0
created_at      timestamptz NOT NULL DEFAULT now()
```

#### `record_type_permissions`
```sql
id              uuid PK
record_type_id  uuid FK → record_types NOT NULL
role            text NOT NULL CHECK (role IN ('admin','member'))
can_view        boolean NOT NULL DEFAULT true
can_create      boolean NOT NULL DEFAULT true
can_edit        boolean NOT NULL DEFAULT true
can_delete      boolean NOT NULL DEFAULT false
UNIQUE (record_type_id, role)
```

Default rows inserted on record type creation:
- admin: all true
- member: can_view=true, can_create=true, can_edit=true, can_delete=false

#### `stage_required_fields`
Which fields are required to move a record INTO this stage.
```sql
stage_id   uuid FK → pipeline_stages NOT NULL
field_id   uuid FK → record_type_fields NOT NULL
PRIMARY KEY (stage_id, field_id)
```

#### `pipeline_records`
Replaces `deals`.
```sql
id              uuid PK default gen_random_uuid()
workspace_id    uuid FK → workspaces NOT NULL
record_type_id  uuid FK → record_types NOT NULL
pipeline_id     uuid FK → pipelines NOT NULL
stage_id        uuid FK → pipeline_stages NOT NULL
record_number   text        -- auto-generated, e.g. "ATP-24-001" (null if auto_number disabled)
name            text NOT NULL
contact_id      uuid FK → contacts NULL
company_id      uuid FK → companies NULL
owner_id        uuid FK → users NOT NULL
deleted_at      timestamptz NULL
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
```

#### `record_field_values`
Replaces `deal_field_values`.
```sql
id         uuid PK
record_id  uuid FK → pipeline_records NOT NULL
field_id   uuid FK → record_type_fields NOT NULL
value      jsonb NOT NULL
UNIQUE (record_id, field_id)
```

#### `conversion_templates`
Defines a named conversion flow between two record types.
```sql
id                uuid PK
workspace_id      uuid FK → workspaces NOT NULL
name              text NOT NULL   -- e.g. "Enquiry → Quote"
source_type_id    uuid FK → record_types NOT NULL
target_type_id    uuid FK → record_types NOT NULL
target_pipeline_id uuid FK → pipelines NOT NULL
target_stage_id   uuid FK → pipeline_stages NOT NULL
position          int NOT NULL DEFAULT 0
created_at        timestamptz NOT NULL DEFAULT now()
```

#### `conversion_field_mappings`
Per-field mapping within a conversion template. Each row maps a source field/builtin to an optional target field/builtin. If both `target_field_id` and `target_builtin` are null, the source value is not carried over (row represents an explicit "don't copy" decision — useful for UI to show the mapping exists but is intentionally blank).
```sql
id               uuid PK
template_id      uuid FK → conversion_templates NOT NULL
source_field_id  uuid FK → record_type_fields NULL
source_builtin   text NULL  -- 'name' | 'contact_id' | 'company_id' | 'owner_id'
target_field_id  uuid FK → record_type_fields NULL
target_builtin   text NULL  -- 'name' | 'contact_id' | 'company_id' | 'owner_id'
-- source must have exactly one of source_field_id or source_builtin
CHECK (
  (source_field_id IS NOT NULL) != (source_builtin IS NOT NULL)
)
-- target may be null (means don't copy this field)
```

#### `record_conversions`
Audit trail of executed conversions.
```sql
id                uuid PK
source_record_id  uuid FK → pipeline_records NOT NULL
target_record_id  uuid FK → pipeline_records NOT NULL
template_id       uuid FK → conversion_templates NOT NULL
converted_by      uuid FK → users NOT NULL
converted_at      timestamptz NOT NULL DEFAULT now()
```

### Modified Tables

#### `pipelines` (existing)
Add column: `record_type_id uuid FK → record_types NOT NULL`

All existing pipeline rows backfilled to the workspace's auto-created "Deal" record type.

---

## Auto-Numbering

Format string tokens:
- `PREFIX` → `auto_number_prefix` value (e.g. "ATP")
- `YY` → 2-digit year (e.g. "24")
- `YYYY` → 4-digit year (e.g. "2024")
- `NNN` / `NNNN` / `NNNNN` → zero-padded sequence (3/4/5 digits)

Example: `PREFIX-YY-NNN` with prefix="ATP", sequence=1 → `ATP-24-001`

**Validation:** `auto_number_prefix` must be non-empty when `auto_number_enabled = true`. Enforced at API layer.

On record creation (if `auto_number_enabled`):
1. `UPDATE record_types SET auto_number_sequence = auto_number_sequence + 1 WHERE id = $1 RETURNING auto_number_sequence` (atomic increment)
2. Format sequence into `record_number` string

---

## Permissions Enforcement

`requireRecordTypePermission(action)` middleware:
1. Resolve `record_type_id` from request body or record lookup
2. Query `record_type_permissions` for the requesting user's role
3. Check the required action flag (`can_view`, `can_create`, `can_edit`, `can_delete`)
4. Return 403 if denied

Applied to all `/api/records` routes.

---

## API Routes

### Record Types

```
GET    /api/record-types                                  List workspace's record types
POST   /api/record-types                                  Create
PATCH  /api/record-types/:id                              Update (name, icon, color, auto-number)
DELETE /api/record-types/:id                              Delete (blocked if records exist — return 409)

GET    /api/record-types/:id/fields                       List fields
POST   /api/record-types/:id/fields                       Create field
PATCH  /api/record-types/:id/fields/:fieldId              Update field
DELETE /api/record-types/:id/fields/:fieldId              Delete field
PATCH  /api/record-types/:id/fields/reorder               Reorder (body: { ids: string[] })

GET    /api/record-types/:id/permissions                  Get permissions for all roles
PUT    /api/record-types/:id/permissions                  Bulk update (body: { admin: {...}, member: {...} })
```

### Pipelines (additions to existing)

```
POST   /api/pipelines                                     Create — now requires record_type_id
GET    /api/pipelines?record_type_id=                     Filter by type

PUT    /api/pipelines/:id/stages/:stageId/required-fields Set required fields (body: { field_ids: string[] })
```

### Records (replaces /api/deals)

```
GET    /api/records?record_type_id=&pipeline_id=&stage_id=&owner_id=&q=&page=&per_page=
POST   /api/records
GET    /api/records/:id
PATCH  /api/records/:id
DELETE /api/records/:id                                   Soft delete

GET    /api/records/export?record_type_id=&pipeline_id=   CSV export
POST   /api/records/import                                CSV import (body: multipart)
```

### Conversions

```
GET    /api/conversion-templates?source_type_id=          List templates
POST   /api/conversion-templates                          Create template + field mappings
PATCH  /api/conversion-templates/:id                      Update
DELETE /api/conversion-templates/:id

POST   /api/records/:id/convert                           Execute conversion { template_id }
                                                          Returns { data: { record_id } }
GET    /api/records/:id/conversions                       Audit trail for this record
```

### Deprecated

`/api/deals/*` routes return `410 Gone` with body `{ error: { code: 'DEPRECATED', message: 'Use /api/records' } }` after one release cycle.

---

## UI

### Settings: `/settings/record-types`

- List of record types: icon, name, color, record count, edit/delete buttons
- Create/edit type sheet:
  - Name input, icon picker (emoji), color picker
  - **Auto-number section** — toggle enabled/disabled; when enabled: prefix input, format string input with token legend, live preview (e.g. `ATP-24-001`)
  - **Fields section** — drag-reorder list; add field button (type, label, globally required, select options)
  - **Permissions matrix** — table: rows = admin / member, columns = view / create / edit / delete, boolean toggles
  - **Conversions section** — list of templates where this type is the source; "Add conversion" button

- Conversion template editor (inline or separate page):
  - Target type selector → target pipeline selector → target stage selector
  - Field mapping table: source field | → | target field (dropdowns, nullable = "don't copy")

### Main Records View: `/pipeline/[typeSlug]`

- Left sidebar: each record type listed with its icon and name
- Clicking a type sets it as active
- Top bar: pipeline switcher (if type has >1 pipeline) + view switcher (Kanban | Table | List | Calendar — Table/List/Calendar are sub-project 2)
- **Kanban**: existing drag-and-drop implementation adapted for `pipeline_records`. Cards show `record_number` (if enabled) + `name` + `owner` + configured card fields.
- Required field enforcement on stage drag: if target stage has `stage_required_fields`, open fill-in modal before confirming move

### Record Detail

- Drawer or full page: all field values, edit inline
- "Convert to X" button(s) — one per available conversion template
- Conversion modal:
  - Shows target type, pipeline, stage
  - Field mapping preview table: source value → target field
  - "Convert" button → POST `/api/records/:id/convert` → on success, show link to new record
  - Original record NOT deleted; gets "Converted to [Type] #[number]" note in audit
- Conversions section: list of records this record was converted from/to

---

## Migration

Zero data loss. Migration runs in two parts: schema additions, then backfill.

### Part 1: Schema migrations (additive, no downtime)

1. Create all new tables listed above
2. Add `record_type_id` column to `pipelines` (nullable initially)

### Part 2: Backfill script (runs once post-deploy)

```
For each workspace:
  1. INSERT INTO record_types (workspace_id, name, icon, color, auto_number_enabled)
     VALUES (workspace_id, 'Deal', '💰', '#2d6a4f', false)
     → capture deal_type_id

  2. INSERT INTO record_type_permissions (record_type_id, role, ...)
     default rows for admin + member

  3. UPDATE pipelines SET record_type_id = deal_type_id
     WHERE workspace_id = workspace_id

  4. INSERT INTO record_type_fields
     SELECT DISTINCT ON (label) ... FROM stage_fields
     WHERE stage_id IN (stages of this workspace's pipelines)
     → capture field_id mapping

  5. INSERT INTO stage_required_fields (stage_id, field_id)
     FROM stage_fields WHERE is_required = true
     using field_id mapping from step 4

  6. INSERT INTO pipeline_records
     SELECT id, workspace_id, deal_type_id, pipeline_id, stage_id,
            null as record_number, name, contact_id, company_id,
            owner_id, deleted_at, created_at, updated_at
     FROM deals

  7. INSERT INTO record_field_values
     SELECT id, deal_id as record_id, field_id, value
     FROM deal_field_values
     using field_id mapping from step 4
```

### Part 3: NOT NULL enforcement

After backfill verified: `ALTER TABLE pipelines ALTER COLUMN record_type_id SET NOT NULL`

### Old tables

`deals` and `deal_field_values` kept for one release cycle (read-only). `/api/deals` routes return 410. Tables dropped in subsequent migration.

---

## Error Handling

- **Delete record type with existing records** → 409 Conflict, message: "Cannot delete record type with existing records"
- **Conversion with missing required target fields** → 422, list missing fields
- **Stage move with unmet required fields** → 422, list required fields
- **Permission denied** → 403
- **Record not found / wrong workspace** → 404

---

## Files Touched

| File | Change |
|------|--------|
| `packages/db/migrations/YYYYMMDD_pipeline_engine.ts` | All new tables + pipelines alteration |
| `packages/db/src/schema.ts` | All new table interfaces |
| `apps/api/src/routes/record-types.ts` | **Create** — CRUD + fields + permissions |
| `apps/api/src/routes/records.ts` | **Create** — replaces deals.ts |
| `apps/api/src/routes/conversions.ts` | **Create** — templates + execute |
| `apps/api/src/routes/pipelines.ts` | Add record_type_id; add required-fields endpoint |
| `apps/api/src/routes/deals.ts` | Return 410 Gone |
| `apps/api/src/index.ts` | Register new routers |
| `apps/api/src/scripts/backfill-pipeline-engine.ts` | **Create** — one-time migration script |
| `apps/web/src/app/(app)/settings/record-types/page.tsx` | **Create** — settings UI |
| `apps/web/src/app/(app)/pipeline/[typeSlug]/page.tsx` | **Create** — replaces pipeline page |
| `apps/web/src/components/pipeline/RecordKanban.tsx` | Adapt existing kanban for pipeline_records |
| `apps/web/src/components/pipeline/ConversionModal.tsx` | **Create** |
| `apps/web/src/components/pipeline/RecordDetail.tsx` | **Create** |
