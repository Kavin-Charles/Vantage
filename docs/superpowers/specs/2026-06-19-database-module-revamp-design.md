# Database Module Revamp — Design Spec

**Date:** 2026-06-19  
**Branch:** `feat/database-module-revamp`  
**Impl plans:** 3 (foundation → UI → features)

---

## Overview

Full production-ready revamp of the Databases module. One feature branch, one spec, three sequenced implementation plans. Covers: data layer additions, new API endpoints, list page redesign with table/card toggle, detail page UI overhaul with animations, two new tabs (Alerts + Activities), SQL query history, connection string generator, and test-before-save in the add modal.

---

## 1. Data Layer

### New Migration: `infra_db_thresholds`

Per-database alert threshold overrides, following the same pattern as `server_thresholds`.

```
id:                   uuid PK
workspace_id:         uuid FK → workspaces
database_id:          uuid FK → infra_databases (nullable = workspace-default row)
connection_count_max: int nullable
replication_lag_s_max: float nullable
storage_gb_max:       float nullable
created_at:           timestamp
updated_at:           timestamp
```

- Row with `database_id = null` = workspace-level default.
- Row with `database_id` set = per-DB override.
- Effective threshold = per-DB override ?? workspace default ?? hardcoded fallback.

### New Migration: `infra_db_query_history`

Persisted SQL and Mongo query log, per user per database.

```
id:           uuid PK
workspace_id: uuid FK → workspaces
database_id:  uuid FK → infra_databases
user_id:      uuid FK → users
engine:       enum (postgres | mysql | redis | clickhouse | mongo | other)
query_text:   text
query_type:   enum (sql | mongo)
executed_at:  timestamp
row_count:    int nullable
duration_ms:  int nullable
```

Rolling 100-entry cap per `(database_id, user_id)` enforced on insert: delete oldest entries exceeding 100 before inserting new.

### Schema Changes

**`ActivityType` enum** — add four new values:
- `database_added`
- `database_removed`
- `database_settings_changed`
- `database_connection_tested`

**`DATABASES_MODULE`** definition — add:
```ts
emitsActivity: true,
emitsAlerts: true,
```

---

## 2. API Layer

All routes workspace-scoped via `requireWorkspace` middleware. Zod-validated inputs. Response shape: `{ data, error }`.

### Alerts (read-only — creation is worker-driven)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/databases/:id/alerts` | Filter `alerts` table: `resource_type='database' AND resource_id=:id`. Supports `?resolved=true/false`. |

Alert resolution uses the existing global `PATCH /api/alerts/:id/resolve`.

### Thresholds

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/databases/:id/thresholds` | Returns `{ effective, override, workspace_default }` |
| `PUT` | `/api/databases/:id/thresholds` | Set per-DB override. Body: `{ connection_count_max?, replication_lag_s_max?, storage_gb_max? }` |
| `DELETE` | `/api/databases/:id/thresholds` | Remove per-DB override, revert to workspace default |
| `GET` | `/api/databases/thresholds/defaults` | Get workspace-level defaults |
| `PUT` | `/api/databases/thresholds/defaults` | Set workspace-level defaults. Admin only. |

### Query History

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/databases/:id/query-history` | Last 100 entries for current user. Returns `{ id, query_text, query_type, executed_at, duration_ms, row_count }[]` |
| `DELETE` | `/api/databases/:id/query-history` | Clears current user's history for this database only. |

History is inserted automatically inside existing `/sql` and `/mongo-query` handlers on successful execution.

### Connection String

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/databases/:id/connection-string` | Returns engine-specific masked string. Postgres: `postgresql://user:****@host:5432/db`, Redis: `redis://:****@host:6379`, Mongo: `mongodb://user:****@host:27017/db`, etc. |
| `GET` | `/api/databases/:id/connection-string?reveal=true` | Admin only. Returns full unmasked string. 403 if non-admin. |

