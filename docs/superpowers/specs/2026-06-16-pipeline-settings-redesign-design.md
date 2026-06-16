# Pipeline Settings Redesign

**Date:** 2026-06-16  
**Scope:** Pipeline settings pages + pipeline kanban page

---

## Summary

Four changes:
1. Remove left-sidebar layout from pipeline settings (`layout.tsx` deleted)
2. Expand pipeline config page into 3-tab rich editor (General / Stages / Fields) with won/lost stage editing
3. Add right-click context menus to pipeline list, config rows, and kanban deal cards
4. Add fine-grained pipeline permissions; expose resolved permissions to frontend via `/api/me`

---

## 1. Layout & Navigation

Delete `apps/web/app/(dashboard)/settings/pipelines/layout.tsx` entirely. The two settings pages (`/settings/pipelines` and `/settings/pipelines/[id]`) render full-width inside the parent settings shell with no sub-nav.

---

## 2. Fine-Grained Pipeline Permissions

### New permissions in `packages/modules/src/pipelines/index.ts`

| Key | Label | Default roles |
|---|---|---|
| `pipelines:stage.edit` | Edit stages (rename, reorder, recolor) | admin, member |
| `pipelines:stage.delete` | Delete stages | admin |
| `pipelines:field.edit` | Edit fields (rename, reorder, toggle required, edit options) | admin, member |
| `pipelines:field.delete` | Delete fields | admin |
| `pipelines:config` | Change pipeline settings (name, description, default) | admin |

Existing permissions (`pipelines:view/create/edit/delete`) remain unchanged.

### Frontend: expose resolved permissions

`GET /api/me` response gains `permissions: string[]` — the resolved set for the user (all strings for admin, filtered set for member).

`AuthUser` type gains `permissions: string[]`.

`useAuth()` gains `hasPermission(key: string): boolean` helper — returns `true` if `user.permissions.includes(key)`.

Context menus use `hasPermission('pipelines:stage.edit')` etc. to build the `hidden` flag per item.

---

## 3. DB Migration

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
- `hidden: true` removes item from list entirely (never just disabled for permission reasons)
- Optional submenu (one level deep) for "Move to Stage →"
- Consumer calls `hasPermission(key)` from `useAuth()` to build `hidden` per item

Usage: wrap target element, pass `items` array, attach `onContextMenu` handler.

---

## 6. Context Menu Placements

Permission legend: permission key shown in brackets. `hidden: !hasPermission(key)` unless otherwise noted.

### Pipeline list — right-click pipeline card

```
Configure →                   [pipelines:view]
Rename                        [pipelines:config]
Set as Default                [pipelines:config]
─────────────
Delete                        [pipelines:delete]
```

- **Configure →**: navigate to `/settings/pipelines/:id`
- **Rename**: opens inline input on the card; saves `PATCH /pipelines/:id { name }`
- **Set as Default**: `PATCH /pipelines/:id { is_default: true }`
- **Delete**: confirm dialog, `DELETE /pipelines/:id`

### Config page — right-click stage row

```
Rename Stage                  [pipelines:stage.edit]
Change Color                  [pipelines:stage.edit]
Move Up                       [pipelines:stage.edit]  + hidden for won/lost
Move Down                     [pipelines:stage.edit]  + hidden for won/lost
─────────────
Delete Stage                  [pipelines:stage.delete] + hidden for won/lost
```

- Move Up/Down: additionally `disabled` at list bounds
- Won/lost rows: reorder + delete items always hidden regardless of permission

### Config page — right-click field row

```
Rename Field                  [pipelines:field.edit]
Edit Options                  [pipelines:field.edit]  + hidden unless select/multiselect
Toggle Required               [pipelines:field.edit]
Move Up                       [pipelines:field.edit]
Move Down                     [pipelines:field.edit]
─────────────
Delete Field                  [pipelines:field.delete]
```

- Move Up/Down: additionally `disabled` at list bounds

### Pipeline kanban page — right-click deal card

```
Open Deal                     [pipelines:view]
Move to Stage  ▶              [pipelines:edit]   submenu: active stages only
Assign to Me                  [pipelines:edit]   + hidden if already owner
─────────────
Mark as Won                   [pipelines:edit]   + hidden if already in won stage
Mark as Lost                  [pipelines:edit]   + hidden if already in lost stage
─────────────
Delete Deal                   [pipelines:delete]
```

- **Move to Stage**: submenu lists all active stages (not won/lost); selecting one `PATCH /deals/:id { stage_id }`
- **Assign to Me**: `PATCH /deals/:id { owner_id: currentUser.id }`
- **Mark as Won/Lost**: `PATCH /deals/:id { stage_id: <won|lost stage id> }`
- **Delete Deal**: confirm dialog, `DELETE /deals/:id`

---

## 7. Files Touched

| File | Change |
|---|---|
| `apps/web/app/(dashboard)/settings/pipelines/layout.tsx` | **Delete** |
| `apps/web/app/(dashboard)/settings/pipelines/[id]/page.tsx` | **Rewrite** — 3 tabs, inline editing, context menus |
| `apps/web/app/(dashboard)/settings/pipelines/page.tsx` | **Edit** — add context menu to pipeline cards |
| `apps/web/app/(dashboard)/pipeline/[pipelineId]/page.tsx` | **Edit** — add context menu to deal cards |
| `apps/web/modules/pipeline/lib/pipelines.ts` | **Edit** — add `updatePipeline`, `description` to `Pipeline` type |
| `apps/web/modules/shared/lib/AuthContext.tsx` | **Edit** — add `hasPermission()` to context value; store `permissions[]` on `AuthUser` |
| `apps/web/store/auth-slice.ts` | **Edit** — add `permissions: string[]` to `AuthUser` |
| `apps/web/src/components/ui/ContextMenu.tsx` | **Create** — shared context menu component |
| `apps/api/src/routes/pipelines.ts` | **Edit** — add `description` to `updatePipelineSchema` |
| `apps/api/src/routes/me.ts` | **Edit** — include resolved `permissions[]` in `/api/me` response |
| `packages/modules/src/pipelines/index.ts` | **Edit** — add 5 new fine-grained permissions |
| DB migration | **Create** — `ALTER TABLE pipelines ADD COLUMN description text` |

---

## 8. Out of Scope

- Drag-to-reorder (use ↑↓ buttons — no dnd-kit dependency needed)
- Stage-change automation triggers
- Multi-level submenus beyond "Move to Stage"
- Pipeline duplication (context menu item links to configure, not duplicate)
