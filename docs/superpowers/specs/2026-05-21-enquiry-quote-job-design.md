# Enquiry → Quote → Job Conversion Workflow Design

## Overview

Add a record conversion workflow to Vantage's pipeline engine: admins configure
conversion templates (which source record type converts to which target type, and
how fields map), then any user can trigger a conversion from the record detail
drawer. The backend (`conversion_templates`, `conversion_field_mappings`,
`record_conversions` tables + execute API) already exists. This spec covers the
missing UI layer.

---

## Architecture

Three new surfaces wired to the existing conversions backend:

### 1. RecordDrawer

Slide-over panel triggered by clicking any record in table or list view.
Fetches the single record (`GET /api/pipeline-records/:id`) and applicable
conversion templates (`GET /api/conversion-templates?source_type_id=X`). Renders
built-in fields (name, contact, company, owner, stage), custom field values, past
conversions, and "Convert to X" buttons (one per applicable template).

### 2. Settings → Conversions Tab

Admin-only page. Lists conversion templates grouped by source record type.
Create/edit flow: pick source type → target type → target pipeline → target
stage → field mapping UI. Calls existing template CRUD endpoints
(`GET/POST/PATCH/DELETE /api/conversion-templates`).

### 3. ConvertModal

Opens on top of the drawer when user clicks "Convert to X". Loads the selected
template and source record data. Pre-populates the target record form via field
mappings. User can edit any field freely. On confirm: `POST
/api/pipeline-records/:id/convert` → target record created → drawer refreshes to
show a "Converted to [name]" link.

**Data flow:**

```
record click (table row / list card) → RecordDrawer opens
  → fetch /api/pipeline-records/:id
  → fetch /api/conversion-templates?source_type_id=X
  → user clicks "Convert to Quote"
    → ConvertModal opens (pre-filled)
      → user edits, confirms
        → POST /api/records/:id/convert
          → target record created
          → record_conversions row written
          → drawer refreshes, shows link
```

---

## Components & File Map

### New files

| File | Responsibility |
|---|---|
| `apps/web/components/RecordDrawer.tsx` | Slide-over panel. Receives `recordId` + `onClose`. Fetches record, templates, past conversions. |
| `apps/web/components/ConvertModal.tsx` | Prefill form modal. Receives `record + template`. Submits convert API call. |
| `apps/web/app/(dashboard)/settings/conversions/page.tsx` | Admin template list + create/edit flow. |
| `apps/web/components/TemplateFieldMapper.tsx` | Field mapping UI: source fields (left) linked to target fields (right). Click to link/unlink. |
| `apps/web/lib/conversions.ts` | API client: `listTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `convertRecord`. |

### Modified files

| File | Change |
|---|---|
| `apps/web/app/(dashboard)/pipeline/[typeSlug]/page.tsx` | `drawerRecordId` state; render `<RecordDrawer>` |
| `apps/web/components/RecordTable.tsx` | Row click → open drawer |
| `apps/web/components/RecordList.tsx` | Card click → open drawer |
| `apps/web/app/(dashboard)/settings/pipelines/page.tsx` | Add "Conversions" link in settings nav |

### Backend — verify / add

| Endpoint | Status |
|---|---|
| `GET /api/pipeline-records/:id` | Verify exists in items routes; add if missing |
| `GET /api/conversion-templates?source_type_id=X` | Verify filter param is supported |
| `POST /api/records/:id/convert` | Exists — no changes needed |
| Template CRUD | Exists — no changes needed |

---

## RecordDrawer Detail

**Sections:**

1. **Header** — record name (editable inline), stage badge, close button
2. **Built-in fields** — contact, company, owner, close date (read-only display, edit TBD in a later spec)
3. **Custom fields** — all `record_field_values` for this record, rendered by field type
4. **Conversions** — "Convert to X" button per applicable template. Below buttons: list of past conversions as links (from `record_conversions` joined to target record name)
5. **Empty convert state** — if no templates: "No conversions configured" + link to Settings → Conversions (admin only; non-admins see nothing)

**Permissions:** All workspace members can open drawer + click Convert. Only admins see the settings link in the empty state.

---

## ConvertModal Detail

**On open:**
1. Fetch target pipeline stages (`GET /api/pipelines/:pipeline_id` → `PipelineWithStages`)
2. Apply field mappings from template to pre-fill form values
3. Show any unmapped required fields highlighted (empty, must fill)

**Form fields:**
- Target record name (pre-filled from source name or mapping)
- Built-in target fields (contact, company, owner) — pre-filled if mapped
- Custom target stage fields — pre-filled where mapped; empty otherwise
- Required unmapped fields shown with red border

**On confirm:**
- `POST /api/records/:id/convert` with `{ template_id, field_values }`
- Success → close modal, drawer refreshes, shows "Converted to [name]" link
- Failure → inline error, modal stays open

**Multiple conversions:** Converting the same record twice is allowed (e.g. one
Enquiry → two Quotes). Each produces a separate `record_conversions` row.

---

## Settings → Conversions Page

**Layout:** Tab within the existing settings area (alongside Pipelines tab).

**Template list:** Grouped by source record type. Each row: source type → target
type, target pipeline, target stage, edit/delete actions.

**Create/edit flow (multi-step):**

1. **Source & target** — pick source record type, target record type
2. **Target destination** — pick target pipeline (filtered to target type's pipelines), pick target stage
3. **Field mapping** — two columns: source fields (built-ins + custom) on left, target fields on right. Click a source field then a target field to link them. Linked pairs shown with a connecting line/badge. Unlink by clicking the badge.

**Save** → `POST /api/conversion-templates` with nested field mappings array.

**Admin-only guard:** Settings page already has role checks; apply same pattern.

---

## Error Handling & Edge Cases

| Scenario | Behaviour |
|---|---|
| No templates for record type | Drawer shows empty state + settings link (admin only) |
| Unmapped required target fields | ConvertModal highlights fields red; submit blocked until filled |
| Record already converted | Past conversions listed as links; Convert button still active |
| Convert API failure | Inline error in modal; modal stays open |
| Template deleted after conversion | Historical `record_conversions` rows kept; template no longer appears as Convert option |
| Member (non-admin) in drawer | Convert buttons visible; settings link hidden |

---

## Testing

### Backend (verify existing routes)

- `GET /api/pipeline-records/:id` returns record + field values
- `GET /api/conversion-templates?source_type_id=X` filters correctly
- `POST /api/records/:id/convert` creates target record + `record_conversions` row
- Convert with full mapping → all target fields populated
- Convert with partial mapping → unmapped fields null, no error
- Convert same record twice → two target records, two conversion rows

### Frontend (manual / integration)

- Click record in kanban → drawer opens with correct data
- No templates → empty state shown; settings link visible to admin only
- Template exists → Convert button shown
- Click Convert → modal pre-filled correctly
- Submit → record created, drawer shows link to new record
- Admin creates template in Settings → field mapper links fields → saved → appears in drawer

---

## Out of Scope (this spec)

- Inline field editing in drawer (read-only for now)
- Activity feed in drawer (separate spec)
- Pre-seeded Enquiry/Quote/Job record types (user configures manually)
- Conversion analytics / reporting
