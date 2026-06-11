# Module Dashboard Widgets — Design Spec

**Date:** 2026-06-10
**Scope:** Dashboard widgets for Contacts, Pipeline, and Servers modules

---

## Overview

Add three built-in dashboard widgets so users can pin module summaries to any dashboard. Widgets appear in the "Add Widget" panel alongside plugin-registered widgets.

---

## Architecture

### Registration

New file `apps/web/modules/shared/lib/register-module-widgets.ts` calls `registerDashboardWidget()` once for each widget. This file is imported (side-effect) inside `apps/web/modules/shared/components/Providers.tsx`.

No new context, no new provider. Pure registry side-effect.

### Widget files

```
apps/web/modules/contacts/components/ContactsWidget.tsx
apps/web/modules/pipeline/components/PipelineWidget.tsx
apps/web/modules/servers/components/ServersWidget.tsx
```

Each widget:
- `'use client'` component
- Fetches own data via `useApiToken` + `useQuery` (TanStack Query)
- Uses existing lib functions from its module
- Renders with design tokens from CLAUDE.md
- Checks `useModules().isEnabled(moduleId)` — returns null silently if module disabled (no redirect)

---

## Widget Specs

### ContactsWidget

| Property | Value |
|---|---|
| id | `core:contacts` |
| label | `Contacts` |
| description | `Recent contacts and status overview` |
| defaultW | 4 |
| defaultH | 3 |
| minW | 3 |
| minH | 2 |
| moduleId | `contacts` |

**Layout:**
- Stat header: total count (from API pagination total) · prospect count · customer count
- List: 5 most recent contacts — name, status badge (colour-coded), company name
- Title "Contacts →" links to `/contacts`; no individual row clicks
- API: `listContacts({ limit: 5 })`

---

### PipelineWidget

| Property | Value |
|---|---|
| id | `core:pipeline` |
| label | `Pipeline` |
| description | `Recent records across your pipeline` |
| defaultW | 6 |
| defaultH | 3 |
| minW | 4 |
| minH | 3 |
| moduleId | `pipelines` |

**Layout:**
- Stat header: record count in first pipeline · stage with most records
- List: 5 most recent records — name, stage badge, pipeline name
- Row click → `/pipeline/[pipelineId]`
- API: `listPipelines()` → pick first pipeline → `listRecords({ pipeline_id, per_page: 5 })`

---

### ServersWidget

| Property | Value |
|---|---|
| id | `core:servers` |
| label | `Servers` |
| description | `Server status and resource usage` |
| defaultW | 4 |
| defaultH | 3 |
| minW | 3 |
| minH | 2 |
| moduleId | `servers` |

**Layout:**
- Stat header: N online (green) · N degraded (amber) · N offline (red)
- List: up to 5 servers — name, status dot, CPU%, mem%
- Row click → `/servers/[id]`
- API: `listServers()`

---

## Data Flow

### Query keys

```ts
['widget', 'contacts']
['widget', 'pipelines']
['widget', 'records', pipelineId]
['widget', 'servers']
```

Prefixed with `widget` to avoid cache collisions with module query keys.

### Stale time

60 seconds — dashboard widgets are snapshots, not live feeds.

---

## States

| State | Treatment |
|---|---|
| Loading | Two grey shimmer bars using `--surface2` |
| Error | Inline "Failed to load" + retry button; no toast |
| Empty | Muted text + link to creation page for that module |
| Module disabled | `useModules().isEnabled()` returns false → component returns null |

---

## Files Changed

| File | Change |
|---|---|
| `modules/contacts/components/ContactsWidget.tsx` | New |
| `modules/pipeline/components/PipelineWidget.tsx` | New |
| `modules/servers/components/ServersWidget.tsx` | New |
| `modules/shared/lib/register-module-widgets.ts` | New |
| `modules/shared/components/Providers.tsx` | Import `register-module-widgets` |

---

## Out of Scope

- Activity, Alerts, Analytics widgets (not requested)
- Widget settings / configuration per instance
- Real-time data (polling, websockets)
- Unit tests (thin presentational layer over tested APIs)
