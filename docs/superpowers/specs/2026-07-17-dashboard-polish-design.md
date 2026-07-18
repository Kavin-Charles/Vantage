# Dashboard Polish — Design Spec

**Goal:** Expand per-widget config, add a flexible icon system, redesign the marketplace sidebar to show modules + plugins, fix the modal collapse bug, and fix the right-side grid padding bug.

**Architecture:** All changes are additive to the existing widget registry pattern. No schema changes required — `config.filters: Record<string, string>` already exists. New `filterDefs` replaces the implicit `supportedFilters` string-key pattern for widget-specific settings.

**Tech Stack:** Next.js App Router, TypeScript strict, react-grid-layout, React Query v5, existing `@vencore/api-client` for dynamic fetch options.

---

## Global Constraints

- TypeScript strict — no `any`, no `console.log`
- All components `'use client'`
- All colors via CSS variables — no hardcoded hex outside `chart-colors.ts`
- Existing widget IDs must not change
- `pnpm tsc --noEmit -p apps/web/tsconfig.json` must pass with 0 errors after each task
- Do not break existing widgets — all changes are backwards-compatible additions

---

## 1. Icon System

### Problem
`DashboardWidgetDef.icon: string` only supports named SVG icons from `Icon.tsx`. Developers cannot use emoji, custom SVG nodes, or images.

### Solution
Add optional `iconEl?: React.ReactNode` field to `DashboardWidgetDef`. When present, it takes precedence over `icon`.

```ts
// dashboard-registry.ts
export interface DashboardWidgetDef {
  id: string;
  label: string;
  description: string;
  icon: string;           // existing — named icon key fallback
  iconEl?: React.ReactNode; // NEW — takes precedence; accepts emoji string rendered as <span>, SVG, img, etc.
  // ... rest unchanged
}
```

**Render pattern** (in marketplace card and any icon slot):
```tsx
const iconContent = def.iconEl ?? <Icon name={def.icon} size={16} color="var(--text2)" />;
```

Backwards compatible — all existing widgets that only set `icon: string` continue to work unchanged.

---

## 2. Per-Widget Filter Definitions

### Problem
`supportedFilters: WidgetFilterKey[]` supports only a fixed set of generic controls (timeRange, limit, chartType, etc.). Widget-specific filters (pipeline stage, contact status, assignee, server region, database engine) are not supported.

### Solution

#### New types in `dashboard-registry.ts`

```ts
export type FilterOption = { label: string; value: string };

export interface WidgetFilterDef {
  key: string;                                              // stored in config.filters[key]
  label: string;                                            // section heading in popover
  type: 'pills' | 'select';
  options?: FilterOption[];                                 // static options
  fetchOptions?: (token: string) => Promise<FilterOption[]>; // dynamic — token passed from popover
  placeholder?: string;                                     // for select type
  multi?: boolean;                                          // comma-separated multi-select (pills only)
}
```

Add to `DashboardWidgetDef`:
```ts
filterDefs?: WidgetFilterDef[];  // widget-specific dynamic/static filters
```

`WidgetConfig` gains nothing new — `config.filters: Record<string, string>` (already present) stores filter values.

#### WidgetConfigPopover changes

- Calls `useApiToken()` internally
- For each `filterDef` with `fetchOptions`, uses `useQuery({ queryKey: ['widget-filter-options', def.key], queryFn: () => def.fetchOptions!(token), staleTime: 300_000 })` to load options
- Renders widget-specific `filterDefs` section **below** existing generic controls
- `pills` type: renders `PillGroup` with loaded/static options
- `select` type: renders `<select>` element with loaded/static options plus an "All" empty option

#### Widget-specific filters to add

**Sales / CRM:**
| Widget | `filterDef.key` | type | source |
|---|---|---|---|
| RecentContactsWidget, TopCustomersWidget | `status` | pills | static: prospect, customer, cold, churned |
| FollowupsDueWidget, DueTodayWidget, OverdueTasksWidget, UpcomingDeadlinesWidget, CompletedThisWeekWidget | `owner` | select | fetch `/api/users` → `{id, name}[]` |
| DealsByStageWidget, PipelineValueWidget, ClosingThisWeekWidget, WinRateWidget, RecentOpportunitiesWidget | `owner` | select | fetch `/api/users` |
| RecentOpportunitiesWidget, PipelineValueWidget | `stage` | pills | static: lead, qualifying, proposal, closing, won, lost |

