# Analytics Hub — Dynamic Cross-Module Analytics

**Date:** 2026-07-16
**Status:** Design — awaiting review
**Branch:** `feat/analytics-hub` (to be created off current work)

## Problem

The Analytics module is hardcoded to CRM. It queries the CRM pipeline directly and
shows revenue / pipeline / rep-leaderboard only. Infrastructure has no analytics at
all, and Project Management has per-project analytics locked inside each project
(`/api/projects/:id/analytics/*`) with no workspace-level rollup and no presence in
the Analytics module.

We want the Analytics module to become a **hub**: CRM, Infrastructure, and Project
Management each feed it, and the page renders **only the sections whose source is
active** for the workspace. New providers (including future plugins) should appear in
Analytics with zero Analytics-side code changes.

## Decisions (locked during brainstorming)

1. **Dynamic model = full contract discovery.** A section renders when its declared
   dependency is satisfied — a contract with an active provider, or an enabled builtin
   module. Any provider (builtin or plugin) that satisfies the dependency lights the
   section up.
2. **Mechanism = section-slot, reusing the existing hub-sections runtime.** No new
   typed per-domain data contracts. We extend the existing `hub-sections` resolver so
   builtin modules can register analytics sections alongside plugins.
3. **Layout = overview strip + stacked sections.** A top strip shows one headline KPI
   per active source; full sections stack below in one scroll.

## Existing machinery we build on

- `packages/plugin-runtime` — contract registry, provider selection
  (`getActiveProviderForContract`), hub records. Only **CRM contracts** exist today
  (`crm.contact@v1`, `crm.company@v1`, `crm.deal@v1`, `crm.activity@v1`).
- `apps/api/src/routes/hub-sections.ts` — `GET /api/hub/sections/:page` resolves plugin
  `sections` for a page, gated by `requires_contract`. **Reads only from
  `workspace_plugins` today.**
- `SLOT_CATALOG` (`packages/plugin-types`) — pages → slots. **No `analytics` page.**
- Frontend renders plugin sections as sandboxed **iframes**
  (`PluginRuntimeContext` / `PluginIframeSlot`). No builtin-section renderer exists.
- CRM analytics already built: `/api/analytics/{revenue,pipeline,team}` +
  `modules/analytics/components/{KpiCards,RevenueChart,PipelineChart,RepLeaderboard}`.
- PM per-project analytics built: `apps/api/src/routes/pm-analytics.ts` (health,
  by-status, velocity, burndown, workload).

## Architecture

### Slot catalog

Add an `analytics` page to `SLOT_CATALOG`:

```
'analytics': [
  { id: 'overview', layout: 'grid'  },   // headline KPI tiles, one per active source
  { id: 'panels',   layout: 'stack' },   // full sections, stacked in priority order
]
```

### Section dependency model

Extend the section definition with a builtin gate. A section declares **exactly one**
of:

- `requires_contract: string` — renders when that contract has an active provider
  (existing behavior; CRM uses `crm.deal@v1`).
- `requires_module: string` — renders when that builtin module is enabled for the
  workspace (new; Infra uses `infra`, PM uses `projects`).

This keeps CRM on true contract discovery (swap in a Zoho plugin providing
`crm.deal@v1` and the CRM analytics section still renders), while Infra and PM — which
have no contracts — gate on module-enabled.

### Builtin section registry (new)

A host-side registry so builtin modules contribute analytics sections, not just
plugins:

```ts
// apps/api/src/lib/builtin-sections.ts
interface BuiltinSection {
  module_id: string;          // 'crm' | 'infra' | 'projects'
  id: string;                 // stable id + client render key
  slot: string;               // 'analytics:overview' | 'analytics:panels'
  label: string;
  priority: number;
  requires_contract?: string; // CRM
  requires_module?: string;   // Infra, PM
}

export const BUILTIN_ANALYTICS_SECTIONS: BuiltinSection[] = [ ... ];
```

`hub-sections.ts` resolver is extended to:

1. Resolve plugin sections (existing path, `requires_contract` gate).
2. Resolve builtin sections: for each, pass its gate —
   `requires_contract` → `getActiveProviderForContract`;
   `requires_module` → check `workspace_modules.enabled`.
3. Merge both lists, sort by `priority` then id, return.

Each resolved section carries a `kind: 'builtin' | 'plugin'` so the frontend knows
whether to render a React component or an iframe.

### Frontend rendering

The Analytics page becomes a slot outlet:

1. `GET /api/hub/sections/analytics` → ordered sections (overview + panels).
2. A **builtin analytics section registry** (client) maps section id → React component:
   ```ts
   const ANALYTICS_SECTIONS: Record<string, React.FC<AnalyticsSectionProps>> = {
     'crm-overview': CrmOverviewTile,   'crm-panel': CrmAnalyticsSection,
     'infra-overview': InfraOverviewTile,'infra-panel': InfraAnalyticsSection,
     'pm-overview': PmOverviewTile,     'pm-panel': PmAnalyticsSection,
   };
   ```
3. Overview slot renders the `*-overview` tiles in a grid; panels slot renders the
   `*-panel` sections stacked. Unknown ids (plugin sections) fall back to the existing
   iframe path.
