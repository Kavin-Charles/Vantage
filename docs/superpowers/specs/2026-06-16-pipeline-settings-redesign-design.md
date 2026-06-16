# Pipeline Settings Redesign

**Date:** 2026-06-16  
**Scope:** Pipeline settings pages + pipeline kanban page

---

## Summary

Three changes:
1. Remove left-sidebar layout from pipeline settings (`layout.tsx` deleted)
2. Expand pipeline config page into 3-tab rich editor (General / Stages / Fields) with won/lost stage editing
3. Add right-click context menus to pipeline list, config rows, and kanban deal cards

---

## 1. Layout & Navigation

Delete `apps/web/app/(dashboard)/settings/pipelines/layout.tsx` entirely. The two settings pages (`/settings/pipelines` and `/settings/pipelines/[id]`) render full-width inside the parent settings shell with no sub-nav.

---

## 2. DB Migration

Add `description` column to `pipelines` table:

```sql
ALTER TABLE pipelines ADD COLUMN description text;
```

Backend `updatePipelineSchema` in `pipelines.ts` gains `description: z.string().optional()`.  
Frontend `Pipeline` interface in `modules/pipeline/lib/pipelines.ts` gains `description: string | null`.  
Frontend gains `updatePipeline` client fn: `PATCH /pipelines/:id`.

---

## 3. Pipeline List Page (`/settings/pipelines/page.tsx`)

No structural changes. Context menu added to pipeline cards (see §6).

---

## 4. Pipeline Config Page (`/settings/pipelines/[id]/page.tsx`)

Tab bar becomes: **General | Stages | Fields** (was Stages | Fields).

### 4a. General Tab

| Control | Behavior |
|---|---|
| Pipeline name | Editable input, saves on blur or Enter via `PATCH /pipelines/:id` |
| Description | Textarea, optional, saves on blur |
| Default pipeline | Toggle switch, saves `is_default: true` immediately |
| Danger zone | "Delete pipeline" button (red outlined section at bottom) — confirms then calls `DELETE /pipelines/:id`, redirects to list |

All saves show inline "Saved" flash on success, inline error text on failure. No explicit save button.

### 4b. Stages Tab

Each existing stage row is fully interactive:

| Control | Behavior |
|---|---|
| Inline rename | Click name → input field, blur/Enter saves `PATCH /stages/:stageId { name }` |
| Color picker | Click color dot → inline 8-swatch popover, selection saves `PATCH /stages/:stageId { color }` |
| ↑↓ reorder | Arrow buttons on each row, calls `POST /stages/reorder` with full new id array |
| Won/Lost stages | Rename + recolor allowed. Delete button hidden. ↑↓ arrows hidden. Always rendered last (after all active stages). When calling `reorderStages`, active stage ids sent first, won/lost appended at end. Subtle colored left border (green for won, red for lost) |
| Delete | Non-terminal stages only. Confirm dialog, then `DELETE /stages/:stageId` |

Add stage form below list: unchanged.

### 4c. Fields Tab

Each existing field row is fully interactive:

| Control | Behavior |
|---|---|
| Inline rename | Click label → input, blur/Enter saves `PATCH /fields/:fieldId { label }` |
| Edit options | Chevron on select/multiselect rows expands inline chip editor (add/remove options), saves `PATCH /fields/:fieldId { options }` |
| Toggle required | Checkbox on row, saves `PATCH /fields/:fieldId { required }` immediately |
| ↑↓ reorder | Arrow buttons, calls `POST /fields/reorder` |
| Delete | Confirm dialog, then `DELETE /fields/:fieldId` |

Add field form below list: unchanged.

---

## 5. Context Menu Component

Single shared `<ContextMenu>` component in `src/components/ui/ContextMenu.tsx`.

- Portalled to `document.body` via `createPortal`
- Positioned at cursor coordinates, clamped to viewport
- Closes on: click outside, Escape key, scroll
- Items: `{ label, onClick, disabled?, danger?, divider? }`
- Optional submenu (one level deep) for "Move to Stage →"

Usage: wrap target element, pass `items` array, attach `onContextMenu` handler.

---

## 6. Context Menu Placements

### Pipeline list — right-click pipeline card

```
Configure →
Rename
Set as Default
─────────────
Delete
```

- **Rename**: focuses the pipeline name in the card inline (or opens a quick inline input on the card)
- **Set as Default**: `PATCH /pipelines/:id { is_default: true }`
- **Delete**: same confirm + delete as existing button

### Config page — right-click stage row

```
Rename Stage
Change Color
Move Up
Move Down
─────────────
Delete Stage
```

- Rename / Change Color: same as clicking inline controls
- Move Up/Down: disabled at list bounds, disabled for won/lost (already at bottom)
- Delete Stage: disabled for won/lost stages

### Config page — right-click field row

```
Rename Field
Edit Options        (only for select / multiselect)
Toggle Required
Move Up
Move Down
─────────────
Delete Field
```

### Pipeline kanban page — right-click deal card

```
Open Deal
Move to Stage  ▶   [submenu: stage list]
Assign to Me
─────────────
Mark as Won
Mark as Lost
─────────────
Delete Deal
```

- **Open Deal**: navigate to deal detail
- **Move to Stage**: inline submenu listing all pipeline stages; selecting one PATCHes deal stage
- **Assign to Me**: `PATCH /deals/:id { owner_id: currentUser.id }`
- **Mark as Won / Mark as Lost**: `PATCH /deals/:id { stage_id: <won|lost stage id> }`
- **Delete Deal**: confirm dialog, then `DELETE /deals/:id`

---

## 7. Files Touched

| File | Change |
|---|---|
| `apps/web/app/(dashboard)/settings/pipelines/layout.tsx` | **Delete** |
| `apps/web/app/(dashboard)/settings/pipelines/[id]/page.tsx` | **Rewrite** — 3 tabs, inline editing, context menus |
| `apps/web/app/(dashboard)/settings/pipelines/page.tsx` | **Edit** — add context menu to pipeline cards |
| `apps/web/app/(dashboard)/pipeline/[pipelineId]/page.tsx` | **Edit** — add context menu to deal cards |
| `apps/web/modules/pipeline/lib/pipelines.ts` | **Edit** — add `updatePipeline`, add `description` to `Pipeline` type |
| `apps/web/src/components/ui/ContextMenu.tsx` | **Create** — shared context menu component |
| `apps/api/src/routes/pipelines.ts` | **Edit** — add `description` to `updatePipelineSchema` |
| DB migration | **Create** — `ALTER TABLE pipelines ADD COLUMN description text` |

---

## 8. Out of Scope

- Drag-to-reorder (use ↑↓ buttons — no dnd-kit dependency needed)
- Stage-change automation triggers
- Multi-level submenus beyond "Move to Stage"
- Pipeline duplication (context menu item links to configure, not duplicate)
