# Pipeline Overhaul — Design Spec
**Date:** 2026-06-15

## Overview

Full scratch rebuild of the pipeline module. Replace the existing generic record/conversion system with a cleaner generalized pipeline where entities are called **Items**. Fully dynamic fields (no fixed schema per item — everything is a custom field). Admin-configured stages per pipeline. Three views: Kanban, Table, Detail panel. Background jobs for automations, reminders, and activity logging.

---

## What Gets Deleted

### Web (`apps/web`)
**Components to remove:**
- `modules/pipeline/components/ConversionModal.tsx`
- `modules/pipeline/components/ConversionWizard.tsx`
- `modules/pipeline/components/FieldMappingEditor.tsx`
- `modules/pipeline/components/PipelineEditor.tsx`
- `modules/pipeline/components/RecordCard.tsx`
- `modules/pipeline/components/RecordDetail.tsx`
- `modules/pipeline/components/RecordDetailPanel.tsx`
- `modules/pipeline/components/RecordForm.tsx`
- `modules/pipeline/components/RecordKanban.tsx`
- `modules/pipeline/components/RecordList.tsx`
- `modules/pipeline/components/RecordTable.tsx`
- `modules/pipeline/components/RecordTypeEditor.tsx`
- `modules/pipeline/components/TemplateFieldMapper.tsx`

**Pages/lib to remove:**
- `modules/pipeline/pages/GroupTabs.tsx`
- `modules/pipeline/pages/ItemModal.tsx`
- `modules/pipeline/pages/PipelineSwitcher.tsx`
- `modules/pipeline/lib/record-types.ts`
- `modules/pipeline/lib/records.ts`
- `modules/pipeline/lib/conversions.ts`
- `modules/pipeline/lib/item-groups.ts`

**Settings to remove (delete entirely):**
- `app/(dashboard)/settings/conversions/` — entire directory
- `app/(dashboard)/settings/record-types/` — entire directory
- `app/(dashboard)/settings/pipelines/record-types/` — sub-route inside pipelines settings

**Settings to rewrite (keep path, replace content):**
- `app/(dashboard)/settings/pipelines/page.tsx` — list pipelines, create/delete
- `app/(dashboard)/settings/pipelines/layout.tsx` — keep, adjust nav if needed

**New settings route:**
- `app/(dashboard)/settings/pipelines/[id]/page.tsx` — per-pipeline: manage stages, fields, automations

### API (`apps/api`)
Remove or gut routes that power the old record-type/conversion system. Keep `pipelines.ts` and `pipeline_stages` logic as a base, but rewrite to match the new schema.

### DB
New migrations — do not modify existing ones. Old `records`, `record_types`, `record_type_fields`, `item_groups` tables are superseded by the new schema below.

---

## Database Schema

### `pipelines`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id  uuid NOT NULL REFERENCES workspaces(id)
name          text NOT NULL
is_default    boolean NOT NULL DEFAULT false
position      integer NOT NULL DEFAULT 0
created_at    timestamptz NOT NULL DEFAULT now()
updated_at    timestamptz NOT NULL DEFAULT now()
```

### `pipeline_stages`
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
pipeline_id  uuid NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE
name         text NOT NULL
color        text NOT NULL DEFAULT '#6366f1'
is_won       boolean NOT NULL DEFAULT false
is_lost      boolean NOT NULL DEFAULT false
position     integer NOT NULL DEFAULT 0
created_at   timestamptz NOT NULL DEFAULT now()
```

### `pipeline_fields`
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
pipeline_id  uuid NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE
label        text NOT NULL
key          text NOT NULL        -- snake_case; used as JSONB key in field_values
type         text NOT NULL        -- text|number|date|select|multiselect|user|checkbox|url
options      jsonb                -- [{label, value}] for select/multiselect
position     integer NOT NULL DEFAULT 0
required     boolean NOT NULL DEFAULT false
created_at   timestamptz NOT NULL DEFAULT now()
UNIQUE (pipeline_id, key)
```

### `pipeline_items`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
pipeline_id   uuid NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE
stage_id      uuid NOT NULL REFERENCES pipeline_stages(id)
workspace_id  uuid NOT NULL REFERENCES workspaces(id)
position      integer NOT NULL DEFAULT 0   -- ordering within stage (kanban)
field_values  jsonb NOT NULL DEFAULT '{}'  -- { field_key: value }
deleted_at    timestamptz                  -- soft delete
created_at    timestamptz NOT NULL DEFAULT now()
updated_at    timestamptz NOT NULL DEFAULT now()
```
**Index:** `CREATE INDEX ON pipeline_items USING GIN (field_values);`

### `pipeline_automations`
```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
pipeline_id         uuid NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE
name                text NOT NULL
trigger_type        text NOT NULL   -- stage_changed|field_changed|item_created|date_approaching
trigger_conditions  jsonb NOT NULL  -- { stage_id?, field_key?, days_before? }
action_type         text NOT NULL   -- notify_assignee|assign_user|move_stage
action_params       jsonb NOT NULL  -- { user_field_key?, stage_id?, message? }
enabled             boolean NOT NULL DEFAULT true
last_fired_at       timestamptz
created_at          timestamptz NOT NULL DEFAULT now()
```