**Infrastructure:**
| Widget | `filterDef.key` | type | source |
|---|---|---|---|
| DatabaseHealthWidget, DbStorageWidget, DbConnectionsWidget, ReplicationLagWidget | `engine` | pills | static: postgres, mysql, redis, clickhouse, mongo, other |
| CpuUsageWidget, RamUsageWidget, StorageUsageWidget | `region` | select | fetch `/api/servers` → distinct non-null regions |

**Insights:**
| Widget | `filterDef.key` | type | source |
|---|---|---|---|
| CriticalAlertsWidget, WarningAlertsWidget, RecentlyResolvedWidget | `resource_type` | pills | static: server, database, website, crm |
| WorkspaceActivityWidget | `type` | pills | static: email, call, note, meeting, deal_change, infra_alert |
| TeamActivityWidget | `user` | select | fetch `/api/users` |

#### Widget query key + fetch URL changes

Each affected widget must:
1. Read `config.filters?.['key']` from props
2. Include it in the React Query `queryKey`
3. Append it to the fetch URL when non-empty (e.g. `?owner=<id>`, `?engine=postgres`, `?resource_type=server`)

---

## 3. Marketplace Sidebar — Modules + Plugin Filters

### Problem
Sidebar is a flat list of 5 categories. Users cannot filter to a specific module (e.g. only Contacts widgets, only Servers widgets).

### Solution

#### New types

```ts
export interface ModuleDef {
  id: string;    // e.g. 'contacts', 'pipeline', 'servers'
  label: string; // e.g. 'Contacts', 'Pipeline', 'Servers'
}
```

Add to `DashboardWidgetDef`:
```ts
module?: string;  // e.g. 'contacts', 'pipeline', 'companies', 'tasks', 'servers'
```

#### Category → Module hierarchy

```ts
export const CATEGORY_MODULES: Record<WidgetCategory, ModuleDef[]> = {
  sales:         [{ id: 'contacts', label: 'Contacts' }, { id: 'pipeline', label: 'Pipeline' }, { id: 'companies', label: 'Companies' }],
  projects:      [{ id: 'tasks', label: 'Tasks' }, { id: 'projects', label: 'Projects' }],
  infra:         [{ id: 'servers', label: 'Servers' }, { id: 'databases', label: 'Databases' }, { id: 'websites', label: 'Websites' }],
  communication: [],
  insights:      [{ id: 'analytics', label: 'Analytics' }, { id: 'alerts', label: 'Alerts' }, { id: 'activity', label: 'Activity' }],
};
```

#### Sidebar active state

```ts
type SidebarFilter =
  | { type: 'all' }
  | { type: 'category'; category: WidgetCategory }
  | { type: 'module'; category: WidgetCategory; module: string }
  | { type: 'plugins' };
```

#### Sidebar rendering

- **All** — always shown at top
- Category rows — clickable (selects all widgets in that category), bold label + widget count badge
- Module sub-rows — indented 12px, shown below parent category when category has `CATEGORY_MODULES[cat].length > 0`; clicking filters to that module
- **Plugins** — shown at bottom only when `pluginWidgets.size > 0`
- Active row: `background: var(--surface2)`, `border-left: 2px solid var(--text)`

#### Widget filter logic

```ts
const q = search.toLowerCase();
const filtered = allWidgets.filter(def => {
  const matchesSearch = !q || def.label.toLowerCase().includes(q) || def.description.toLowerCase().includes(q);
  if (filter.type === 'all') return matchesSearch;
  if (filter.type === 'category') return matchesSearch && def.category === filter.category;
  if (filter.type === 'module') return matchesSearch && def.module === filter.module;
  if (filter.type === 'plugins') return matchesSearch && pluginWidgets.has(def.id);
  return false;
});
```

Searching resets filter to `{ type: 'all' }`.

