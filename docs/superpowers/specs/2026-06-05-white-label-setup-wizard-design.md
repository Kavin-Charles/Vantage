# White-Label Setup Wizard — Design Spec

**Date:** 2026-06-05  
**Status:** Approved

---

## Overview

Replace the current 5-step installer page with a complete white-label setup system: a single `curl` command bootstraps Docker, serves an installer container with a sidebar-nav wizard, collects all config, deploys the full Vencore stack, and guides the admin through post-setup steps.

---

## System Architecture

```
curl -fsSL https://get.vencore.in | bash
  └─ install.sh (~50 lines)
       ├─ Check Docker installed (install if missing)
       ├─ Pull vencore/installer:latest
       ├─ docker run -p 3000:3000
       │    -v /var/run/docker.sock:/var/run/docker.sock
       │    -v /opt/vencore:/opt/vencore
       │    vencore/installer
       └─ Print: "Open http://<SERVER_IP>:3000 to continue"

vencore/installer container  (named: vencore-installer)
  └─ Same Next.js web app as production, with INSTALLER_MODE=true env var
       ├─ INSTALLER_MODE=true blocks all routes except /setup and /setup/*
       ├─ Enables installer-only Express API routes (deploy, test-db, test-smtp)
       ├─ Wizard collects all config
       ├─ On Deploy: writes /opt/vencore/docker-compose.yml + .env
       ├─ Calls Docker socket → docker compose up -d
       └─ Redirects to /setup/complete (post-setup checklist)
```

**Key invariants:**
- `install.sh` is thin — Docker check + single `docker run`. No business logic.
- Installer container has Docker socket mount → controls host Docker.
- All config written to `/opt/vencore/.env` on host (survives container removal).
- After deploy, user removes installer container. Main app runs independently.
- Dev mode unchanged — `npm run dev` still works, `/setup` accessible directly.

---

## Config File Deprecation

`vencore.config.json` is dropped as a hard requirement. The API must boot without it.

- `readConfig()` becomes optional: if file missing, log a warning and return safe defaults.
- All production config lives in DB (`system_settings` key `'config'`), written by the wizard.
- The file remains a dev-only escape hatch (set `CONFIG_PATH` env var to point to it).
- `read-config.ts` default path updated from `vantage.config.json` → `vencore.config.json` (rebrand fix).
- `vencore.config.example.json` stays as a reference template.

---

## Wizard UI

### Layout

Sidebar-nav, full-screen (no main app chrome).

```
┌──────────────────────────────────────────────────────────┐
│  [Vencore Logo]                              Step 3 of 8  │
├───────────────┬──────────────────────────────────────────┤
│  ✓ Branding   │                                          │
│  ✓ Infra      │   [Step title]  (optional tag if skip.)  │
│  → Domain ⊘   │                                          │
│  ○ SMTP       │   [Form content]                         │
│  ○ Features   │                                          │
│  ○ Admin      │                           [Skip for now] │
│  ○ Review     │                      [Back]  [Continue →]│
│  ○ Complete   │                                          │
└───────────────┴──────────────────────────────────────────┘
```

- Sidebar step states: ✓ done (clickable) / → current / ○ locked / ⊘ skipped (clickable)
- Completed and skipped steps are clickable — user can go back and edit
- Locked steps not clickable until reached
- "Skip for now" button on optional steps (bottom-left of content panel)
- Back + Continue buttons sticky at bottom-right of content panel
- Fonts: `Bricolage Grotesque` (display) + `IBM Plex Sans` (UI/body). CSS tokens from `globals.css` (`--bg`, `--surface`, `--border`, `--text`, etc.). Self-hosted product — no Clerk/Stripe/SaaS assumptions.

### Step Order