### Stateless Connection Test (for Add modal)

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/databases/test-connection` | Takes connection params directly (no DB record required). Body matches create schema. Returns `{ ok, latency_ms, message }`. |

### Activity Wiring (no new routes)

`logActivity` called inside existing handlers with `source_module_id: 'databases'`:

| Handler | Event type |
|---------|-----------|
| `POST /api/databases` | `database_added` |
| `DELETE /api/databases/:id` | `database_removed` |
| `PATCH /api/databases/:id` | `database_settings_changed` |
| `POST /api/databases/:id/test` | `database_connection_tested` |

Activities feed for the detail page uses existing `GET /api/activity?record_id=<db_id>`.

### Worker: `alert-eval.ts` Extension

Extend the existing alert evaluation job to check database thresholds:

1. Load all `infra_databases` per workspace (where `status != 'offline'`).
2. Load effective thresholds for each database (override → workspace default → hardcoded fallback: `connection_count_max=100`, `replication_lag_s_max=30`, `storage_gb_max=500`).
3. Evaluate:
   - `connection_count >= connection_count_max` → warning alert
   - `replication_lag_s >= replication_lag_s_max` → critical alert
   - `storage_gb >= storage_gb_max * 0.9` → warning; `>= storage_gb_max` → critical
4. Call `createAlert(db, { resourceType: 'database', resourceId, sourceModuleId: 'databases', ... })` — dedup handled by the service.

---

## 3. List Page Revamp

### Layout Toggle

Two view modes, persisted to `localStorage` key `databases-view-mode`:

**Table view** (default):
- Same 7 columns as today, but "Remove" button replaced by inline action icons on hover (eye to open, ellipsis to open context menu).
- Row fade-in on load: staggered `opacity 0→1` + `translateY 4px→0`, 150ms ease-out, 30ms delay per row.
- Skeleton loader: 3 placeholder rows (animated shimmer) while `isLoading`.
- Status column: pulse dot (CSS `@keyframes pulse`) — green for healthy, amber for degraded, red for offline — plus existing status badge.

**Card view**:
- 3-column responsive grid (`repeat(auto-fill, minmax(280px, 1fr))`).
- Each card:
  - Engine icon (colored SVG) + DB name in IBM Plex Serif
  - Host:port in IBM Plex Mono, muted
  - Status pulse dot + badge
  - Mini stat row: Storage · Connections · Replication lag
  - Right-click context menu works on cards.
- Card fade-in same staggered animation as table rows.

**Toggle button**: icon-only toggle in topbar action area (table icon / grid icon).

### Search & Filter Bar

Rendered between topbar and table/grid. Client-side filtering only (no additional API calls).

- **Text search**: filters on `name` + `host`, debounced 150ms.
- **Engine filter**: multi-select chip group (postgres / mysql / redis / clickhouse / mongo / other). All selected by default.
- **Status filter**: segmented control — All / Healthy / Degraded / Offline.

### Expanded Context Menu

| Item | Action |
|------|--------|
| Open database | Navigate to `/databases/:id` |
| — separator — | |
| Test connection | `POST /api/databases/:id/test` → toast result |
| Copy connection string | `GET /api/databases/:id/connection-string` → clipboard |
| Copy host | Copy `db.host` to clipboard |
| Copy name | Copy `db.name` to clipboard |
| Duplicate | Open add modal pre-filled with same engine/host/port/user (password blank) |
| — separator — | |
| View alerts | Navigate to `/databases/:id?tab=alerts` — detail page reads `searchParams.tab` on mount to set initial active tab |
| — separator — | |
| Remove database | Confirm dialog → delete |

---

## 4. Detail Page Revamp

### Header

```
← Databases                          (breadcrumb, IBM Plex Sans)
[Engine SVG icon]  prod-postgres      (IBM Plex Serif, 22px)
                   ● Healthy          (pulse dot + badge)
                   db.example.com:5432  (IBM Plex Mono, muted)
