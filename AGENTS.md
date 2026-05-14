# Vantage — Project Brief

## What is Vantage?

Vantage is an all-in-one platform for developer-led teams. It brings together everything a technical business needs: a full CRM (contacts, deals, pipeline, tasks, activity), infrastructure monitoring (servers, databases, websites), team collaboration, and billing — in a single product. No switching between five tools.

**Tagline:** Build, sell, and ship — one place.

**Target user:** Technical founders, small dev agencies, dev-led SaaS teams (2–20 people) who run their own infrastructure and do their own sales.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router) | TypeScript. Tailwind CSS. |
| Backend | Node.js + Express | TypeScript. REST API. |
| Primary DB | PostgreSQL 15 | All CRM + user data. |
| Metrics DB | TimescaleDB | Infra metrics, time-series data. |
| Cache | Redis | Sessions, caching, queues. |
| Object storage | S3-compatible (Cloudflare R2) | File storage. |
| Auth | Clerk | Multi-tenant workspace auth. |
| Billing | Stripe | Usage-based metering. |
| Monitoring agent | Lightweight Node.js daemon | Installed on customer servers. Phones home metrics via HTTPS. |
| Frontend hosting | Vercel | |
| Backend hosting | Railway or Render | |

---

## Design System

The UI reference file is `vantage-full.html` in the project root. **Match it exactly.** Do not invent new components or deviate from the established patterns.

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

## Business Model

**Per-company (workspace) usage-based pricing.**

| Component | Price |
|---|---|
| Base fee | $79 / workspace / month |
| Contacts overage | +$10 per 500 contacts over 1,000 |
| Server overage | +$8 per server over 5 |
| Database overage | +$6 per database over 3 |
| Seat overage | +$12 per user over 5 |

Base includes: 1,000 contacts, 5 servers, 3 databases, 5 seats.

Billing is calculated on the 1st of each month based on peak usage in the prior month. Stripe handles payment. 14-day free trial on signup — no credit card required.

---

## Data Models

### Workspace
```
id: uuid PK
name: string
domain: string
plan: enum (trial, active, cancelled)
stripe_customer_id: string
stripe_subscription_id: string
seat_count: int
contact_count: int
server_count: int
db_count: int
trial_ends_at: timestamp
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

### UsageMeter (for billing)
```
id: uuid PK
workspace_id: uuid FK → workspace
period_start: date
period_end: date
contact_count_peak: int
server_count_peak: int
db_count_peak: int
seat_count_peak: int
base_fee: decimal(10,2)
overage_total: decimal(10,2)
total_bill: decimal(10,2)
stripe_invoice_id: string (nullable)
status: enum (pending, invoiced, paid, failed)
created_at: timestamp
```

---

## Features — Build Order

### Phase 1 — Ship this first
1. **Auth & workspaces** — Clerk integration, workspace creation, invite teammates, roles (admin/member)
2. **CRM core** — Contacts CRUD, Companies CRUD, Deals pipeline (kanban + list), Tasks, Activity timeline
3. **Basic billing** — Stripe customer creation on signup, usage tracking, invoice generation

### Phase 2
4. **Infra monitoring** — Server agent (Node.js daemon), server status dashboard, database health (manual config), website uptime checks (cron pings)
5. **Alerts** — Alert creation from infra events, notification service (email + in-app), alert acknowledge/resolve flow
6. **Analytics** — Revenue by period, win rate, pipeline by stage, rep leaderboard

### Phase 3
7. **Integrations** — Gmail send/track (email open tracking), Zapier webhook support, CSV import/export
8. **Mobile app** — React Native, mirrors web feature set, push notifications for alerts
9. **API** — Public REST API with API key auth, webhook delivery

---

## Key Architecture Decisions

- **Multi-tenant by workspace_id.** Every query must be scoped to `workspace_id`. Never return data across workspaces. Apply this as middleware on all API routes.
- **Soft deletes.** Add `deleted_at: timestamp` to Contact, Company, Deal. Never hard delete CRM records.
- **Infra agent is pull-based.** The agent on customer servers sends metrics to Vantage API every 30 seconds via HTTPS POST. Vantage does not SSH into servers.
- **Website monitoring is a cron job.** Every 60 seconds, a worker pings all monitored URLs and records response time + status code. SSL expiry is checked daily.
- **Alerts are event-driven.** When a metric crosses a threshold (CPU > 85%, replication lag > 10s, site down), the alert service creates an Alert record and triggers the notification service.
- **Usage metering is daily snapshots.** Every night at midnight UTC, a cron job records peak usage counts for each workspace and updates the UsageMeter for the current billing period.
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

GET    /api/billing/usage           Current period usage
GET    /api/billing/invoices        Invoice history
POST   /api/billing/portal          Stripe billing portal session
```

---

## Environment Variables Needed

```
# App
NEXT_PUBLIC_APP_URL=
NODE_ENV=

# Clerk (auth)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Database
DATABASE_URL=           # PostgreSQL
REDIS_URL=              # Redis

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Storage
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=

# Internal
AGENT_SIGNING_SECRET=   # Shared secret for agent authentication
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

- **Never commit directly to `main`.** `main` is protected — a Codex hook will block any `git commit` attempt when on `main`.
- All work goes on a feature branch: `git checkout -b feat/your-feature` (or `fix/`, `chore/`, `refactor/` prefix as appropriate).
- Branch → commit → merge to main (locally or via PR). That's the only flow.
- Branch names: lowercase, hyphen-separated, prefixed by type. Examples: `feat/contact-import`, `fix/auth-redirect`, `chore/update-deps`.

---

## What NOT to Build (yet)

- Full VM management (start/stop/provision) — out of scope for v1
- Built-in database editor or query tool
- Website builder
- AI features
- Mobile app (Phase 3 only)
- Public API (Phase 3 only)

---

## File Reference

- `vantage-full.html` — Complete UI reference. All pages, all components. Match this exactly.
- `AGENTS.md` — This file. Read it at the start of every session.