| # | Step | Optional |
|---|------|----------|
| 1 | Branding | No |
| 2 | Infrastructure | No |
| 3 | Domain & SSL | Yes |
| 4 | SMTP | Yes |
| 5 | Features | No |
| 6 | Admin Account | No |
| 7 | Review & Deploy | No |
| 8 | Post-Setup Checklist | — |

---

## Step Designs

### Step 1 — Branding

Fields:
- App name (text, required)
- Logo (file upload → stored in `/opt/vencore/data/uploads/logo`)
- Favicon (file upload, optional)
- Primary brand color (color picker)
- Tagline / footer text (text, optional)

Logo and favicon stored as files; paths written to `.env` as `APP_LOGO_URL`, `APP_FAVICON_URL`.

---

### Step 2 — Infrastructure

User picks deployment mode:

```
  ┌─────────────────────────┐  ┌─────────────────────────┐
  │  🗄  Own Credentials    │  │  🐳  Docker Deploy       │
  │  I have Postgres/Redis  │  │  Let Vencore spin up     │
  │  already running        │  │  containers for me       │
  └─────────────────────────┘  └─────────────────────────┘
```

**Own Creds** — adds two sidebar sub-steps:
- Database: host, port, db name, user, password, SSL toggle, "Test Connection" button
- Redis: host, port, password (optional sub-step, skippable)

**Docker Deploy** — single sidebar sub-step:
- Data directory on host (default `/opt/vencore/data`)
- Postgres version dropdown (default: latest stable)
- Redis version dropdown (default: latest stable)
- Preview of generated `docker-compose.yml` in read-only code block

Both paths normalize to the same `DATABASE_URL` and `REDIS_URL` env vars.

"Test Connection" (Own Creds): installer API attempts connection, returns ✓ or inline error before allowing Continue.

---

### Step 3 — Domain & SSL (optional)

Three sub-sections on one page:

**Domain**
- Custom domain input (e.g. `app.acme.com`)
- Shows server IP + DNS instruction: "Set an A record pointing to `<SERVER_IP>`"
- Skip → app uses `http://<SERVER_IP>:3000`

**SSL**
- Toggle: Auto SSL via Let's Encrypt (default on, requires domain)
- Email for cert renewal notices
- Skip → HTTP only, warning shown in Review

**Reverse Proxy**
- Default: Caddy (handles SSL automatically)
- Alternative: Nginx (for users managing their own nginx)
- Generated config shown in read-only code block
- Written to `/opt/vencore/Caddyfile` or `/opt/vencore/nginx.conf` on deploy

---

### Step 4 — SMTP (optional)

Fields: host, port, user, password, from address, secure toggle.

"Send test email" button — hits installer API, sends test mail to admin email (entered in step 6 or prompted inline), shows ✓ or error.

---

### Step 5 — Features

Module toggles (same as current):
- CRM
- Infrastructure monitoring
- Alerts
- Analytics
- Files

---

### Step 6 — Admin Account

Fields: name, email, password (with strength indicator).

---

### Step 7 — Review & Deploy

Split panel:

```
┌─────────────────────────┬──────────────────────────────┐
│  Review                 │  Deploy Log                  │
│                         │                              │
│  ✓ Branding: Acme CRM   │  [idle — click Deploy]       │
│  ✓ Infra: Docker Deploy │                              │
│  ✓ Domain: app.acme.com │                              │
│  ⊘ SMTP: skipped  ⚠     │                              │
│  ✓ Features: CRM, Infra │                              │
│  ✓ Admin: john@acme.com │                              │
│                         │                              │
│  [Edit any step ↑]      │          [🚀 Deploy Vencore] │
└─────────────────────────┴──────────────────────────────┘
```

- Skipped optional steps show ⚠ with consequence note (e.g. "email features won't work")
- Deploy button: click → locked spinner, right panel streams deploy log via SSE
- Deploy log steps: Pulling images → Writing config → Starting containers → Running migrations → Health check
- On success: auto-redirect to `/setup/complete`
- On failure: log shows error, step highlighted red, "Retry" button appears

