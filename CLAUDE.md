# Vencore — Project Brief

## Codebase Navigation — graphify

A knowledge graph of this codebase lives at `graphify-out/graph.json`. **Always query it before reading files.**

- Any question about architecture, data flow, file relationships, or "where is X" → run `/graphify query "<question>"` first
- Do not `Read` or `Grep` across the codebase when the graph can answer it
- To rebuild after major changes: `/graphify . --update`
- Graph outputs: `graphify-out/graph.html` (visual), `graphify-out/GRAPH_REPORT.md` (audit)

**After every significant change** (new routes, new components, schema migrations, new packages, refactors): run `Update Graphify` before ending the session. A "significant change" is any PR or feature branch that adds/removes/renames files or introduces new cross-file relationships.

## What is Vencore?

Vencore is a modular white-label company management platform. Companies deploy it under their own brand and configure only the modules their teams need — covering every department: sales (CRM), engineering (infra monitoring), HR, management, and more. The platform is fully brandable; end users see the customer's name and logo, not Vencore.

**Tagline:** One Platform to Run Your Entire Business

**Target user:** Companies that want to offer their teams a unified operations platform under their own brand — replacing fragmented SaaS stacks with a single white-labelled solution.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js (App Router) | TypeScript. Tailwind CSS. |
| Backend | Node.js + Express | TypeScript. REST API. |
| Primary DB | PostgreSQL | All CRM + user data. |
| Metrics DB | TimescaleDB | Infra metrics, time-series data. |
| Cache | Redis | Sessions, caching, queues. |
| Object storage | S3-compatible (Cloudflare R2) | File storage. |
| Auth | Custom JWT | bcrypt + jsonwebtoken. Multi-tenant workspace auth. |
| Monitoring agent | Lightweight Node.js daemon | Installed on customer servers. Phones home metrics via HTTPS. |
| Hosting | GCP VM (`vencore-platform`, asia-south1-c) | Docker Compose prod. |

---

## Design System

The UI reference folder is `_design` in the project root. **Match it exactly.** Do not invent new components or deviate from the established patterns.

Key design tokens:
- `--bg: #f7f6f2` — warm off-white page background
- `--surface: #ffffff` — card/panel surfaces
- `--surface2: #f0ede6` — secondary surfaces, hover states
- `--border: #e4e0d8` — default borders
- `--text: #1a1814` — primary text
- `--text2: #6b665c` — secondary text
- `--text3: #9e998f` — muted/label text
- `--green: #2d6a4f` / `--green-bg: #d8f3dc`
- `--amber: #92400e` / `--amber-bg: #fef3c7`
- `--red: #991b1b` / `--red-bg: #fee2e2`
- `--blue: #1e3a8a` / `--blue-bg: #dbeafe`

Fonts: `Instrument Serif` (display, numbers, names) + `DM Sans` (UI, body).

Sidebar width: `220px`. Topbar height: `56px`.

---

---

## Data Models

### Workspace
```
id: uuid PK
name: string
domain: string
created_at: timestamp
updated_at: timestamp
```

### User
```
id: uuid PK
workspace_id: uuid FK → workspace
clerk_user_id: string (unique)
name: string
email: string
role: enum (admin, member)
last_login_at: timestamp
created_at: timestamp
```

### Contact
```
id: uuid PK
workspace_id: uuid FK → workspace
company_id: uuid FK → company (nullable)
owner_id: uuid FK → user
name: string
email: string
phone: string (nullable)
status: enum (prospect, customer, cold, churned)
last_contacted_at: timestamp (nullable)
created_at: timestamp
updated_at: timestamp
```

### Company
```
id: uuid PK
workspace_id: uuid FK → workspace
name: string
industry: string (nullable)
location: string (nullable)
employee_count: int (nullable)
website: string (nullable)
created_at: timestamp
updated_at: timestamp
```

### Deal
```
id: uuid PK
workspace_id: uuid FK → workspace
contact_id: uuid FK → contact (nullable)
company_id: uuid FK → company (nullable)
owner_id: uuid FK → user
name: string
value: decimal(12,2)
stage: enum (lead, qualifying, proposal, closing, won, lost)
probability: int (0–100)
close_date: date (nullable)
created_at: timestamp
updated_at: timestamp
```