```

### Tab Bar

Tabs: **Overview · Tables · SQL · Alerts · Activities · Settings**  
(MongoDB: Overview · Collections · Query · Alerts · Activities · Settings)

Sliding underline indicator: `transform: translateX(Xpx)` transition, 200ms ease. Eliminates border-swap flash.

Tab content: `opacity 0→1` + `translateY 4px→0`, 150ms on tab switch.

### Overview Tab

Metric cards:
- Number counts up on mount: 0 → value, 400ms ease-out (using `requestAnimationFrame`).
- Trend arrow (↑↓ colored) if last two checks show degradation. Neutral dash if no trend data.
- 6 cards: Storage · Connections · Replication Lag · Memory · Clients · Uptime.
- Skeleton shimmer while loading.

Details table additions:
- **Connection string** row: masked value + copy icon (always) + eye icon (admin only → `?reveal=true`).

### Tables Tab

Replace dropdown selector with **sidebar + panel layout**:
- Left sidebar (200px): scrollable list of tables/collections. Clicking selects.
- Right panel: data grid with column type badges (`int8`, `text`, `bool`, `jsonb`) next to column names in IBM Plex Mono.
- Edit mode, pagination, no-PK warning — unchanged from current.

### SQL / Mongo Query Tab

Unchanged except for **query history drawer** (see Section 6).

---

## 5. Alerts Tab

Two-column layout: alert history (flexible) + threshold panel (300px fixed).

### Alert History

- Fetches `GET /api/databases/:id/alerts?resolved=false` on mount, refetches every 30s.
- Each row: severity badge (pulse dot for critical) + message + relative timestamp + Resolve button (admin/`databases:edit`).
- "Show resolved" toggle loads `?resolved=true` and appends with 0.5 opacity.
- Empty state: "No alerts for this database."

### Threshold Panel

Fields:
- Max connections (int, default 100)
- Max replication lag (float, seconds, default 30)
- Max storage GB (float, default 500)

Shows: `Using workspace default` or `Custom override active`.  
Buttons (admin only): **Save override** / **Reset to default**.  
Links to workspace-level defaults in Settings → Databases.

---

## 6. Activities Tab

- Fetches `GET /api/activity?record_id=<db_id>&limit=20&page=1`. (`record_id` is set to `database.id` by `logActivity` for all database events.)
- Each row: avatar initials (colored by user id hash) + user name (IBM Plex Sans) + action label + relative timestamp.
- Action labels:
  - `database_added` → "Added this database"
  - `database_removed` → "Removed this database"
  - `database_settings_changed` → "Updated settings"
  - `database_connection_tested` → "Tested connection — {ok/failed} in {Xms}"
  - `infra_alert` → "Alert fired: {message}"
- Load more button at bottom (page + 1).
- Empty state: "No activity recorded yet."

---

## 7. SQL Enhancements

### Query History Drawer

- Toggle button above editor: `History (N)` — slides down a panel (max-height 240px, scrollable).
- List: newest first, each row shows query text (truncated 80 chars in IBM Plex Mono) + timestamp + duration + row count.
- Click → fills editor textarea.
- `Clear history` button (clears current user's history for this DB via `DELETE /api/databases/:id/query-history`).
- Skeleton while loading, empty state: "No queries run yet."

### Test-Before-Save in Add Modal

- "Test connection" button in add modal.
- Calls `POST /api/databases/test-connection` with current form values.
- Shows inline result below button: `✓ Connected in 42ms` (green) or `✗ Connection refused` (red).
- "Add database" button remains enabled regardless of test result.

### Connection String (Overview Tab)

- Masked by default: `postgresql://user:****@host:5432/db`.
- Copy icon → copies current visible string.
- Eye icon (admin only) → fetches `?reveal=true`, shows for 10s then re-masks.

---

## 8. Module Hook Wiring

`DATABASES_MODULE` updated with `emitsActivity: true, emitsAlerts: true`.

Activity settings page (already built in the activity-alerts-modules PR) will auto-discover the databases module and show toggles for it.

Alert bar (`AlertBar.tsx`) already polls globally — database alerts with `resource_type='database'` appear automatically once the worker fires them.

---

## Implementation Plans (3)

### Plan 1 — Foundation
- DB migrations: `infra_db_thresholds`, `infra_db_query_history`
- `ActivityType` enum additions
- `DATABASES_MODULE` flags
- All new API routes (alerts, thresholds, query history, connection string, stateless test)
- `logActivity` wiring in existing CRUD handlers
- Worker `alert-eval.ts` database threshold evaluation

### Plan 2 — UI Revamp
- List page: table/card toggle, search/filter, skeleton loaders, row animations, status pulse dots, expanded context menu
- Detail page: new header layout, sliding tab indicator, tab transition animations, overview metric count-up + trend arrows, tables sidebar layout

### Plan 3 — New Features
- Alerts tab (alert history + threshold panel)
- Activities tab
- SQL query history drawer
- Test-before-save in add modal
- Connection string generator (Overview tab)
- `DELETE /api/databases/:id/query-history` endpoint

---

## Constraints

- IBM Plex Sans (UI) / IBM Plex Mono (code) / IBM Plex Serif (display) — globally in place.
- CSS custom properties only: `--bg`, `--surface`, `--surface2`, `--border`, `--text`, `--text2`, `--text3`, status colors.
- Kysely query builder — no raw SQL strings.
- Zod validation on all new API inputs.
- No `any` types, no `console.log` in prod paths.
- Workspace scoping on every DB query (`where workspace_id = req.workspace.id`).
- Feature branch: `feat/database-module-revamp`. Never commit to `main` directly.