**Files written to host on deploy:**
- `/opt/vencore/.env`
- `/opt/vencore/docker-compose.yml`
- `/opt/vencore/Caddyfile` or `/opt/vencore/nginx.conf` (if domain configured)

---

### Step 8 — Post-Setup Checklist

Full-screen success page. No login required (served by installer container).

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   ✅  Vencore is running                                 │
│       app.acme.com                                       │
│                                                          │
│   Next steps                                             │
│                                                          │
│   ✓  DNS A record set          (auto-detected)          │
│   ✓  SSL certificate issued    (auto-detected)          │
│   ○  Send a test email         [Send test →]            │
│   ○  Invite your team          [Copy invite link]       │
│   ○  Remove installer          [Copy command]           │
│                                                          │
│                        [Open Vencore →]                  │
└──────────────────────────────────────────────────────────┘
```

- DNS + SSL status auto-polled every 5s, update live
- "Remove installer" copies `docker rm -f vencore-installer` to clipboard
- "Open Vencore →" opens deployed app URL in new tab
- Page accessible until installer container is removed

---

## Backend Changes

### Installer API (inside vencore/installer container)

New endpoints served by the installer container's Express API:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/setup/status` | Check if setup already done |
| POST | `/api/setup/test-db` | Test DB connection (Own Creds) |
| POST | `/api/setup/test-smtp` | Send test email |
| POST | `/api/setup/deploy` | Start deploy job, returns `{ jobId }` |
| GET | `/api/setup/deploy/:jobId/stream` | SSE stream of deploy log lines (reconnectable) |
| GET | `/api/setup/server-ip` | Return server IP for DNS instructions |

### Config File (`vencore.config.json`) — Deprecated as Hard Requirement

- `readConfig()` made optional: missing file → log warning, return safe defaults
- Default path corrected: `vantage.config.json` → `vencore.config.json`
- Production config lives entirely in DB after wizard completes
- File retained as dev-only shortcut via `CONFIG_PATH` env var

### Main Vencore API

No changes to setup route or schema. Wizard writes the same payload the current installer does. `readConfigFromDb()` remains the production config source.

---

## File Structure

```
apps/web/app/setup/
  page.tsx                    ← entry, checks setup status
  layout.tsx                  ← full-screen layout (no app chrome)
  SetupWizard.tsx             ← sidebar-nav shell, step routing
  ProgressBar.tsx             ← removed (replaced by sidebar)
  Sidebar.tsx                 ← new
  steps/
    StepBranding.tsx          ← new (replaces old, adds color/favicon/tagline)
    StepInfrastructure.tsx    ← new
    StepDatabase.tsx          ← new (Own Creds sub-step)
    StepRedis.tsx             ← new (Own Creds sub-step, optional)
    StepDomainSsl.tsx         ← new
    StepSmtp.tsx              ← updated (add test send)
    StepFeatures.tsx          ← minor update
    StepAdminAccount.tsx      ← minor update
    StepReview.tsx            ← rewritten (split panel + SSE log)
    StepComplete.tsx          ← new (post-setup checklist)

apps/installer/               ← new Docker build context
  Dockerfile
  src/
    index.ts                  ← Express server
    routes/
      deploy.ts               ← writes files, calls Docker socket, SSE stream
      test-db.ts
      test-smtp.ts
      server-ip.ts
    lib/
      compose-generator.ts    ← generates docker-compose.yml
      env-writer.ts           ← writes .env to /opt/vencore
      caddy-generator.ts      ← generates Caddyfile

scripts/
  install.sh                  ← curl | bash bootstrap script

packages/config/src/
  read-config.ts              ← make file optional, fix path vantage→vencore
```

---

## Out of Scope

- Auth / SSO setup step (future)
- License key validation (future)
- Plugin marketplace in wizard (future)
- Windows / macOS installer (Docker on Linux only for now)