### Task
```
id: uuid PK
workspace_id: uuid FK → workspace
assignee_id: uuid FK → user
contact_id: uuid FK → contact (nullable)
deal_id: uuid FK → deal (nullable)
title: string
due_date: date (nullable)
status: enum (todo, done)
created_at: timestamp
updated_at: timestamp
```

### Activity
```
id: uuid PK
workspace_id: uuid FK → workspace
user_id: uuid FK → user
contact_id: uuid FK → contact (nullable)
deal_id: uuid FK → deal (nullable)
type: enum (email, call, note, meeting, deal_change, infra_alert)
body: text (nullable)
meta: jsonb (nullable) — stores extra context per type
created_at: timestamp
```

### Server
```
id: uuid PK
workspace_id: uuid FK → workspace
name: string
region: string (nullable)
ip_address: string (nullable)
agent_token: string (unique) — used by monitoring agent to authenticate
cpu_pct: float (nullable)
mem_pct: float (nullable)
disk_pct: float (nullable)
uptime_seconds: bigint (nullable)
status: enum (online, degraded, offline, stopped)
last_ping_at: timestamp (nullable)
created_at: timestamp
updated_at: timestamp
```

### Database (infra)
```
id: uuid PK
workspace_id: uuid FK → workspace
name: string
engine: enum (postgres, mysql, redis, clickhouse, mongo, other)
version: string (nullable)
host: string (nullable)
port: int (nullable)
storage_gb: float (nullable)
connection_count: int (nullable)
replication_lag_s: float (nullable)
status: enum (healthy, degraded, offline)
last_checked_at: timestamp (nullable)
created_at: timestamp
updated_at: timestamp
```

### Website
```
id: uuid PK
workspace_id: uuid FK → workspace
url: string
label: string (nullable)
host: string (nullable)
response_ms: int (nullable)
uptime_pct_30d: float (nullable)
ssl_expiry_date: date (nullable)
status: enum (online, degraded, offline)
last_checked_at: timestamp (nullable)
created_at: timestamp
updated_at: timestamp
```

### Alert
```
id: uuid PK
workspace_id: uuid FK → workspace
resource_type: enum (server, database, website, crm)
resource_id: uuid (nullable)
severity: enum (critical, warning, info)
message: string
acknowledged: boolean default false
acknowledged_by: uuid FK → user (nullable)
resolved: boolean default false
resolved_at: timestamp (nullable)
created_at: timestamp
```

---

## Current State & Priorities

### Done (web, api, worker, agent all working)
- Auth & workspaces (custom JWT, multi-tenant, roles)
- CRM core (contacts, companies, deals pipeline, tasks, activity)
- Infra monitoring (server agent, dashboards, website uptime, alerts)
- White-label branding per workspace

### Now — Polish for web prod
- Minor features and UX polish across existing modules
- Bug fixes and edge cases
- Production hardening

### Next — After web prod
- Analytics (revenue by period, win rate, pipeline by stage, rep leaderboard)
- Integrations (Gmail, Zapier webhooks, CSV import/export)
- Public REST API with API key auth and webhook delivery
- Mobile app (React Native — mirrors web feature set)

---

## Key Architecture Decisions

- **Multi-tenant by workspace_id.** Every query must be scoped to `workspace_id`. Never return data across workspaces. Apply this as middleware on all API routes.
- **Soft deletes.** Add `deleted_at: timestamp` to Contact, Company, Deal. Never hard delete CRM records.
- **Infra agent is pull-based.** The agent on customer servers sends metrics to Vencore API every 30 seconds via HTTPS POST. Vencore does not SSH into servers.
- **Website monitoring is a cron job.** Every 60 seconds, a worker pings all monitored URLs and records response time + status code. SSL expiry is checked daily.
- **Alerts are event-driven.** When a metric crosses a threshold (CPU > 85%, replication lag > 10s, site down), the alert service creates an Alert record and triggers the notification service.
- **The infra alert bar** in the UI is always visible on CRM pages when there are unresolved critical/warning alerts. It should be a component that polls `/api/alerts?resolved=false&severity=critical,warning&limit=3` every 60 seconds.