#### Module assignments for all existing widgets

| Module | Widgets |
|---|---|
| `contacts` | RecentContactsWidget, NewLeadsTodayWidget, ContactStatusWidget, FollowupsDueWidget, TopCustomersWidget, ContactGrowthWidget |
| `pipeline` | DealsByStageWidget, PipelineValueWidget, ClosingThisWeekWidget, WinRateWidget, RecentOpportunitiesWidget |
| `companies` | RecentCompaniesWidget, CompaniesByIndustryWidget, LargestCustomersWidget, CompanyGrowthWidget |
| `tasks` | DueTodayWidget, OverdueTasksWidget, UpcomingDeadlinesWidget, CompletedThisWeekWidget, TeamTaskProgressWidget, TaskPriorityWidget |
| `projects` | ActiveProjectsWidget, DelayedProjectsWidget, MilestonesDueWidget, TeamWorkloadWidget, ProjectActivityWidget |
| `servers` | CpuUsageWidget, RamUsageWidget, StorageUsageWidget, OfflineServersWidget, ServerAlertsWidget, TopConsumersWidget |
| `databases` | DatabaseHealthWidget, DbStorageWidget, DbConnectionsWidget, ReplicationLagWidget |
| `websites` | WebsiteStatusWidget, WebsiteUptimeWidget, SslExpiryWidget, ResponseTimeWidget |
| `analytics` | RevenueTrendWidget, PipelineByStageWidget, KpiCardsWidget, TeamLeaderboardWidget |
| `alerts` | CriticalAlertsWidget, WarningAlertsWidget, RecentlyResolvedWidget |
| `activity` | WorkspaceActivityWidget, TeamActivityWidget, RecentChangesWidget |

The 7 core widgets (core:contacts, core:pipeline, etc.) keep their existing registration — module field optional, they appear under `category` filter.

---

## 4. Modal Fixed Size

### Problem
Modal collapses vertically when a selected category has few or no widgets.

### Fix
Change `maxHeight: '80vh'` to `height: '80vh'` in `WidgetMarketplaceModal`. The inner widget grid area is already `flex: 1, overflowY: auto` so it scrolls; with a fixed height the modal never collapses.

---

## 5. Right-Side Grid Padding Bug

### Problem
`ResponsiveGridLayout` applies default `containerPadding: [10, 10]`, consuming 20px from the right side of the measured container width. The outer dashboard container already provides 20px right padding. Net result: widgets cannot be dragged into or placed at the rightmost ~30px of the grid.

### Fix
Add `containerPadding={[0, 0]}` to `ResponsiveGridLayout` in `DashboardGrid.tsx`.

```tsx
<ResponsiveGridLayout
  containerPadding={[0, 0]}  // remove internal padding; outer container provides the inset
  // ...
/>
```

---

## Files Modified / Created

| File | Change |
|---|---|
| `apps/web/modules/shared/lib/dashboard-registry.ts` | Add `iconEl`, `filterDefs`, `module`, `FilterOption`, `WidgetFilterDef`, `ModuleDef`, `CATEGORY_MODULES` |
| `apps/web/modules/dashboard/components/WidgetConfigPopover.tsx` | Add `filterDefs` rendering with `useApiToken` + React Query dynamic fetch |
| `apps/web/modules/dashboard/components/WidgetMarketplaceModal.tsx` | Sidebar redesign: two-level category+module hierarchy, Plugins group, fixed height |
| `apps/web/modules/dashboard/components/DashboardGrid.tsx` | Add `containerPadding={[0, 0]}` |
| All 22 widgets listed in §2 filter table | Add `filterDefs` + `module` to `registerDashboardWidget`, read `config.filters` in component |
| All remaining widgets (not in §2 table) | Add `module` to `registerDashboardWidget` only |
| `apps/web/modules/shared/lib/register-module-widgets.ts` | Add `module` to 7 core widget registrations |

---

## Out of Scope

- Multi-dashboard widget config inheritance
- Filter persistence per-user (stored in config JSONB, already workspace-scoped)
- Widgets not yet in the registry (communication/messaging — no widgets exist yet)