### `pipeline_activity`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
item_id       uuid NOT NULL REFERENCES pipeline_items(id) ON DELETE CASCADE
pipeline_id   uuid NOT NULL
workspace_id  uuid NOT NULL
user_id       uuid REFERENCES users(id)
event_type    text NOT NULL   -- stage_changed|field_changed|item_created
payload       jsonb NOT NULL  -- { from_stage_id?, to_stage_id?, field_key?, old_value?, new_value? }
created_at    timestamptz NOT NULL DEFAULT now()
```

---

## API Routes

All routes workspace-scoped via `requireWorkspace` middleware. Stage, field, and automation mutations require `pipelines:edit` permission.

### Pipelines
```
GET    /api/pipelines                        list with stages + fields
POST   /api/pipelines                        create
GET    /api/pipelines/:id                    get one
PATCH  /api/pipelines/:id                    update (name, is_default, position)
DELETE /api/pipelines/:id                    delete
```

### Stages (admin)
```
POST   /api/pipelines/:id/stages             create
PATCH  /api/pipelines/:id/stages/:stageId    update (name, color, is_won, is_lost)
DELETE /api/pipelines/:id/stages/:stageId    delete
POST   /api/pipelines/:id/stages/reorder     { ids: uuid[] }
```

### Fields (admin)
```
POST   /api/pipelines/:id/fields             create
PATCH  /api/pipelines/:id/fields/:fieldId    update (label, options, required, position)
DELETE /api/pipelines/:id/fields/:fieldId    delete
POST   /api/pipelines/:id/fields/reorder     { ids: uuid[] }
```

### Items
```
GET    /api/pipelines/:id/items              list (filter: stage_id, search field_values)
POST   /api/pipelines/:id/items             create { stage_id, field_values }
GET    /api/items/:id                        get one + activity
PATCH  /api/items/:id                        update { stage_id?, field_values? }
DELETE /api/items/:id                        soft delete (sets deleted_at)
PATCH  /api/items/:id/move                   { stage_id, position }
```

### Automations (admin)
```
GET    /api/pipelines/:id/automations        list
POST   /api/pipelines/:id/automations        create
PATCH  /api/pipelines/:id/automations/:aId   update / toggle enabled
DELETE /api/pipelines/:id/automations/:aId   delete
```

### Activity
```
GET    /api/items/:id/activity               paginated log
```

---

## Frontend Structure

```
apps/web/
  app/(dashboard)/
    pipeline/
      page.tsx                    -- redirect to default pipeline
      [pipelineId]/
        page.tsx                  -- toolbar + view router
    settings/
      pipelines/
        page.tsx                  -- list pipelines, create/delete
        [id]/
          page.tsx                -- manage stages + fields + automations

  modules/pipeline/
    components/
      kanban/
        KanbanBoard.tsx           -- stage columns, drag-drop
        KanbanColumn.tsx          -- single stage column
        KanbanCard.tsx            -- item card (renders key fields)
      table/
        PipelineTable.tsx         -- spreadsheet view
        TableCell.tsx             -- per-field-type cell renderer
      detail/
        ItemDetail.tsx            -- slide-over panel
        ItemDetailField.tsx       -- read/edit per field type
        ItemActivity.tsx          -- activity feed tab
      fields/
        FieldRenderer.tsx         -- dispatch render by field.type
        FieldEditor.tsx           -- dispatch edit input by field.type
      shared/
        PipelineSwitcher.tsx      -- dropdown to switch pipelines
        ViewSwitcher.tsx          -- kanban / table toggle
        ItemForm.tsx              -- create item modal
    lib/
      pipelines.ts                -- API client functions
      items.ts                    -- API client functions
      field-types.ts              -- type metadata, validators, renderer map
    pages/
      page.tsx
      [pipelineId]/
        page.tsx
```

**Field types supported:** `text`, `number`, `date`, `select`, `multiselect`, `user`, `checkbox`, `url`

**Drag-drop:** HTML5 native drag-and-drop (no external lib) for kanban card movement. On drop: call `PATCH /api/items/:id/move`.

---

## Background Jobs (`apps/worker`)

### Activity Logger
Runs **inline in the API** (not a worker job). Every item create/update writes to `pipeline_activity` in the same DB transaction:
- `item_created` on POST
- `stage_changed` on stage_id change: `{ from_stage_id, to_stage_id }`
- `field_changed` on field_values change: `{ field_key, old_value, new_value }` — one row per changed field

### Automation Engine
Event-driven, runs in `apps/worker`:
1. API pushes event to Redis queue after item mutations: `{ event_type, item_id, pipeline_id, payload }`
2. Worker consumes queue → loads matching enabled `pipeline_automations` for that pipeline
3. Evaluates `trigger_conditions` against event payload
4. Executes action:
   - `notify_assignee` → push notification to user in `field_values[user_field_key]`
   - `assign_user` → patch `field_values[field_key]` to specified user_id
   - `move_stage` → patch `stage_id`
5. Failed actions retry 3×, then mark automation disabled + log error

### Reminder Job
Cron in `apps/worker`, runs **hourly**:
1. Find all `pipeline_automations` where `trigger_type = 'date_approaching'` and `enabled = true`
2. For each, query `pipeline_items` where the target date field is within `days_before` days
3. Skip if `last_fired_at` is within the last 23 hours (dedup)
4. Fire `notify_assignee` action + write `pipeline_activity` record
5. Update `last_fired_at`

---

## Error Handling

- Required field validation: Zod on all API inputs
- Stage move blocked if destination stage requires fields not yet filled: 422 with list of missing fields
- Soft delete only — `deleted_at` set, never hard delete items
- Automation execution failures logged to structured logger, automation disabled after 3 failures

---

## What Is NOT in Scope

- Analytics / reporting on pipeline data (deferred)
- Webhook delivery for automation actions (deferred)
- CSV import/export (deferred)
- Mobile views (deferred)
