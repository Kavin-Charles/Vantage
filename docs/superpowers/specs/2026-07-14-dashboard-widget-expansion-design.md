# Dashboard Widget Expansion — Design Spec

**Date:** 2026-07-14  
**Status:** Approved  
**Branch:** `feat/dashboard-widget-expansion`

---

## 1. Objective

Transform the Vencore dashboard from 7 static widgets into a fully customizable business intelligence hub. Every major module exposes purpose-built widgets. Users compose their own view of workspace health without opening individual modules.

---

## 2. Scope

- ~52 widgets across 5 categories (Sales, Projects, Infrastructure, Communication, Insights)
- Expanded widget marketplace: full modal with category sidebar + search
- Per-widget configuration persisted to DB (time range, filters, refresh interval, chart type)
- Live auto-refresh for volatile widgets (alerts, servers, messaging, activity)
- Recharts for all chart widgets
- Existing 7 widgets upgraded in-place (same IDs, enriched registry metadata)

**Out of scope:** custom chart builder, budget tracking (no data model), user activity metrics, DM widgets, query performance widgets (no data model).

---

## 3. Architecture Approach

Extend the existing client-side registry pattern (`dashboard-registry.ts`). Each widget file is self-contained: React component + `registerDashboardWidget()` call at the bottom. A barrel file (`register-all-widgets.ts`) side-imports every widget file; the dashboard page imports the barrel once. Zero dashboard-core changes needed to add future widgets.

---

## 4. Type System Changes

### `DashboardWidgetDef` (extended)

```ts
export type WidgetCategory = 'sales' | 'projects' | 'infra' | 'communication' | 'insights';
export type WidgetSize = 'small' | 'medium' | 'large' | 'wide' | 'full';
export type WidgetFilterKey = 'timeRange' | 'limit' | 'compactMode' | 'chartType' | 'refreshInterval' | 'owner' | 'status';

export interface WidgetConfig {
  timeRange?: '1d' | '7d' | '30d' | 'custom';
  limit?: number;
  compactMode?: boolean;
  chartType?: 'line' | 'bar' | 'pie' | 'area';
  refreshInterval?: number; // ms; 0 = manual only
  filters?: Record<string, string>;
}

export interface DashboardWidgetDef {
  id: string;
  label: string;
  description: string;
  icon: string;                        // name from existing Icon component
  category: WidgetCategory;
  sizeOptions: WidgetSize[];
  defaultSize: WidgetSize;
  defaultW: number;
  defaultH: number;
  minW?: number;
  minH?: number;
  permission?: string;
  supportedFilters?: WidgetFilterKey[];
  defaultConfig?: WidgetConfig;
  component: React.ComponentType<{ config: WidgetConfig }>;
}
```

All widget components receive `config: WidgetConfig` as a prop. Widgets that don't declare `supportedFilters` ignore it.

---

## 5. Database Migration

```sql
-- apps/api/migrations/YYYYMMDD_add_widget_config.sql
ALTER TABLE dashboard_widgets ADD COLUMN config JSONB NOT NULL DEFAULT '{}';
```

`LayoutWidget` and `SaveLayoutWidget` types in `dashboard-api.ts` gain `config: WidgetConfig`.

No new API endpoints. The existing `PUT /api/dashboards/:id/layout` persists `config` per widget row alongside position. Config updates trigger a debounced (800ms) full-layout save — same pattern as drag/resize.

---

## 6. Widget Marketplace Modal

