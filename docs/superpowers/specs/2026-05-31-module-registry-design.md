# Module Registry — Design Spec

**Date:** 2026-05-31
**Status:** Approved

---

## Overview

Vantage is refactored into a two-tier architecture:

- **Module Registry** — first-party, trusted, free. Eight built-in feature modules workspace admins can enable/disable. No sandboxing. Code runs in-process.
- **Plugin Runtime** — third-party, sandboxed V8 isolates (see `2026-05-31-plugin-runtime-design.md`). Paid or free plugins from the marketplace.

**Core (always on, never toggleable):** auth, workspace, billing.

---

## Free Modules (8)

| Module ID | Owns | Default |
|---|---|---|
| `contacts` | Contacts CRUD, contact detail, activity per contact | ✅ enabled |
| `companies` | Companies CRUD, company detail | ✅ enabled |
| `pipelines` | Deals pipeline, pipeline views, items, item groups, conversions, record types | ✅ enabled |
| `tasks` | Tasks CRUD, task lists, due dates | ✅ enabled |
| `websites` | Website uptime monitoring, response times, SSL expiry | ✅ enabled |
| `servers` | Server monitoring, agent heartbeats, metrics | ✅ enabled |
| `analytics` | Revenue, pipeline stats, team leaderboard | ✅ enabled |
| `activity` | Unified activity feed across all workspace records | ✅ enabled |

Everything else (mail, calendar, infra databases, alerts, etc.) is a **plugin** — distributed via the marketplace.

---

## Module Manifest

Each module is a TypeScript manifest object. All manifests are collected in a central registry.

```typescript
interface ModuleManifest {
  id: string
  name: string
  description: string
  icon: string            // lucide icon name
  defaultEnabled: boolean
  nav: {
    label: string
    path: string
    icon: string
  }[]
  apiPrefixes: string[]   // route prefixes owned by this module
  workers: string[]       // background worker IDs this module runs
}
```

Example:

```typescript
export const PIPELINES_MODULE: ModuleManifest = {
  id: 'pipelines',
  name: 'Pipelines',
  description: 'Deals pipeline, pipeline views, items, and conversions.',
  icon: 'Kanban',
  defaultEnabled: true,
  nav: [
    { label: 'Pipeline', path: '/pipeline', icon: 'Kanban' },
    { label: 'Items', path: '/items', icon: 'Package' },
  ],
  apiPrefixes: ['/deals', '/pipelines', '/items', '/item-groups', '/conversions', '/record-types'],
  workers: [],
}
```

Registry file: `apps/api/src/modules/registry.ts` — exports `MODULE_REGISTRY: ModuleManifest[]`.

---

## DB Schema

```sql
workspace_modules
  id           uuid PK
  workspace_id uuid FK → workspaces
  module_id    string    -- matches ModuleManifest.id
  enabled      boolean default true
  updated_at   timestamp
  updated_by   uuid FK → users
  UNIQUE(workspace_id, module_id)
```

On workspace creation → seed all 8 rows with `enabled = true`.

---

## Backend Gating

### Middleware

`requireModule(moduleId: string)` — Express middleware:
1. Reads `workspace_id` from `req.workspace`
2. Checks Redis cache (`module:{workspaceId}:{moduleId}`) — TTL 60s
3. Cache miss → query `workspace_modules` table, populate cache
4. Module disabled → `403 { error: { code: 'MODULE_DISABLED', message: '...' } }`

### Route Ownership

One `requireModule` guard at the router level per route file:

| Route file | Module guard |
|---|---|
| `contacts.ts` | `requireModule('contacts')` |
| `companies.ts` | `requireModule('companies')` |
| `deals.ts`, `pipelines.ts`, `items.ts`, `item-groups.ts`, `conversions.ts`, `record-types.ts` | `requireModule('pipelines')` |
| `tasks.ts` | `requireModule('tasks')` |
| `websites.ts` | `requireModule('websites')` |
| `agent.ts` | `requireModule('servers')` |
| `analytics.ts` | `requireModule('analytics')` |
| `activity.ts` | `requireModule('activity')` |

### New Endpoints

```
GET   /api/workspace/modules              List all modules with enabled status
PATCH /api/workspace/modules/:moduleId    Toggle enabled (admin only)
```

### Workers

Each worker checks `isModuleEnabled(workspaceId, moduleId)` before executing per workspace. Disabled workspace → skip silently.

---

## Frontend Gating

### Module Context

`ModuleProvider` wraps the root layout. Fetches `GET /api/workspace/modules` once on load.

```typescript
const { isEnabled } = useModules()
isEnabled('servers') // → boolean
```

### Sidebar

Rendered dynamically from enabled modules' `nav` arrays. Disabled module → nav item hidden automatically.

### Page Guard

`ModuleGuard` wraps each module's root page:

```typescript
<ModuleGuard moduleId="contacts">
  <ContactsPage />
</ModuleGuard>
```

Disabled → redirect to `/dashboard` with toast: *"Contacts module is disabled."*

### Settings Page

`/settings/modules` — admin only:
- Lists all 8 modules: name, description, icon, toggle switch
- `PATCH /api/workspace/modules/:moduleId` on toggle
- Optimistic UI update

---

## Migration Strategy

No rewrites. All changes additive.

### Order

```
1. DB migration: create workspace_modules table
2. Seed script: insert 8 rows (enabled=true) for every existing workspace
3. Backend: add requireModule() middleware to each route file
4. Backend: add GET + PATCH /api/workspace/modules endpoints
5. Backend: Redis cache layer for module status
6. Frontend: ModuleProvider + useModules hook
7. Frontend: refactor sidebar to render from module nav config
8. Frontend: add ModuleGuard to each module's root page
9. Frontend: /settings/modules settings page
```

Routes without `requireModule` keep working unchanged until wired up — no risk of breakage during migration.
