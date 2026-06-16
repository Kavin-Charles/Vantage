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
- Items: `{ label, onClick, disabled?, danger?, divider?, hidden? }`
- `hidden: true` removes item from list entirely (used for permission gating — not just visually disabled)
- Optional submenu (one level deep) for "Move to Stage →"
- Consumer passes `role: 'admin' | 'member'` from `useAuth()` and builds items array with `hidden` derived from role

Usage: wrap target element, pass `items` array, attach `onContextMenu` handler.

---

## 6. Context Menu Placements

Permission legend: **[A]** = admin only · **[M]** = any role · items marked [A] use `hidden: role !== 'admin'`

### Pipeline list — right-click pipeline card

```
Configure →          [M]
Rename               [A]
Set as Default       [A]
─────────────
Delete               [A]
```

- **Configure →**: navigate to `/settings/pipelines/:id`
- **Rename**: opens quick inline input on the card; saves `PATCH /pipelines/:id { name }`
- **Set as Default**: `PATCH /pipelines/:id { is_default: true }`
- **Delete**: confirm dialog, `DELETE /pipelines/:id`

### Config page — right-click stage row

```
Rename Stage         [A]
Change Color         [A]
Move Up              [A]
Move Down            [A]
─────────────
Delete Stage         [A]  (hidden for won/lost stages)
```

- Move Up/Down: `disabled` at list bounds; hidden entirely for won/lost rows (they don't reorder)
- Delete Stage: hidden for won/lost stages; `disabled` not used — item simply absent

### Config page — right-click field row

```
Rename Field         [A]
Edit Options         [A]  (hidden unless field type is select or multiselect)
Toggle Required      [A]
Move Up              [A]
Move Down            [A]
─────────────
Delete Field         [A]
```

### Pipeline kanban page — right-click deal card

```
Open Deal            [M]
Move to Stage  ▶     [M]   [submenu: stage list]
Assign to Me         [M]
─────────────
Mark as Won          [M]
Mark as Lost         [M]
─────────────
Delete Deal          [A]
```

- **Open Deal**: navigate to deal detail page
- **Move to Stage**: inline submenu listing all active pipeline stages (won/lost excluded); selecting one `PATCH /deals/:id { stage_id }`
- **Assign to Me**: `PATCH /deals/:id { owner_id: currentUser.id }`; hidden if current user is already owner
- **Mark as Won**: `PATCH /deals/:id { stage_id: <won stage id> }`; hidden if deal already in won stage
- **Mark as Lost**: `PATCH /deals/:id { stage_id: <lost stage id> }`; hidden if deal already in lost stage
- **Delete Deal**: admin only; confirm dialog, then `DELETE /deals/:id`

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
