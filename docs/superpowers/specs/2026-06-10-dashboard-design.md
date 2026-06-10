# Dashboard Feature Design

**Date:** 2026-06-10  
**Route:** `/dashboard`  
**Status:** Approved for implementation

---

## Overview

Admin-configurable dashboards composed of drag-and-drop widgets. Modules and plugins register widgets. Admin creates named dashboards, places widgets via a grid editor, and assigns dashboards to user groups. Users see only the dashboards assigned to their groups, and only the widgets they have permission to see (enforced server-side).

---

## Data Model

Four new tables added via SQL migration in the main database (not a plugin migration).

```sql
CREATE TABLE dashboards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name         VARCHAR NOT NULL,
  created_by   UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dashboard_layouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  widget_id    VARCHAR NOT NULL,
  x            INT NOT NULL,
  y            INT NOT NULL,
  w            INT NOT NULL,
  h            INT NOT NULL,
  min_w          INT,
  min_h          INT,
  permission_key VARCHAR
);

CREATE TABLE dashboard_group_assignments (
  dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  group_id     UUID NOT NULL,
  PRIMARY KEY (dashboard_id, group_id)
);

```

Layout rows are individual records (not a JSONB blob) — clean to query and easy to diff on save. Each widget placed on a dashboard gets one `dashboard_layouts` row. The 12-column react-grid-layout coordinate system is used for `x/y/w/h`. `permission_key` is populated when the admin places the widget (sourced from the widget's `DashboardWidgetDef.permission`) and used server-side to filter rows per user.

---

## Widget Registry

### Built-in Modules — Static Registry

```ts
// modules/shared/lib/dashboard-registry.ts

export interface DashboardWidgetDef {
  id: string;
  label: string;
  description?: string;
  defaultW: number;
  defaultH: number;
  minW?: number;
  minH?: number;
  permission?: string;
  component: React.ComponentType;
}
```

Modules call `registerDashboardWidget(def)` at module init. Tree-shakeable and fully typed — no runtime fetch required.

### Plugins — Extended Frontend API

`VencoreFrontendAPI` gains:
```ts
registerDashboardWidget(
  def: Omit<DashboardWidgetDef, 'component'>,
  component: AnyComponent
): void;
```

Plugins also extend `PluginWidgetDef` in `PluginSurfaces` with optional `defaultW`, `defaultH`, `minW`, `minH` fields for the admin widget picker.

### Unified at Render Time

The dashboard page merges both sources into one `Map<id, DashboardWidgetDef>`. The admin widget picker shows all available widgets from both module and plugin sources.

---

## API Routes

All routes under `/api/dashboards`. All require `requireAuth`. Write operations require `requireAdmin`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboards` | List dashboards visible to current user (via group membership; admin sees all) |
| POST | `/api/dashboards` | Create dashboard [admin] |
| GET | `/api/dashboards/:id` | Get dashboard + layout rows + group assignments. Strips widget rows the user lacks permission for. |
| PUT | `/api/dashboards/:id` | Rename dashboard [admin] |
| DELETE | `/api/dashboards/:id` | Delete dashboard + all layout rows [admin] |
| PUT | `/api/dashboards/:id/layout` | Replace all layout rows (full save on edit-mode exit) [admin] |
| PUT | `/api/dashboards/:id/groups` | Set group assignments [admin] |
### Permission Enforcement

`GET /api/dashboards/:id` checks:
1. User is in an assigned group OR is admin
2. Strips `dashboard_layouts` rows where `permission_key IS NOT NULL` and the user does not hold that permission

Users never receive layout data for widgets they cannot see — enforced server-side. The admin widget picker is fed entirely by the frontend registry (no backend endpoint needed — frontend already knows all available widgets from both static module defs and runtime plugin registrations).

---

## Frontend Architecture

### Routes

Inside the existing `(dashboard)` route group:

```
app/(dashboard)/dashboard/page.tsx         — redirect to first assigned dashboard
app/(dashboard)/dashboard/[id]/page.tsx    — dashboard view/edit page
```

### Module Directory

```
modules/dashboard/
  components/
    DashboardGrid.tsx       — react-grid-layout wrapper, toggled read-only/edit mode
    WidgetCard.tsx          — per-widget wrapper: drag handle, resize handle, ErrorBoundary
    AddWidgetPanel.tsx      — slide-in panel listing widgets not yet on the dashboard
    DashboardHeader.tsx     — dashboard name, "Edit Layout" toggle, group assignment (admin)
    GroupAssignModal.tsx    — multi-select groups to assign to a dashboard
  pages/
    page.tsx                — redirect logic
    [id]/page.tsx           — fetch + render
  lib/
    dashboard-api.ts        — typed fetch wrappers for all API routes
```

### Edit Mode UX

- Admin clicks "Edit Layout" → grid becomes draggable and resizable; `+` button opens `AddWidgetPanel`
- "Save" → single `PUT /api/dashboards/:id/layout` with the full layout array
- "Cancel" → reverts to last saved layout (local state rollback, no API call)

### Sidebar

Add "Dashboard" navigation item to `modules/shared/components/Sidebar.tsx`, visible to all authenticated users.

---

## Error Handling & Edge Cases

| Case | Behavior |
|------|----------|
| Widget render error | `WidgetCard` ErrorBoundary shows "Widget unavailable" — does not crash the dashboard |
| No dashboards assigned | Empty state: "No dashboards have been assigned to your groups." Admins see "Create Dashboard" CTA |
| Orphaned widget (plugin uninstalled) | Frontend renders "Plugin not installed" placeholder. Admin can remove in edit mode. DB row preserved until explicitly removed. |
| Permission stripped server-side | Layout row absent from API response. No client-side secret exposure. |
| Concurrent admin edits | Last write wins (`PUT /layout` replaces all rows). No conflict resolution in v1. |
| Empty dashboard (admin view) | Shows "Add widgets" empty state with CTA to enter edit mode |

---

## Dependencies

- `react-grid-layout` — drag, resize, snap-to-grid, animated reflow
- No other new dependencies

---

## Out of Scope (v1)

- Per-user layout customization (all users in a group see the same admin-set layout)
- Dashboard templates
- Widget configuration panels (widgets configure themselves via plugin settings)
- Real-time widget refresh coordination
