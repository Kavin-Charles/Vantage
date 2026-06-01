# Plugin Runtime — Design Spec

**Date:** 2026-05-31
**Status:** Approved

---

## Overview

Vantage Plugin Runtime is an open platform allowing third-party developers to build, publish, and sell plugins that extend Vantage workspaces. Plugins can add UI surfaces, custom backend logic, data access, and external integrations. Plugin code runs sandboxed on Vantage infrastructure via V8 isolates.

---

## Domains & Infrastructure

| URL | Purpose | Infra |
|---|---|---|
| `vantage.dev` | Marketing / onboarding | Vercel |
| `<white-label.com>` | Vantage app | Vercel |
| `market.vantage.dev` | Marketplace, developer portal, admin | Vercel (new Next.js app) |
| `plugin-cdn.vantage.dev` | Plugin frontend bundle CDN | Cloudflare R2 (free tier) |

**New deployable services:**
1. **Plugin Runtime Service** — Node.js + `isolated-vm`, deployed separately from main backend (crash/memory isolation)
2. **market.vantage.dev** — new Next.js app (marketplace + developer portal + admin)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Vantage Host                      │
│                                                     │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────┐ │
│  │Marketplace│   │Plugin Runtime│   │  Plugin SDK │ │
│  │(Next.js)  │   │(isolated-vm) │   │  (npm pkg)  │ │
│  └──────────┘   └──────┬───────┘   └─────────────┘ │
│                        │                            │
│         ┌──────────────┴──────────────┐             │
│         │    Per-workspace Isolates   │             │
│         │  ┌─────────┐ ┌─────────┐   │             │
│         │  │Plugin A │ │Plugin B │   │             │
│         │  │Isolate  │ │Isolate  │   │             │
│         │  └─────────┘ └─────────┘   │             │
│         └─────────────────────────── ┘             │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  Frontend: Plugin iframes (sandboxed + CSP)  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## Plugin Manifest (`plugin.json`)

Technical metadata only. Pricing is configured in the developer portal.

```json
{
  "id": "com.acme.crm-enricher",
  "name": "CRM Enricher",
  "version": "1.2.0",
  "description": "Enrich contact profiles with company data.",
  "author": { "name": "Acme Inc", "email": "dev@acme.com" },
  "permissions": [
    "contacts:read",
    "contacts:write",
    "deals:read",
    "http:api.clearbit.com"
  ],
  "entrypoints": {
    "backend": "dist/backend.js",
    "frontend": "dist/frontend.js"
  },
  "hooks": ["contact.created", "contact.updated"],
  "ui": {
    "sidebar": true,
    "pages": ["/enricher"],
    "widgets": ["contact-detail"]
  }
}
```

### Permission Scopes

| Scope | What it allows |
|---|---|
| `contacts:read/write` | Read or mutate contacts |
| `deals:read/write` | Read or mutate deals |
| `companies:read/write` | Read or mutate companies |
| `activity:write` | Log activity entries |
| `storage:read/write` | Plugin's own isolated KV store |
| `http:<domain>` | Outbound HTTP to specific domain only |

- On install, user sees permission consent screen (OAuth-style)
- SDK enforces scopes at runtime → throws `PermissionError` if plugin calls beyond declared scope
- `http:*` wildcard is blocked — devs must declare exact domains

---

## Backend Plugin Runtime (V8 Isolates)

Plugin bundles run in dedicated V8 isolates via `isolated-vm`. One isolate per plugin per workspace.

### Lifecycle

```
Install   → bundle stored in R2
Activate  → isolate created, bundle compiled once (cached)
Event     → isolate receives message, handler executes, returns result
Idle 5min → isolate suspended (memory freed)
Resume    → isolate rehydrated from compiled bundle (~5ms cold start)
```

### Host Bridge (injected into isolate)

```typescript
vantage.contacts.list(filter)      // requires contacts:read
vantage.contacts.update(id, data)  // requires contacts:write
vantage.deals.get(id)              // requires deals:read
vantage.activity.log(entry)        // requires activity:write
vantage.storage.get(key)           // namespaced KV, isolated per plugin
vantage.storage.set(key, value)    // namespaced KV
vantage.http.fetch(url, options)   // requires http:<domain>
```

### Hard Limits

- No Node.js APIs (`fs`, `net`, `child_process`, etc.)
- No cross-workspace data access
- No access to other plugins' storage
- No HTTP calls to undeclared domains
- Memory limit: 128MB → hard kill
- Execution timeout: 30s → hard kill

### Plugin Dev Experience

```typescript
import { vantage } from '@vantage/plugin-sdk'

vantage.on('contact.created', async (contact) => {
  const enriched = await vantage.http.fetch('api.clearbit.com/v2/...')
  await vantage.contacts.update(contact.id, { company: enriched.company })
})
```

Plugin code is TypeScript, compiled to a single bundle via esbuild before upload.

---

## Frontend Plugin System (iframes)

Frontend plugins are served from `plugin-cdn.vantage.dev` (R2) and rendered in sandboxed iframes.

### Iframe Setup

```html
<iframe
  src="https://plugin-cdn.vantage.dev/{pluginId}/index.html"
  sandbox="allow-scripts allow-forms"
  csp="default-src 'self'; script-src 'self'"
/>
```

No `allow-same-origin` — iframe cannot access host DOM or localStorage.

### postMessage Protocol

