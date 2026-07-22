# Repo SEO Refresh & Content Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public GitHub repo accurately reflect the current product and rank for relevant search intent — via a rewritten SEO README, refreshed + expanded screenshots, an OG social-preview image, and tuned repo About + topics.

**Architecture:** Repo-surface only, no product code changes. Boot the prebuilt Docker stack, seed demo data, capture every module with Playwright, generate a 1280×640 OG card by rendering self-contained HTML, rewrite the README, and set metadata with `gh`.

**Tech Stack:** Docker Compose (prebuilt `ghcr.io/vencorehq/*` images + `timescale/timescaledb:latest-pg15` + `redis:7`), Playwright (already available as MCP), `gh` CLI, GitHub-flavored Markdown.

## Global Constraints

- Branch: `chore/repo-seo-refresh` (already created, spec committed). Sole author **Kavin-Charles**. No AI attribution in any commit/PR. One small commit per task.
- Positioning hook: **open-source, self-hosted company OS**. Differentiator: **white-label, modular, multi-tenant**.
- Product version: **0.2.0**.
- Hero logo file is `logo.png` (NOT `log_o.png` — that ref is the current bug).
- Every image needs keyword-rich `alt` text (SEO + a11y).
- Screenshots: fixed 1440×900 viewport, seeded demo data, no empty states.
- No external docs site (out of scope). No product code edits.
- Repo origin is `vencorehq/vencore` (confirm actual `gh repo view` slug before editing metadata).

---

### Task 1: Boot the stack and seed demo data

**Files:**
- Read: `docker-compose.yml`, `.env.example`, `vencore.config.example.json`
- Create: `.env` files as the README quickstart prescribes; `vencore.config.json`

**Interfaces:**
- Produces: a running web app at `http://localhost:3000`, an API with demo data, and admin login credentials captured from API stdout.

- [ ] **Step 1: Confirm the daemon is up (user ran the privileged boot line)**

Run:
```bash
docker info >/dev/null 2>&1 && echo UP || echo DOWN
```
Expected: `UP`. If `DOWN`, stop — the user must run:
`sudo pacman -S --noconfirm docker-compose && sudo systemctl start docker && sudo usermod -aG docker $USER`
(and use `sudo docker ...` this session to skip re-login).

- [ ] **Step 2: Inspect compose to learn required env + whether it builds or pulls**

Run:
```bash
docker compose config
```
Expected: services `db, redis, web, api, worker`. Note any `${VAR}` that must be set (JWT_SECRET, DATABASE_URL, REDIS_URL, etc.) and whether images pull from ghcr or build locally.

- [ ] **Step 3: Create env + config from examples**

Run:
```bash
cp .env.example .env
cp vencore.config.example.json vencore.config.json
```
Then set a real `JWT_SECRET` in `.env`:
```bash
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
```
Set `vencore.config.json` `features` to all `true` (crm, infra, alerts, analytics, and any projects/messaging/plugins flags present) so every module renders for capture.

- [ ] **Step 4: Pull + start the stack**

Run:
```bash
docker compose up -d
```
Expected: `db`, `redis`, `api`, `web`, `worker` all `Started`. If ghcr images are private, `docker login ghcr.io` first (ask user for a PAT — do not guess credentials).

- [ ] **Step 5: Verify containers healthy**

Run:
```bash
docker compose ps
```
Expected: all services `Up`. If `web`/`api` restart-loop, check `docker compose logs api --tail=50` for missing migrations.

- [ ] **Step 6: Run migrations + seed demo data**

