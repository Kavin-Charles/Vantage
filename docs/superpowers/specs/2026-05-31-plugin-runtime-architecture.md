# Plugin Runtime Architecture

**Date:** 2026-05-31
**Status:** Approved
**Builds on:** `2026-05-31-plugin-runtime-design.md`

---

## Scope

Implement the plugin runtime from the existing spec. Convert the 6 non-module features (Calendar, Alerts, Deployments, Databases, Files, Mail) to first-party plugins. Module system (8 modules) stays unchanged.

**Phase 1:** Runtime + SDK + Calendar plugin  
**Phase 2:** Alerts + Deployments  
**Phase 3:** Databases + Files + Mail

---

## Repo Split

| Repo | Purpose |
|---|---|
| `Kavin-Charles/vantage-types` | Shared TS types: manifest, permissions, bridge protocol |
| `Kavin-Charles/vantage-plugin-sdk` | `@vantage/plugin-sdk` backend + frontend SDK |
| `Kavin-Charles/vantage-runtime` | V8 isolate runtime service (Node.js + isolated-vm) |
| `Kavin-Charles/vantage-platform` | Marketplace + developer portal (future) |
| `Kavin-Charles/Vantage` | Main app: DB migrations, API bridge, web iframe renderer |
| per-plugin repos | Each first-party plugin (calendar, alerts, etc.) in own repo |

---

## Architecture

```
Plugin iframe (from R2 CDN)
  → postMessage (SDK bridge call)
  → PluginIframe component (Next.js host)
  → POST /api/plugins/[pluginId]/bridge
  → Bridge handler in apps/api (Kysely → Postgres)
  → postMessage response back to iframe

Event hook (e.g. contact.created):
  → Main API fires event
  → POST http://plugin-runtime/internal/plugins/[pluginId]/invoke
  → IsolatePool wakes isolate
  → Isolate calls __bridge__ → host bridge → Postgres
  → Returns result
```

**Two data paths:**
- **Frontend SDK calls** → handled directly by main API bridge routes (no isolate)
- **Backend hook execution** → plugin runtime isolate

---

## What Lives Where (this repo)

```
packages/db/
  migrations/20260531_004_plugin_runtime.ts   ← 4 new tables
  src/schema.ts                               ← add 4 table types

apps/api/src/
  plugins/
    registry.ts       ← CRUD for plugins, versions, installs
    bridge-router.ts  ← /api/plugins/:id/bridge dispatcher
    bridge/
      calendar.ts     ← calendar bridge impl (Kysely)
  routes/
    plugins.ts        ← GET /api/plugins, POST /api/plugins/install, etc.

apps/web/
  components/plugins/
    PluginIframe.tsx  ← sandboxed iframe + postMessage bridge
    PluginPage.tsx    ← renders PluginIframe at page level
  app/(dashboard)/settings/plugins/page.tsx  ← installed plugins UI
  app/(dashboard)/calendar/page.tsx          ← replaced with <PluginPage>
```

---

## DB Tables (4 new)

From `2026-05-31-plugin-runtime-design.md` — unchanged:
- `plugins` — registry
- `plugin_versions` — versioned bundles
- `plugin_installs` — per workspace, enable/disable
- `plugin_storage` — isolated KV per plugin+workspace

First-party plugins are pre-seeded into `plugins` + `plugin_versions` at deploy time. They are auto-installed for all new workspaces via `plugin_installs` on workspace creation.

---

## First-party Plugin Model

- `trust_level: 'builtin'` in manifest — granted broader bridge access
- Pre-installed for all workspaces (seeded, not user-installed)
- Can be enabled/disabled per workspace via `plugin_installs.enabled`
- Backend bundle is minimal for data-driven plugins (Calendar has no hooks)
- Frontend bundle: standalone React app served from R2, rendered via `<PluginIframe>`

---

## Bridge API (Phase 1)

```
contacts.list(filter)
contacts.update(id, data)
deals.get(id)
activity.log(entry)
storage.get(key)
storage.set(key, value)
http.fetch(url, options)        ← third-party only, declared domains
calendar.getEvents(filter)
calendar.createEvent(data)
calendar.updateEvent(id, data)
calendar.deleteEvent(id)
```

Phases 2+3 add: `alerts.*`, `deployments.*`, `databases.*`, `files.*`, `mail.*`

---

## postMessage Protocol

```typescript
// Plugin → Host
{ type: 'sdk:calendar.getEvents', requestId: 'r1', payload: { start, end } }
{ type: 'sdk:navigate', requestId: 'r2', payload: { path: '/contacts/123' } }

// Host → Plugin
{ type: 'sdk:response', requestId: 'r1', data: [...events] }
{ type: 'sdk:event', event: 'contact.selected', payload: { id } }
```

---

## Calendar Page Migration

`apps/web/app/(dashboard)/calendar/page.tsx` → `<PluginPage pluginId="com.vantage.calendar" />`

The existing calendar components (`apps/web/components/calendar/*`) and API route (`/api/calendar/events`) remain — the calendar plugin frontend (separate repo) calls the bridge endpoint, which proxies to the same Kysely queries.