```typescript
// Plugin → Host
{ type: 'sdk:contacts:list', requestId: 'r1', payload: { filter } }
{ type: 'sdk:navigate',      requestId: 'r2', payload: { path: '/contacts/123' } }
{ type: 'sdk:modal:open',    requestId: 'r3', payload: { title, content } }

// Host → Plugin
{ type: 'sdk:response', requestId: 'r1', data: [...contacts] }
{ type: 'sdk:event',    event: 'contact.selected', payload: { id } }
```

### UI Extension Points

| Extension point | Description |
|---|---|
| `sidebar` | Adds nav item, loads plugin page in main area |
| `pages` | Custom full-page routes at `/app/plugins/{id}/...` |
| `widgets.contact-detail` | Panel on contact detail page |
| `widgets.deal-detail` | Panel on deal detail page |
| `widgets.dashboard` | Dashboard widget card |

### Frontend SDK

```typescript
import { vantage } from '@vantage/plugin-sdk/frontend'

const contacts = await vantage.contacts.list()
vantage.navigate('/contacts/123')
vantage.modal.open({ title: 'Enrich', content: <MyForm /> })
vantage.on('contact.selected', (contact) => { ... })
```

---

## Plugin Browser (in-app)

White-label workspaces live on custom domains (e.g. `<white-label.com>`). Cross-domain redirects to `market.vantage.dev` for installation would require complex cross-domain auth. Instead, **installation happens entirely within the Vantage app.**

The main Vantage app has a built-in **Plugin Browser** page (Settings → Plugins → Browse):
- Calls `GET /api/marketplace/plugins` → Vantage backend proxies the marketplace catalog
- Shows plugin listings, screenshots, pricing, ratings inline
- Install button → permission consent screen → `POST /api/plugins/install` (server-side)
- No redirect to `market.vantage.dev` needed

**Install flow:**
```
Workspace admin (in white-label app)
  → Settings → Plugins → Browse
  → Catalog fetched via GET /api/marketplace/plugins
  → Clicks Install → permission consent screen
  → POST /api/plugins/install { pluginId }
  → Backend: charge Stripe, create plugin_installs row, activate isolate
  → Plugin active in workspace immediately
```

`market.vantage.dev` is for public discovery (SEO, dev landing pages), developer portal, and admin review only — not for workspace-level installation.

---

## Marketplace & Developer Portal (`market.vantage.dev`)

### Marketplace (public discovery)
- Browse/search plugins by category (CRM, Infra, Integrations, Messaging, Analytics, Other)
- Plugin listing: name, description, screenshots, pricing, ratings, install count
- Public-facing only — installation happens via the in-app Plugin Browser

### In-App Plugin Management (main Vantage app)
- Settings → Plugins: list installed plugins, enable/disable, uninstall
- `GET /api/marketplace/plugins` — catalog proxy endpoint on main backend
- `POST /api/plugins/install` — install + charge Stripe
- `DELETE /api/plugins/:id` — uninstall + cancel subscription
- Billing via Stripe (one-time or subscription, per developer's choice)

### Developer Portal (`market.vantage.dev/developer`)
- Create/edit plugin listing (name, description, screenshots, category)
- Set pricing: free / one-time / subscription (month or year)
- Upload versioned bundles (zip: `plugin.json` + `dist/`)
- View review status with feedback
- Analytics: installs, active workspaces, revenue, uninstalls
- Payouts via Stripe Connect (Vantage takes 20% cut)

### Admin Panel (`market.vantage.dev/admin`)
- Review queue: pending submissions
- Automated checks: manifest valid, bundle < 5MB, no obvious malicious patterns
- Manual approve / reject with feedback
- Suspend listed plugins (security incidents)

### Plugin States

```
draft → submitted → approved → listed
                 → rejected  (feedback sent to dev)
listed → deprecated (dev withdraws)
listed → suspended  (Vantage action)
```

---

## Data Models

```sql
-- Plugin registry
plugins
  id              uuid PK
  slug            string unique       -- com.acme.crm-enricher
  name            string
  description     text
  author_id       uuid FK → users
  category        enum (crm, infra, integrations, messaging, analytics, other)
  status          enum (draft, submitted, approved, listed, deprecated, suspended)
  current_version string
  install_count   int default 0
  created_at      timestamp
  updated_at      timestamp

-- Versioned bundles
plugin_versions
  id              uuid PK
  plugin_id       uuid FK → plugins
  version         string              -- semver
  bundle_r2_key   string              -- backend.js path in R2
  frontend_r2_key string (nullable)   -- frontend bundle path in R2
  manifest        jsonb               -- plugin.json contents
  status          enum (pending, approved, rejected)
  review_notes    text (nullable)
  created_at      timestamp

-- Per-workspace installs
plugin_installs
  id                     uuid PK
  plugin_id              uuid FK → plugins
  workspace_id           uuid FK → workspaces
  version_id             uuid FK → plugin_versions
  enabled                boolean default true
  granted_permissions    jsonb       -- approved permission scopes
  stripe_subscription_id string (nullable)
  installed_by           uuid FK → users
  installed_at           timestamp

-- Isolated KV storage per plugin per workspace
plugin_storage
  id           uuid PK
  plugin_id    uuid FK → plugins
  workspace_id uuid FK → workspaces
  key          string
  value        jsonb
  updated_at   timestamp
  UNIQUE(plugin_id, workspace_id, key)
```

---

## SDK Package

Two npm packages published by Vantage:

- `@vantage/plugin-sdk` — backend SDK (runs inside isolate)
- `@vantage/plugin-sdk/frontend` — frontend SDK (runs inside iframe, postMessage bridge)

Devs build with TypeScript, bundle with esbuild, upload zip to developer portal.