4. Global period toggle (30d/90d/12m) lives on the page and is passed to every section
   via `AnalyticsSectionProps { period }`.

## Data / API

### CRM — no backend change
Reuse `/api/analytics/{revenue,pipeline,team}`. `CrmAnalyticsSection` wraps the
existing four components. `CrmOverviewTile` shows total revenue (from `/revenue`).

### Infra — new `GET /api/analytics/infra?period=`
Rollup over `servers`, `websites`, `alerts` (all workspace-scoped):
- server counts by status (online / degraded / offline / stopped), avg cpu/mem/disk
  across online servers
- website count + avg `uptime_pct_30d`, count with SSL expiring < 30d
- alert counts by severity where `resolved = false`

Response:
```
{ data: {
    servers: { online, degraded, offline, stopped, avg_cpu, avg_mem, avg_disk },
    websites: { total, avg_uptime, ssl_expiring_soon },
    alerts: { critical, warning, info },
  }, error: null }
```
`InfraOverviewTile` headline = online/total servers or open critical alerts.

Gated by `analytics:view` permission (same as other analytics routes).

### Projects — new `GET /api/analytics/pm?period=`
Workspace-wide rollup, aggregating the per-project logic across all non-deleted
projects the user can see:
- totals: projects (active), tasks total / done / overdue / open, completion_rate
- velocity trend: recent completed sprints across the workspace (last 8)
- workload: top assignees by open task count
Response:
```
{ data: {
    projects: { active },
    tasks: { total, done, overdue, open, completion_rate },
    velocity: [{ sprint_name, velocity, end_date }],
    workload: [{ user_id, name, total, done, overdue }],
  }, error: null }
```
`PmOverviewTile` headline = workspace completion_rate.

Both new routes mount on the existing analytics router under
`apps/api/src/routes/analytics.ts` (or split into `analytics-infra.ts` /
`analytics-pm.ts` for file-size hygiene — see Components).

## Components (files)

**Backend**
- `apps/api/src/lib/builtin-sections.ts` — `BUILTIN_ANALYTICS_SECTIONS` + gate helper.
- `apps/api/src/routes/hub-sections.ts` — extend resolver to merge builtin sections.
- `apps/api/src/routes/analytics.ts` — add `infra` + `pm` handlers, or extract to
  `analytics-infra.ts` / `analytics-pm.ts` if `analytics.ts` grows past ~300 lines.
- `packages/plugin-types/src/index.ts` — add `analytics` to `SLOT_CATALOG`; add
  `requires_module?` to the section def used by the builtin registry (plugin
  `PluginSectionDef` unchanged unless we choose to expose it there too — default: keep
  it host-only).

**Frontend**
- `apps/web/modules/analytics/pages/page.tsx` — rewrite as slot outlet (overview +
  panels), keep the period toggle and CSV/context-menu affordances.
- `apps/web/modules/analytics/sections/CrmAnalyticsSection.tsx` + `CrmOverviewTile.tsx`
  — wrap existing components.
- `apps/web/modules/analytics/sections/InfraAnalyticsSection.tsx` +
  `InfraOverviewTile.tsx` — new.
- `apps/web/modules/analytics/sections/PmAnalyticsSection.tsx` + `PmOverviewTile.tsx`
  — new.
- `apps/web/modules/analytics/lib/analytics.ts` — add `getInfra`, `getPm` fetchers +
  types.
- `apps/web/modules/analytics/sections/registry.ts` — client id → component map + the
  iframe fallback.

## Error handling & edge cases

- **No active sources.** If no section gate passes (all three modules off / no
  provider), the page shows an empty state ("No analytics sources enabled — enable a
  module to see analytics here"). `ModuleGuard moduleId="analytics"` still guards the
  route itself.
- **Partial data.** Each section fetches independently; one failing endpoint shows a
  per-section error card, others still render. Loading is per-section.
- **Permissions.** All analytics endpoints require `analytics:view`. A user without it
  is redirected by the existing guard; the section list request returns what they can
  see.
- **Workspace scoping.** Every new query filters by `workspace_id` per platform rule.
- **Soft deletes.** PM rollup excludes `status = 'DELETED'` projects; infra rollup uses
  live resource rows.

## Testing

- **Unit (api):** `builtin-sections` gate resolution — contract-active vs
  module-enabled vs neither. Infra + PM rollup query shape against a seeded workspace.
- **Resolver:** `GET /api/hub/sections/analytics` returns the right sections for
  module-enabled combinations (all on, infra off, crm provider swapped, none on).
- **Frontend:** page renders overview tiles + panels for the resolved list; empty state
  when the list is empty; unknown section id falls back to iframe path.
- Reuse existing analytics endpoint tests for CRM (unchanged).

## Out of scope

- New typed per-domain analytics contracts (explicitly rejected — section-slot chosen).
- Exposing analytics data *to* plugins (plugins can render analytics UI via the iframe
  path today; a data contract for analytics is a later step if needed).
- Cross-source correlation / joined metrics (e.g. revenue-per-server). Each section is
  independent.
- Scheduled/exported analytics, email digests.

## Migration / rollout

- No DB migration required — new endpoints read existing tables; section registry is
  code-only. `workspace_modules` already tracks enabled state.
- Run `graphify update .` after implementation (new routes + components).