---

## API Route Structure

```
POST   /api/auth/workspace          Create workspace on first login
GET    /api/me                      Current user + workspace

GET    /api/contacts                List (paginated, filterable)
POST   /api/contacts                Create
GET    /api/contacts/:id            Get one
PATCH  /api/contacts/:id            Update
DELETE /api/contacts/:id            Soft delete

GET    /api/companies               List
POST   /api/companies               Create
GET    /api/companies/:id           Get one
PATCH  /api/companies/:id           Update

GET    /api/deals                   List (filterable by stage, owner)
POST   /api/deals                   Create
GET    /api/deals/:id               Get one
PATCH  /api/deals/:id               Update (including stage change)

GET    /api/tasks                   List (filterable by status, assignee, due)
POST   /api/tasks                   Create
PATCH  /api/tasks/:id               Update (mark done etc.)

GET    /api/activity                Unified feed (paginated)
POST   /api/activity                Log activity

GET    /api/servers                 List
POST   /api/servers                 Register new server (returns agent token)
GET    /api/servers/:id             Get one with latest metrics
POST   /api/agent/ping              Agent heartbeat (authenticated by agent_token)

GET    /api/databases               List
POST   /api/databases               Add database config
PATCH  /api/databases/:id           Update

GET    /api/websites                List
POST   /api/websites                Add website to monitor
DELETE /api/websites/:id            Remove

GET    /api/alerts                  List (filterable by resolved, severity)
PATCH  /api/alerts/:id/acknowledge  Acknowledge
PATCH  /api/alerts/:id/resolve      Resolve

GET    /api/analytics/pipeline      Pipeline stats
GET    /api/analytics/revenue       Revenue by period
GET    /api/analytics/team          Per-rep stats
```

---

## Environment Variables Needed

```
# App
NEXT_PUBLIC_APP_URL=
NODE_ENV=

# Auth
JWT_SECRET=

# Database
DATABASE_URL=           # PostgreSQL
REDIS_URL=              # Redis

# Storage
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=

# Internal
AGENT_SIGNING_SECRET=   # Shared secret for agent authentication
SSH_ENCRYPTION_KEY=     # 64-char hex (32 bytes) — encrypts stored SSH credentials
CRON_SECRET=            # Protects cron endpoints
```

---

## Coding Conventions

- TypeScript strict mode everywhere.
- All DB queries through a query builder (Kysely preferred) — no raw SQL strings without parameterisation.
- All API routes validate input with Zod before touching the DB.
- All API responses follow `{ data: ..., error: null }` or `{ data: null, error: { code, message } }`.
- Workspace scoping middleware: every authenticated API route must call `requireWorkspace(req)` which attaches `req.workspace` and `req.user`. Every DB query uses `where workspace_id = req.workspace.id`.
- No `any` types. No `console.log` in production paths — use a structured logger.
- Write database migrations — never modify existing migration files.
- Components go in `src/components/`. Pages in `src/app/`. API routes in `src/app/api/`. Shared types in `src/types/`. DB queries in `src/db/`.

---

## Git Workflow — NON-NEGOTIABLE

- **Never commit directly to `main`.** `main` is protected — a Claude Code hook will block any `git commit` attempt when on `main`.
- All work goes on a feature branch: `git checkout -b feat/your-feature` (or `fix/`, `chore/`, `refactor/` prefix as appropriate).
- Branch → commit → merge to main (locally or via PR). That's the only flow.
- Branch names: lowercase, hyphen-separated, prefixed by type. Examples: `feat/contact-import`, `fix/auth-redirect`, `chore/update-deps`.

---

## What NOT to Build (yet)

- Full VM management (start/stop/provision) — out of scope for v1
- Built-in database editor or query tool
- Website builder
- AI features
- Mobile app — deferred until after web prod ships
- Public API — deferred until after web prod ships

---

## File Reference

- `vencore-full.html` — Complete UI reference. All pages, all components. Match this exactly.
- `CLAUDE.md` — This file. Read it at the start of every session.