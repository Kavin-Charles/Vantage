# Installer Page — Design Spec

**Date:** 2026-05-29
**Branch:** feat/installer-page (to be created)

---

## Overview

A one-time first-boot setup wizard at `/setup`. Runs before any user auth. Collects white-label config, feature flags, SMTP credentials, and the first admin's identity. Saves everything to the DB and marks the instance as configured. After completion, admin signs in via Clerk and is auto-promoted to admin role.

---

## Architecture

### Routes

```
GET  /setup                → wizard page (Next.js, unprotected)
POST /api/setup            → saves config + marks setup done
GET  /api/setup/status     → returns { configured: boolean }
```

### Setup Guard (middleware.ts)

Extended `apps/web/middleware.ts`:
- Before Clerk checks: call `GET /api/setup/status`
- If `configured = false` and path ≠ `/setup` or `/api/setup*` → redirect to `/setup`
- If `configured = true` and path = `/setup` → redirect to `/`

The `/setup` page is intentionally outside Clerk auth — the admin creates their identity during setup.

---

## Security

### API Self-Guard
`POST /api/setup` does NOT rely on middleware alone. The handler:
1. Checks rate limit (3 req/min per IP)
2. Opens a DB transaction
3. `SELECT value FROM system_settings WHERE key = 'setup' FOR UPDATE`
4. If `configured = true` → ROLLBACK → 403
5. Validates all input with Zod
6. Saves config row, sets `configured = true`
7. COMMITS

This prevents TOCTOU race conditions — concurrent setup requests cannot both succeed.

### No Password Storage
Auth is Clerk. No passwords are collected or stored. "Admin account" step collects name + email only. The email is stored as `first_admin_email` in the config. On first Clerk sign-in matching that email, the user is auto-promoted to `admin` role and `first_admin_email` is cleared.

### SMTP Credentials Encryption
SMTP password is encrypted at rest using `AES-256-GCM` with `ENCRYPTION_KEY` env var before being stored in DB. The `GET /api/setup/status` endpoint returns only `{ configured: boolean }` — no credentials ever exposed.

### Rate Limiting
`POST /api/setup` rate-limited to 3 requests/min per IP.

---

## Database

### New Table: `system_settings`

```sql
CREATE TABLE system_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Seeded by migration with:
```json
{ "key": "setup", "value": { "configured": false } }
```

### Config Row (written by POST /api/setup)

Key: `"config"`. Value shape:
```json
{
  "app": { "name": "Acme CRM", "logoUrl": "/logo.png", "domain": "app.acme.com" },
  "features": { "crm": true, "infra": true, "alerts": true, "analytics": false, "files": false },
  "smtp": {
    "host": "smtp.sendgrid.net",
    "port": 587,
    "secure": false,
    "user": "apikey",
    "password": "<AES-256-GCM encrypted>",
    "from": "hello@acme.com"
  },
  "first_admin_email": "admin@acme.com"
}
```

`smtp` is nullable — admin may skip SMTP during setup.

### packages/config Update

- Keep `readConfig()` (reads `vantage.config.json`) for local dev / file-based deploys
- Add `readConfigFromDb(db)` — reads `system_settings WHERE key = 'config'`, validates against existing `configSchema`
- API boot: if `system_settings` table exists → use DB path; else fall back to file

---

## Wizard Steps

5 steps with a progress bar at the top.

### Step 1 — Branding
| Field | Type | Required | Default |
|---|---|---|---|
| App name | text | yes | — |
| Logo URL | text | no | `/logo.png` |
| Domain | text | no | — |

### Step 2 — Features
Toggle switches:
| Feature | Default |
|---|---|
| CRM (contacts, deals, companies, tasks) | on |
| Infrastructure monitoring | on |
| Alerts | on |
| Analytics | off |
| Files | off |

### Step 3 — SMTP
| Field | Type | Required |
|---|---|---|
| Host | text | yes (if not skipped) |
| Port | number | yes |
| Secure | toggle | no |
| Username | text | yes |
| Password | password | yes |
| From address | email | yes |

"Skip for now" button available — SMTP config is nullable.

### Step 4 — Admin Account
| Field | Type | Required |
|---|---|---|
| Full name | text | yes |
| Email | email | yes |

Display note: *"You'll sign in via the login page after setup completes. This email will be granted admin access automatically."*

No password field — auth is handled by Clerk.

### Step 5 — Review & Confirm
- Summary card showing all entered values
- SMTP password displayed as `••••••••`
- "Launch Vantage" button → `POST /api/setup` → on success, redirect to `/login`

---

## Frontend Structure

**File:** `apps/web/app/setup/page.tsx` — outside `(dashboard)` route group, no Clerk wrapper.

**Component tree:**
```
SetupPage (page.tsx)
  └── SetupWizard
        ├── ProgressBar
        ├── StepBranding
        ├── StepFeatures
        ├── StepSmtp
        ├── StepAdminAccount
        └── StepReview
```

**State (single useState in SetupWizard):**
```ts
type SetupState = {
  step: 1 | 2 | 3 | 4 | 5;
  branding: { name: string; logoUrl: string; domain: string };
  features: Record<'crm' | 'infra' | 'alerts' | 'analytics' | 'files', boolean>;
  smtp: SmtpConfig | null;
  admin: { name: string; email: string };
}
```

**Validation:** Zod on each step's "Next" click (client-side). Server also validates with the same schemas — never trust client input.

**Styling:** Design system tokens (`--bg`, `--surface`, `--border`, `DM Sans` / `Instrument Serif`). Centered card layout, no sidebar. Matches `vantage-full.html` reference.

---

## New Environment Variable

```
ENCRYPTION_KEY=   # 32-byte hex string, used for AES-256-GCM SMTP password encryption
```

Must be set before first boot. API startup should fail fast with a clear error if missing.

---

## Migration

New file: `packages/db/migrations/20260529_001_system_settings.ts`
- Creates `system_settings` table
- Seeds `{ "key": "setup", "value": { "configured": false } }` row

---

## Out of Scope

- Re-running the installer after setup is complete (blocked by 403 + middleware redirect)
- Changing config post-setup (that's a settings page concern)
- Multi-admin invite during setup (admin invites teammates after login)
