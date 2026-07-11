# Sidebar Grouping — Design

**Date:** 2026-07-11
**Status:** Approved

## Summary

User-facing sidebar reorganisation driven by right-click context menus.

- **Groups** are admin-managed and workspace-wide: one layout shared by every user in the workspace. Admins create, rename, reorder, and delete groups, and move nav items between them.
- **Pins** are per-user: any user can pin nav items to a "Pinned" section at the top of the sidebar, and collapse/expand groups. Both stored in the backend per user.
- Settings leaves the nav list entirely and becomes a gear icon in the bottom user row, next to logout.

## Current state

- `apps/web/modules/shared/components/Sidebar.tsx` renders a hardcoded `NAV_GROUPS` constant. Group labels are never rendered — items map flat.
- `NavLink` already wires a right-click menu (Open / Open in new tab / Copy URL / Refresh / "Pin to top (coming soon)" stub).
- `apps/web/modules/shared/components/ui/ContextMenu.tsx` is a full-featured reusable menu: items, submenus, headers, separators, danger styling, keyboard navigation.

## Data model

Nav items are identified by `item_key` = their `href` (e.g. `/pipeline`). Plugin nav items use their computed href (e.g. `/plugins/<id>/<path>`).

### `workspace_sidebar_groups` (workspace-scoped, admin-managed)

```
id           uuid PK
workspace_id uuid FK → workspace
label        text
position     int
is_default   bool          -- exactly one per workspace; undeletable sink group
item_keys    jsonb         -- ordered array of item_key strings
created_at   timestamp
updated_at   timestamp
```

JSONB array on the group (not a relational item table): moves and reorders are array edits, item counts are ~a dozen, no joins needed.

### `user_sidebar_prefs` (per-user)

```
user_id             uuid FK → user
workspace_id        uuid FK → workspace
pinned_keys         jsonb   -- ordered array of item_key strings
collapsed_group_ids jsonb   -- array of group ids
PK (user_id, workspace_id)
```

### Seed layout

If a workspace has no group rows, `GET` returns this seed (not persisted). The first admin save persists it.

| Group | Items |
|---|---|
| Sales | /pipeline, /contacts, /companies, /tasks, /activity |
| Infra | /servers, /databases, /websites |
| Projects | /messaging, /projects |
| Insights | /analytics, /alerts |
| General *(default)* | /dashboard + any plugin/new item |

`/settings` is not an item key in any group — it lives in the bottom user row.

### Merge pass (every layout read)

On every `GET`, the stored layout is merged against the currently visible item keys:

- Any visible key not present in any group is appended to the default group. This automatically handles newly enabled modules and newly installed plugins.
- Guarantees enforced server-side regardless of stored state: no orphan keys, exactly one default group, no duplicate keys across groups.

Feature/module gating is unchanged and orthogonal: disabled modules and features never render, whatever group they sit in.

## API

All routes behind `requireWorkspace`, Zod-validated bodies, `{ data, error }` envelope.

```
GET  /api/sidebar/layout   all users. Groups (seeded if none saved), post-merge.
PUT  /api/sidebar/layout   admin only. Whole-layout replace.
                           Body: { groups: [{ id?, label, item_keys }] }
                           Array order = position. Validates: labels non-empty
                           and unique, no duplicate keys across groups, exactly
                           one default group.
GET  /api/sidebar/prefs    current user. { pinned_keys, collapsed_group_ids }
PUT  /api/sidebar/prefs    current user. Upsert, same shape.
```

Whole-layout PUT (not granular per-op endpoints): every admin operation (move up/down, move-to-group, rename, delete) recomputes the full layout client-side and saves once. One validator, no partial-update races.

- Delete group: client sends the layout without it; server merge pass moves orphaned keys to the default group.
- Pin/collapse writes are optimistic: React Query mutation updates cache immediately, PUT runs behind.
- Layout query cached (`staleTime` ~5 min), invalidated on admin save.

## Sidebar render

Top to bottom:

1. Logo lockup (unchanged).
2. **Pinned** section — rendered only when the user has pins. Items in `pinned_keys` order. A pinned item also remains in its group (pin = shortcut, not move).
3. **Groups** in `position` order. Group headers now rendered (uppercase label style). Chevron on header toggles collapse; state persisted per-user. Empty groups: visible to admins (dimmed), hidden from members.
4. Bottom row: **settings gear icon** (links `/settings`, active-state aware) + user avatar/name + logout.

Badges (alerts pulse dot, messaging unread count, settings update dot) follow their item wherever it renders, including the Pinned section. The update dot moves to the settings gear.

## Context menus

**Nav item — all users:**
Open · Open in new tab · Copy URL · ─ · Pin / Unpin

(Removes the old "Refresh" entry and the "Pin to top (coming soon)" stub.)

**Nav item — admin appends:**
─ · header "Manage" · Move to group ▸ (submenu: all groups + "New group…") · Move up · Move down (within group; disabled at edges)

**Group header — admin:**
Rename · New group below · Move up · Move down · ─ · Delete group (danger; disabled on default group). Delete moves the group's items to General.

**Pinned item:**
Unpin · Move up · Move down (within pins; per-user, all users)

**Rename / new group input:** inline edit on the group header itself (ContextMenu has no inputs). "New group…" creates the group with the edit field focused; Enter saves, Esc cancels.

## Error handling

- Layout PUT fails → toast + refetch layout (revert).
- Prefs PUT fails → silent revert on next refetch (pins/collapse are low-stakes).
- Layout GET fails → fall back to seed layout in-memory; the sidebar always renders.
- Concurrent admin edits → last-write-wins. Acceptable at this scale.
- Server merge pass repairs any bad stored state on read.

## Testing

**API (Vitest):**
- Seed returned on empty workspace; first save persists.
- Merge appends unknown visible keys to the default group.
- Validation rejects: duplicate keys across groups, zero/multiple default groups, empty or duplicate labels.
- Non-admin `PUT /layout` → 403.
- Prefs upsert scoped to the current user.
- Workspace isolation on both resources.

**Web (component tests):**
- Groups render in position order; collapse toggles and persists.
- Pin adds item to Pinned section while it stays in its group.
- Admin-only menu entries absent for members.

**Manual:** preview verification of menus, inline rename, pin/unpin, collapse across reloads.

## Out of scope

- Drag-and-drop reordering (right-click Move up/Down only, v1).
- Per-user custom groups (groups are workspace-wide, admin-only).
- Admin-set default collapse state.