Replaces `AddWidgetPanel`. File: `WidgetMarketplaceModal.tsx`.

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Add Widget                         [🔍 Search...]   │
├──────────────┬──────────────────────────────────────┤
│ All          │  ┌──────────┐ ┌──────────┐ ┌──────┐  │
│ Sales        │  │   icon   │ │   icon   │ │ icon │  │
│ Projects     │  │  Title   │ │  Title   │ │Title │  │
│ Infra        │  │  desc    │ │  desc    │ │ desc │  │
│ Communication│  │ [+ Add]  │ │[✓ Added] │ │[+Add]│  │
│ Insights     │  └──────────┘ └──────────┘ └──────┘  │
│              │  ...3-col grid...                     │
└──────────────┴──────────────────────────────────────┘
```

### Behavior
- Centered overlay, ~860px wide, ~600px tall, backdrop blur
- Left sidebar: category nav. Click filters widget grid to that category.
- Search bar: auto-focused on open. Filters across all categories simultaneously. Clears active category filter.
- Widget cards (3-col grid): icon + title + description + `+ Add` button.
- Already-added widgets: disabled `✓ Added` state — visible but not clickable.
- Adding: closes modal, places widget at bottom of grid.
- Keyboard: `Escape` closes.
- `AddWidgetPanel.tsx` deleted.

---

## 7. WidgetCard Changes

- Gear icon (⚙) on every card — appears on hover in view mode, always visible in edit mode.
- Click opens `WidgetConfigPopover` anchored to card top-right.
- `WidgetCard` receives `config: WidgetConfig` + `onConfigChange: (config: WidgetConfig) => void`.
- `DashboardGrid` passes `config={row.config ?? {}}` and routes `onConfigChange` up to the page-level debounced save.

---

## 8. Widget Config Popover

File: `WidgetConfigPopover.tsx`. Inline popover rendered inside `WidgetCard`.

Rendered controls based on `def.supportedFilters`:

| Filter key | Control |
|---|---|
| `timeRange` | Segmented pill: Today / 7d / 30d |
| `limit` | Stepper select: 5 / 10 / 25 / 50 |
| `compactMode` | Toggle |
| `chartType` | Icon toggle: line / bar / pie / area |
| `refreshInterval` | Select: Off / 30s / 1m / 5m |
| `owner` | User picker |
| `status` | Multi-select (module-specific values) |

Widgets with no `supportedFilters` still show the popover with only "Remove widget" (mirrors existing right-click context menu — surfaced via gear for discoverability).

---

## 9. Live Updates

Three tiers:

| Tier | Mechanism | Widgets |
|---|---|---|
| React Query `refetchInterval` | `config.refreshInterval` passed to `useQuery` | Alerts, Servers overview, Websites, Activity, Tasks, Messaging |
| Existing `ServerMetricsContext` WebSocket | No change | Servers CPU/RAM/Storage detail widgets |
| Manual only (`refreshInterval: 0`) | User triggers refetch via popover | Analytics charts, Companies, Pipeline value |

`refetchIntervalInBackground: false` on all polling queries — stops when tab is hidden.

Default `refreshInterval` values per widget:
- Alerts: `60_000`
- Servers overview: `60_000`  
- Messaging channels: `15_000`
- Activity: `120_000`
- Everything else: `0`

---

## 10. Widget Catalog

### Sales (15 widgets)

| ID | Label | Default size | Filters | Chart |
|---|---|---|---|---|
| `core:contacts` | Contacts | 4×4 | limit | — |
| `sales:contacts-recent` | Recent Contacts | 4×4 | limit | — |
| `sales:contacts-new-today` | New Leads Today | 2×2 | — | — |
| `sales:contacts-status` | Lead Status Breakdown | 3×3 | timeRange | pie |
| `sales:contacts-followups` | Follow-ups Due | 4×3 | limit | — |
| `sales:contacts-top-customers` | Top Customers | 4×3 | limit | — |
| `sales:contacts-growth` | Contact Growth | 6×3 | timeRange, chartType | line/bar |
| `core:pipeline` | Pipeline Overview | 6×3 | — | — |
| `sales:pipeline-deals-by-stage` | Deals by Stage | 6×4 | — | bar |
| `sales:pipeline-value` | Pipeline Value | 4×3 | — | — |
| `sales:pipeline-closing-week` | Closing This Week | 4×3 | — | — |
| `sales:pipeline-win-rate` | Win Rate | 3×3 | timeRange | line |
| `sales:pipeline-recent` | Recent Opportunities | 4×3 | limit | — |
| `sales:companies-recent` | Recently Added Companies | 4×3 | limit | — |
| `sales:companies-by-industry` | Companies by Industry | 4×3 | — | pie |
| `sales:companies-largest` | Largest Customers | 4×3 | limit | — |
| `sales:companies-growth` | Company Growth | 6×3 | timeRange | line |

### Projects (11 widgets)

| ID | Label | Default size | Filters |
|---|---|---|---|
| `tasks-overview` | My Tasks | 4×4 | — |
| `projects:tasks-due-today` | Due Today | 3×3 | — |
| `projects:tasks-overdue` | Overdue Tasks | 3×3 | limit |
| `projects:tasks-upcoming` | Upcoming Deadlines | 4×3 | — |
| `projects:tasks-completed-week` | Completed This Week | 3×2 | — |
| `projects:tasks-team-progress` | Team Task Progress | 4×3 | — |
| `projects:tasks-priority` | Priority Breakdown | 3×3 | — |
| `core:projects` | Active Projects | 4×3 | limit |
| `projects:delayed` | Delayed Projects | 4×3 | — |
| `projects:milestones-due` | Milestones Due | 4×3 | — |
| `projects:team-workload` | Team Workload | 6×3 | — |
| `projects:recent-activity` | Recent Project Activity | 4×4 | limit |

### Infrastructure (14 widgets)

| ID | Label | Default size | Filters |
|---|---|---|---|
| `core:servers` | Server Health | 4×3 | — |
| `infra:servers-cpu` | CPU Usage | 4×3 | limit |
| `infra:servers-ram` | RAM Usage | 4×3 | limit |
| `infra:servers-storage` | Storage Usage | 4×3 | limit |
| `infra:servers-offline` | Offline Servers | 3×2 | — |
| `infra:servers-alerts` | Server Alerts | 4×3 | — |
| `infra:servers-top-consumers` | Top Resource Consumers | 4×3 | limit |
| `infra:db-health` | Database Health | 4×3 | — |
| `infra:db-storage` | DB Storage Usage | 4×3 | limit |
| `infra:db-connections` | Connection Count | 4×3 | limit |
| `infra:db-replication` | Replication Lag | 4×3 | — |
| `infra:websites-status` | Website Status | 4×3 | — |
| `infra:websites-uptime` | Uptime % | 4×3 | limit |
| `infra:websites-ssl` | SSL Expiry | 4×3 | — |
| `infra:websites-response` | Response Time | 4×3 | limit |

### Communication (3 widgets)

| ID | Label | Default size | Filters |
|---|---|---|---|
| `comm:channels-active` | Active Channels | 4×4 | limit, refreshInterval |
| `comm:channels-unread` | Unread Messages | 3×3 | refreshInterval |
| `comm:recent-conversations` | Recent Conversations | 4×4 | limit |

### Insights (10 widgets)

| ID | Label | Default size | Filters | Chart |
|---|---|---|---|---|
| `insights:revenue-trend` | Revenue Trend | 6×4 | timeRange, chartType | area/line/bar |
| `insights:pipeline-by-stage` | Pipeline by Stage | 6×4 | — | bar |
| `insights:kpi-cards` | KPI Cards | 6×2 | timeRange | — |
| `insights:team-leaderboard` | Team Leaderboard | 4×4 | timeRange, limit | — |
| `core:alerts` | Alerts | 4×3 | — | — |
| `insights:alerts-critical` | Critical Alerts | 4×3 | refreshInterval | — |
| `insights:alerts-warning` | Warning Alerts | 4×3 | refreshInterval | — |
| `insights:alerts-resolved` | Recently Resolved | 4×3 | limit | — |
| `core:activity` | Workspace Activity | 4×4 | limit, refreshInterval | — |
| `insights:activity-team` | Team Activity | 4×4 | limit | — |
| `insights:activity-changes` | Recent Changes | 4×4 | limit | — |

---

## 11. Empty States

Every widget handles three states: loading (skeleton), error (retry button), empty (styled call-to-action).

Empty state copy per module:
- Contacts: "Add your first contact"
- Pipeline: "Create your first pipeline"
- Companies: "Add your first company"
- Tasks: "No open tasks" (positive — not a CTA)
- Projects: "Create your first project"
- Servers: "Connect your first server"
- Databases: "Add your first database"
- Websites: "Add a website to monitor"
- Messaging: "Join a channel to see messages"
- Alerts: "No active alerts" (positive)
- Analytics: "Close deals to see revenue data"

---

## 12. Charts (Recharts)

Add `recharts` to `apps/web/package.json`.

Chart widgets use `ResponsiveContainer` wrapping `LineChart` / `BarChart` / `PieChart` / `AreaChart`. Chart type switches via `config.chartType`. Default colors use Vencore CSS variables (`--green`, `--blue`, `--amber`, `--red`) passed as hex equivalents (CSS vars aren't readable by SVG fill).

Color constants defined once in `apps/web/modules/shared/lib/chart-colors.ts`:
```ts
export const CHART_COLORS = {
  green: '#2d6a4f',
  blue: '#1e3a8a',
  amber: '#92400e',
  red: '#991b1b',
  text3: '#9e998f',
};
```

---

## 13. Performance

- Widget components are loaded via side-import barrel — all in the dashboard bundle. Acceptable: users navigating to the dashboard expect a heavier page.
- Each widget's `useQuery` is independent. One failed query doesn't affect others (existing `WidgetErrorBoundary` guarantees isolation).
- `staleTime: 60_000` default on all widget queries.
- `refetchIntervalInBackground: false` on all polling queries.
- Recharts `ResponsiveContainer` handles resize without rerender of data.
- `WidgetSkeleton` shown during initial load — no layout shift.

---

## 14. File List

### Modified
- `apps/web/modules/shared/lib/dashboard-registry.ts`
- `apps/web/modules/shared/lib/register-module-widgets.ts` → replaced by `register-all-widgets.ts`
- `apps/web/modules/shared/components/ui/WidgetHelpers.tsx`
- `apps/web/modules/dashboard/components/DashboardGrid.tsx`
- `apps/web/modules/dashboard/components/WidgetCard.tsx`
- `apps/web/modules/dashboard/lib/dashboard-api.ts`
- `apps/web/package.json` (add recharts)

### Deleted
- `apps/web/modules/dashboard/components/AddWidgetPanel.tsx`

### New — Dashboard
- `apps/web/modules/dashboard/components/WidgetMarketplaceModal.tsx`
- `apps/web/modules/dashboard/components/WidgetConfigPopover.tsx`
- `apps/web/modules/shared/lib/chart-colors.ts`

### New — Sales widgets (15)
- `apps/web/modules/crm/contacts/components/widgets/RecentContactsWidget.tsx`
- `apps/web/modules/crm/contacts/components/widgets/NewLeadsTodayWidget.tsx`
- `apps/web/modules/crm/contacts/components/widgets/ContactStatusWidget.tsx`
- `apps/web/modules/crm/contacts/components/widgets/FollowupsDueWidget.tsx`
- `apps/web/modules/crm/contacts/components/widgets/TopCustomersWidget.tsx`
- `apps/web/modules/crm/contacts/components/widgets/ContactGrowthWidget.tsx`
- `apps/web/modules/crm/pipeline/components/widgets/DealsByStageWidget.tsx`
- `apps/web/modules/crm/pipeline/components/widgets/PipelineValueWidget.tsx`
- `apps/web/modules/crm/pipeline/components/widgets/ClosingThisWeekWidget.tsx`
- `apps/web/modules/crm/pipeline/components/widgets/WinRateWidget.tsx`
- `apps/web/modules/crm/pipeline/components/widgets/RecentOpportunitiesWidget.tsx`
- `apps/web/modules/crm/companies/components/widgets/RecentCompaniesWidget.tsx`
- `apps/web/modules/crm/companies/components/widgets/CompaniesByIndustryWidget.tsx`
- `apps/web/modules/crm/companies/components/widgets/LargestCustomersWidget.tsx`
- `apps/web/modules/crm/companies/components/widgets/CompanyGrowthWidget.tsx`

### New — Projects widgets (11)
- `apps/web/modules/crm/tasks/components/widgets/DueTodayWidget.tsx`
- `apps/web/modules/crm/tasks/components/widgets/OverdueTasksWidget.tsx`
- `apps/web/modules/crm/tasks/components/widgets/UpcomingDeadlinesWidget.tsx`
- `apps/web/modules/crm/tasks/components/widgets/CompletedThisWeekWidget.tsx`
- `apps/web/modules/crm/tasks/components/widgets/TeamTaskProgressWidget.tsx`
- `apps/web/modules/crm/tasks/components/widgets/TaskPriorityWidget.tsx`
- `apps/web/modules/projects/components/widgets/ActiveProjectsWidget.tsx`
- `apps/web/modules/projects/components/widgets/DelayedProjectsWidget.tsx`
- `apps/web/modules/projects/components/widgets/MilestonesDueWidget.tsx`
- `apps/web/modules/projects/components/widgets/TeamWorkloadWidget.tsx`
- `apps/web/modules/projects/components/widgets/ProjectActivityWidget.tsx`

### New — Infra widgets (14)
- `apps/web/modules/servers/components/widgets/CpuUsageWidget.tsx`
- `apps/web/modules/servers/components/widgets/RamUsageWidget.tsx`
- `apps/web/modules/servers/components/widgets/StorageUsageWidget.tsx`
- `apps/web/modules/servers/components/widgets/OfflineServersWidget.tsx`
- `apps/web/modules/servers/components/widgets/ServerAlertsWidget.tsx`
- `apps/web/modules/servers/components/widgets/TopConsumersWidget.tsx`
- `apps/web/modules/databases/components/widgets/DatabaseHealthWidget.tsx`
- `apps/web/modules/databases/components/widgets/DbStorageWidget.tsx`
- `apps/web/modules/databases/components/widgets/DbConnectionsWidget.tsx`
- `apps/web/modules/databases/components/widgets/ReplicationLagWidget.tsx`
- `apps/web/modules/shared/components/widgets/WebsiteStatusWidget.tsx`
- `apps/web/modules/shared/components/widgets/WebsiteUptimeWidget.tsx`
- `apps/web/modules/shared/components/widgets/SslExpiryWidget.tsx`
- `apps/web/modules/shared/components/widgets/ResponseTimeWidget.tsx`

### New — Communication widgets (3)
- `apps/web/modules/messaging/components/widgets/ActiveChannelsWidget.tsx`
- `apps/web/modules/messaging/components/widgets/UnreadMessagesWidget.tsx`
- `apps/web/modules/messaging/components/widgets/RecentConversationsWidget.tsx`

### New — Insights widgets (10)
- `apps/web/modules/analytics/components/widgets/RevenueTrendWidget.tsx`
- `apps/web/modules/analytics/components/widgets/PipelineByStageWidget.tsx`
- `apps/web/modules/analytics/components/widgets/KpiCardsWidget.tsx`
- `apps/web/modules/analytics/components/widgets/TeamLeaderboardWidget.tsx`
- `apps/web/modules/alerts/components/widgets/CriticalAlertsWidget.tsx`
- `apps/web/modules/alerts/components/widgets/WarningAlertsWidget.tsx`
- `apps/web/modules/alerts/components/widgets/RecentlyResolvedWidget.tsx`
- `apps/web/modules/activity/components/widgets/WorkspaceActivityWidget.tsx`
- `apps/web/modules/activity/components/widgets/TeamActivityWidget.tsx`
- `apps/web/modules/activity/components/widgets/RecentChangesWidget.tsx`

### DB migration
- `apps/api/migrations/YYYYMMDD_add_widget_config.sql`

---

## 15. Implementation Notes

- Website widgets live in `modules/shared/components/widgets/` because websites module doesn't have its own component folder yet. Can be relocated when the websites module grows.
- `register-module-widgets.ts` renamed to `register-all-widgets.ts` to reflect full scope. Import path in dashboard page updated accordingly.
- Existing widget IDs (`core:contacts`, `core:pipeline`, etc.) are preserved — no DB migrations needed for existing layout rows.
- `tasks-overview` ID also preserved for same reason.
- All widget components are `'use client'` — they use hooks (`useQuery`, `useApiToken`, `useModules`).
- Charts use `<ResponsiveContainer width="100%" height="100%">` — they fill the widget card's flex container naturally.