Run (exec inside the api container, or via local scripts if the image entrypoint doesn't auto-migrate):
```bash
docker compose exec api node dist/lib/seed.js 2>/dev/null || docker compose exec api sh -c "pnpm db:migrate"
docker compose exec api sh -c "node dist/lib/seed-demo.js || pnpm tsx src/lib/seed-demo.ts"
```
Expected: seed script logs rows created for contacts, companies, deals, servers, projects, etc. Adjust the exact invocation to the image's actual entrypoint (inspect `docker compose exec api ls dist/lib`).

- [ ] **Step 7: Capture admin credentials**

Run:
```bash
docker compose logs api | grep -i "First boot admin"
```
Expected: a line like `[VENCORE] First boot admin: admin@localhost / <generated-password>`. Save both values for Playwright login. If absent, the seed script prints them — check `docker compose logs api --tail=200`.

- [ ] **Step 8: Verify the app serves and has data**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```
Expected: `200` (or `307` redirect to `/login`). Confirm demo data via `curl -s http://localhost:3000/api/... ` after login, or defer visual confirmation to Task 2.

- [ ] **Step 9: Commit env scaffolding note (no secrets)**

`.env` and `vencore.config.json` are gitignored — verify with `git status`. Nothing to commit here; this task produces a running environment only.

---

### Task 2: Capture screenshots of every module

**Files:**
- Create/overwrite in `screenshots/`: `dashboard.png, pipeline.png, contacts.png, companies.png, activity.png, tasks.png, projects.png, sprints.png, messaging.png, servers.png, databases.png, websites.png, alerts.png, analytics.png, plugins.png, portal.png, roles.png` and a dark hero `dashboard-dark.png`.

**Interfaces:**
- Consumes: running app + admin creds from Task 1.
- Produces: PNG files the README (Task 4) references by exact name.

- [ ] **Step 1: Log in via Playwright**

Use the Playwright MCP: navigate to `http://localhost:3000/login`, fill the seeded admin email + password, submit, wait for the dashboard to load. Resize viewport to 1440×900 first.

- [ ] **Step 2: Capture each module at a stable route**

For each route, navigate, `browser_wait_for` the main content, then `browser_take_screenshot` to the target filename. Routes → files:

| Route | File |
|---|---|
| `/dashboard` | `dashboard.png` |
| `/crm` (pipeline/kanban view) | `pipeline.png` |
| `/crm` contacts list | `contacts.png` |
| `/crm` companies list | `companies.png` |
| `/activity` | `activity.png` |
| `/crm` tasks / `/projects` tasks | `tasks.png` |
| `/projects` (list/board) | `projects.png` |
| `/projects` sprint/milestone view | `sprints.png` |
| `/messaging` | `messaging.png` |
| `/infra` servers | `servers.png` |
| `/infra` databases | `databases.png` |
| `/infra` websites | `websites.png` |
| `/infra` alerts | `alerts.png` |
| `/analytics` | `analytics.png` |
| `/plugins` (marketplace) | `plugins.png` |
| `/portal` (client portal) | `portal.png` |
| `/settings` roles/RBAC | `roles.png` |

If a route differs from the guess, discover the real path from `apps/web/app/(dashboard)/` folder names before capturing.

- [ ] **Step 3: Capture the dark hero**

Toggle dark mode (settings or the theme switch), navigate to `/dashboard`, capture `dashboard-dark.png`. Toggle back to light.

- [ ] **Step 4: Verify every file exists and is non-empty**

Run:
```bash
cd screenshots && for f in dashboard pipeline contacts companies activity tasks projects sprints messaging servers databases websites alerts analytics plugins portal roles dashboard-dark; do test -s "$f.png" && echo "OK $f" || echo "MISSING $f"; done
```
Expected: all `OK`. Recapture any `MISSING`.

- [ ] **Step 5: Commit screenshots**

```bash
git add screenshots/
git commit -m "docs(seo): refresh and expand module screenshots"
```

---

### Task 3: Build the OG social-preview image (1280×640)

**Files:**
- Create: `scripts/og-card.html` (self-contained, inline CSS, design tokens)
- Create: `screenshots/og-card.png` (rendered 1280×640)

**Interfaces:**
- Consumes: `logo.png`, design tokens from CLAUDE.md.
- Produces: `screenshots/og-card.png` for manual upload in repo Settings (Task 5 references it).

- [ ] **Step 1: Write the OG card HTML**

Create `scripts/og-card.html` — a 1280×640 card using tokens: `--bg #f7f6f2`, `--text #1a1814`, `--text2 #6b665c`, `--green #2d6a4f`. Instrument Serif for the wordmark/headline, DM Sans for body. Content: `Vencore` wordmark, headline "The open-source, self-hosted company OS", subline "White-label CRM · Projects · Infra Monitoring · Analytics — one modular platform", and a row of module chips. Embed the logo as a `data:` URI or reference `../logo.png` (Playwright renders from disk). Inline all CSS. No external fonts/CDN — use system serif/sans fallbacks if web fonts unavailable offline: `font-family: 'Instrument Serif', Georgia, serif` and `'DM Sans', system-ui, sans-serif`.

- [ ] **Step 2: Render to PNG via Playwright**

Navigate Playwright to `file:///home/kavin/Projects/Vencore/scripts/og-card.html`, resize to exactly 1280×640, `browser_take_screenshot` (full viewport, not full page) to `screenshots/og-card.png`.

- [ ] **Step 3: Verify dimensions**

Run:
```bash
file screenshots/og-card.png
```
Expected: `PNG image data, 1280 x 640`. If off, re-resize and recapture.

- [ ] **Step 4: Commit**

```bash
git add scripts/og-card.html screenshots/og-card.png
git commit -m "docs(seo): add OG social-preview card"
```

---

### Task 4: Rewrite the README

**Files:**
- Modify: `README.md` (full replacement)

**Interfaces:**
- Consumes: screenshot filenames from Task 2, product inventory from the spec.
- Produces: the public README. No downstream code depends on it.

- [ ] **Step 1: Replace README.md with the new content**

Write `README.md` exactly as below:

````markdown
<p align="center">
  <img src="logo.png" alt="Vencore — open-source self-hosted company management platform" width="120" />
</p>

<h1 align="center">Vencore</h1>

<p align="center">
  <strong>The open-source, self-hosted company OS.</strong><br/>
  White-label CRM, project management, infrastructure monitoring & analytics — one modular, multi-tenant platform.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green.svg" /></a>
  <img alt="Version" src="https://img.shields.io/badge/version-0.2.0-blue.svg" />
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-yes-2d6a4f.svg" />
  <img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" />
</p>

<p align="center">
  <img src="screenshots/dashboard.png" alt="Vencore dashboard with cross-module widgets" width="49%" />
  <img src="screenshots/pipeline.png" alt="Vencore CRM pipeline kanban board" width="49%" />
</p>

Vencore is an **open-source, self-hosted company management platform** — run your entire business from one place. Bring your CRM, project management, infrastructure monitoring, team messaging, analytics, and a client portal under a single **white-label** roof, then enable only the modules your teams need. Fully **multi-tenant**, extensible with a **plugin marketplace + SDK**, and dependency-light: it runs on Postgres and Redis with no external SaaS lock-in.

> **One platform to run your entire business.**

## Why self-hosted & white-label

- **Own your data.** Runs on your infrastructure. No third-party auth service, no data leaving your servers.
- **Brand it as yours.** Custom name, logo, and domain per workspace — your users never see "Vencore".
- **Modular.** Toggle CRM, projects, infra, analytics, messaging, and plugins independently via a config file.
- **Multi-tenant.** Workspace-scoped by design — every query is isolated per tenant.
- **Extensible.** A first-class plugin system with a typed SDK and an in-app marketplace.

## Screenshots

<p align="center">
  <img src="screenshots/projects.png" alt="Vencore project management board with milestones and sprints" width="49%" />
  <img src="screenshots/analytics.png" alt="Vencore analytics — revenue, win rate, pipeline by stage" width="49%" />
</p>

<details>
<summary>More screenshots</summary>
<br>

![Contacts CRM](screenshots/contacts.png)
![Companies](screenshots/companies.png)
![Activity feed](screenshots/activity.png)
![Tasks](screenshots/tasks.png)
![Sprints and milestones](screenshots/sprints.png)
![Team messaging](screenshots/messaging.png)
![Server monitoring](screenshots/servers.png)
![Database health](screenshots/databases.png)
![Website uptime monitoring](screenshots/websites.png)
![Alerts](screenshots/alerts.png)
![Plugin marketplace](screenshots/plugins.png)
![Client portal](screenshots/portal.png)
![Roles and permissions (RBAC)](screenshots/roles.png)

</details>

## Features

### CRM
- **Pipeline** — Kanban board with custom stages, per-stage custom fields (text, number, date, select, boolean), drag-to-move cards, and multiple item groups per pipeline.
- **Contacts & Companies** — Full CRUD with CSV import/export on every list view, tags, and owners.
- **Tasks** — Assign to contacts, deals, or projects; filter by status, assignee, and due date.
- **Activity feed** — Unified timeline of emails, calls, notes, meetings, deal changes, and infra alerts.

### Projects & Project Management
- **Boards & views** — Projects with tasks, custom fields, and multiple views.
- **Milestones & sprints** — Plan work in sprints, track milestones and progress.
- **Time logs & recurring work** — Log time; schedule recurring tasks and rules.
- **Automation** — Rule-based automations across the PM workflow.
- **Client portal** — A branded, permissioned portal for external clients.

### Infrastructure Monitoring
- **Server monitoring** — A lightweight Node.js agent phones home every 30 seconds with CPU, memory, disk, and uptime. No inbound connections to your servers.
- **Database health** — Connect Postgres, MySQL, Redis, or MongoDB; the worker checks connection health and replication lag every 60 seconds.
- **Website uptime** — Track response time and status for any URL; SSL expiry checked daily.
- **Alerts** — Threshold alerts (CPU > 85%, disk > 90%, replication lag > 10s, site down) with a real-time alert bar across every page.

### Analytics
- Revenue by period, pipeline value by stage, win rate, per-rep leaderboard, and a configurable analytics hub.

### Messaging
- Built-in team messaging with real-time delivery (SSE).

### Plugins & Marketplace
- A first-class **plugin system** with a typed SDK (`plugin-runtime`, `plugin-types`) and an in-app **marketplace** to install and manage plugins. See [`plugin-docs/`](plugin-docs/).

### Platform
- **Multi-user RBAC** — Configurable roles and permissions beyond simple admin/member.
- **White-label branding** — Per-workspace name, logo, and domain.
- **Public REST API** — Versioned `/api/v1` with API-key auth and outgoing webhooks.
- **Notifications** — In-app and email notifications with per-user preferences.
- **Setup wizard** — Guided first-run configuration.
- **Self-updating** — Instance updater with semver-aware releases.
- **Feature flags** — Enable/disable modules independently via `vencore.config.json`.

## Architecture

Turborepo monorepo — applications plus shared packages:

```
apps/
  web/      Next.js 14 (App Router) — the dashboard, portal, plugin UI
  api/      Express REST API — all data operations + public /api/v1
  worker/   Background jobs — website pings, alert evaluation, DB health

packages/
  db/              Kysely database client + schema types
  types/           Shared TypeScript types across apps
  config/          Config schema + loader (vencore.config.json)
  modules/         Module registry and shared module logic
  plugin-runtime/  Plugin execution runtime
  plugin-types/    Public plugin SDK types
  api-client/      Typed API client shared by web + plugins
```

**Data flow:** each server agent POSTs metrics to `/api/agent/ping` every 30s with a per-server token. The worker runs every 60s, evaluates thresholds, and writes alert records. The frontend polls `/api/alerts` every 60s for the alert bar; live updates stream over SSE.

**Auth:** JWT cookies (`httpOnly`, `SameSite=Strict`). First boot seeds an admin user and prints credentials to stdout. No third-party auth service.

**Database:** PostgreSQL 15 + TimescaleDB (time-series metrics). All queries go through Kysely — no raw SQL strings. Workspace-scoped middleware guarantees tenant isolation.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14, TypeScript, TanStack Query |
| Backend | Node.js, Express, TypeScript, Zod |
| ORM | Kysely |
| Database | PostgreSQL 15 + TimescaleDB |
| Cache / realtime | Redis + Server-Sent Events |
| Plugins | Typed plugin runtime + SDK |
| Monorepo | Turborepo + pnpm workspaces |

## Getting Started

### Prerequisites
- Node.js ≥ 20
- pnpm ≥ 9
- Docker (for Postgres + Redis)

### 1. Clone and install
```bash
git clone https://github.com/vencorehq/vencore.git
cd vencore
pnpm install
```

### 2. Start the database
```bash
docker compose up -d
```
Starts PostgreSQL (with TimescaleDB) on 5432 and Redis on 6379.

### 3. Configure environment
```bash
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local
cp .env.example apps/worker/.env
```
Set a random `JWT_SECRET` in `apps/api/.env`:
```bash
openssl rand -hex 32
```

### 4. Configure the app
Copy `vencore.config.example.json` to `vencore.config.json` and enable the modules you want:
```json
{
  "app": { "name": "YourCo", "domain": "localhost" },
  "features": { "crm": true, "projects": true, "infra": true, "alerts": true, "analytics": true, "messaging": true, "plugins": true },
  "databases": []
}
```

### 5. Migrate and run
```bash
pnpm db:migrate
pnpm dev
```
The web app runs at http://localhost:3000. On first boot the API prints admin credentials:
```
[VENCORE] First boot admin: admin@localhost / <generated-password>
```
Or complete setup through the built-in **setup wizard** at `/setup`.

### 6. (Optional) Install the server agent
On any server you want to monitor — register it in the dashboard to get a token, then:
```bash
VENCORE_TOKEN=<your-token> \
VENCORE_API_URL=https://your-vencore-instance.com \
npx vencore-agent
```

## Configuration

`vencore.config.json` is the single source of truth for instance-level settings; the API and worker read it at startup.

| Key | Description |
|---|---|
| `app.name` | Workspace name shown in the sidebar |
| `app.domain` | Used to generate the admin email on first boot |
| `app.logoUrl` | Path or URL to a custom logo |
| `features.*` | Toggle CRM, projects, infra, analytics, alerts, messaging, plugins independently |
| `smtp` | SMTP config for email notifications |
| `databases` | Pre-seed database connections (idempotent on restart) |

## API

Every response follows one envelope:
```json
{ "data": { ... }, "error": null }
{ "data": null, "error": { "code": "NOT_FOUND", "message": "..." } }
```
Authenticated routes are workspace-scoped. A stable public API lives under `/api/v1` with API-key auth and webhooks. Route source: [`apps/api/src/routes/`](apps/api/src/routes/).

## Plugins

Vencore ships a typed plugin SDK and an in-app marketplace. Build backend handlers, frontend surfaces, and permission bridges. Start with the [plugin docs](plugin-docs/).

## Development

```bash
pnpm dev          # Start all apps in watch mode
pnpm build        # Build everything
pnpm type-check   # TypeScript check across all packages
pnpm db:migrate   # Run pending migrations
```
Run an app individually:
```bash
cd apps/api && pnpm dev
cd apps/web && pnpm dev
cd apps/worker && pnpm dev
```

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT — see [LICENSE](LICENSE).
````

- [ ] **Step 2: Verify all referenced images exist**

Run:
```bash
cd /home/kavin/Projects/Vencore && grep -oE 'screenshots/[a-z-]+\.png|logo\.png' README.md | sort -u | while read f; do test -s "$f" && echo "OK $f" || echo "MISSING $f"; done
```
Expected: all `OK`. `MISSING` means a Task 2 filename mismatch — reconcile.

- [ ] **Step 3: Sanity-check Markdown renders (no broken tables/details)**

Run:
```bash
npx --yes markdown-link-check README.md 2>/dev/null || echo "link-check skipped (offline) — visually verify on push"
```
Expected: internal links resolve; external badge URLs may fail offline (acceptable).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(seo): rewrite README for current product and search intent"
```

---

### Task 5: Set repo About + topics via gh

**Files:** none (remote metadata).

**Interfaces:**
- Consumes: confirmed repo slug.
- Produces: updated GitHub About + topics; a note for the manual OG upload.

- [ ] **Step 1: Confirm the repo slug and gh auth**

Run:
```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```
Expected: e.g. `vencorehq/vencore`. If `gh` errors on auth, stop and ask the user to `gh auth login`.

- [ ] **Step 2: Set the About description**

Run:
```bash
gh repo edit --description "Open-source, self-hosted company OS — white-label CRM, project management, infra monitoring & analytics in one modular, multi-tenant platform."
```
Expected: no error.

- [ ] **Step 3: Set topics**

Run:
```bash
gh repo edit \
  --add-topic open-source --add-topic self-hosted --add-topic crm \
  --add-topic company-management --add-topic white-label --add-topic project-management \
  --add-topic infrastructure-monitoring --add-topic uptime-monitoring --add-topic saas \
  --add-topic multi-tenant --add-topic plugin-system --add-topic nextjs \
  --add-topic typescript --add-topic express --add-topic postgresql \
  --add-topic kysely --add-topic monorepo --add-topic dashboard \
  --add-topic business-management --add-topic team-collaboration
```
Expected: no error.

- [ ] **Step 4: Verify metadata**

Run:
```bash
gh repo view --json description,repositoryTopics -q '{desc: .description, topics: [.repositoryTopics[].name]}'
```
Expected: new description + all 20 topics listed.

- [ ] **Step 5: Surface the manual OG upload step**

`gh` cannot set the social-preview image. Tell the user: open **repo Settings → General → Social preview → Edit → Upload** and select `screenshots/og-card.png`. This is the only manual step.

---

### Task 6: Final verification and graphify

**Files:** none (verification), possibly `graphify-out/*` if regenerated.

- [ ] **Step 1: Confirm the branch state**

Run:
```bash
git log --oneline main..HEAD
```
Expected: commits for spec, screenshots, OG card, README, (metadata task has no local commit). All authored by Kavin-Charles.

- [ ] **Step 2: Verify no AI attribution slipped in**

Run:
```bash
git log main..HEAD --format='%an <%ae>%n%B' | grep -iE 'claude|anthropic|co-authored|generated with|copilot' && echo "FOUND — fix" || echo "CLEAN"
```
Expected: `CLEAN`.

- [ ] **Step 3: Graphify check**

Only README + screenshots + one script changed — no cross-file code relationships. Run `Update Graphify` only if the script/HTML introduces a tracked relationship; otherwise skip per CLAUDE.md (screenshot/README-only change).

- [ ] **Step 4: Tear down the stack (optional)**

Run:
```bash
docker compose down
```
Expected: containers removed. Volumes (`db_data`, `redis_data`) persist unless `-v` added.

- [ ] **Step 5: Offer to open a PR**

Ask the user whether to `gh pr create` from `chore/repo-seo-refresh` into `main` (sole author, no AI footer), or merge locally.

---

## Self-Review

**Spec coverage:**
- Content accuracy (logo fix, missing modules, version) → Task 4. ✓
- SEO README rewrite (hook, badges, keywords, alt text) → Task 4. ✓
- Repo About + topics via gh → Task 5. ✓
- OG image 1280×640 → Task 3 + manual upload note Task 5. ✓
- Screenshots for all modules after boot → Tasks 1–2. ✓
- Sequencing everything-after-boot → task order (boot → capture → OG → README → metadata). ✓

**Placeholder scan:** OG card copy, README content, and all commands are concrete. Route-to-file guesses in Task 2 include a "discover real path from `apps/web/app/(dashboard)/`" fallback — not a placeholder, a verification step. No TBDs.

**Type/name consistency:** screenshot filenames in Task 2 match every `src=`/`![...]` in Task 4's README verbatim (`dashboard, pipeline, contacts, companies, activity, tasks, projects, sprints, messaging, servers, databases, websites, alerts, analytics, plugins, portal, roles`). OG file `screenshots/og-card.png` consistent across Tasks 3 and 5. Branch name consistent across tasks.
