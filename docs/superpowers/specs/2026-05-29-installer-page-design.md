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
- Check for `vantage_setup_done` cookie (set by API on successful setup)
- If cookie absent and path ≠ `/setup` or `/api/setup*` → redirect to `/setup`
- If cookie present and path = `/setup` → redirect to `/`
- The `/setup` page itself calls `GET /api/setup/status` on mount to confirm DB state

No per-request API call in middleware — cookie check is O(1). The admin creates their identity during setup before any auth flow.

---

## Security

### API Self-Guard
`POST /api/setup` does NOT rely on middleware alone. The handler:
1. Checks rate limit (3 req/min per IP)
2. Opens a DB transaction
3. `SELECT value FROM system_settings WHERE key = 'setup' FOR UPDATE`
4. If `configured = true` → ROLLBACK → 403
5. Validates all input with Zod
6. Hashes admin password with bcrypt (rounds=12)
7. Creates workspace record
8. Creates admin user (role=admin)
9. Encrypts SMTP password (AES-256-CBC, SSH_ENCRYPTION_KEY)
10. Saves config row to system_settings
11. Sets configured = true
12. COMMITS
13. Sets `vantage_setup_done=1` cookie (httpOnly)

This prevents TOCTOU race conditions — concurrent setup requests cannot both succeed.

### Password Handling
Auth is custom JWT + bcrypt (not Clerk). The admin account step collects name, email, and password. Password is validated (min 8 chars, confirmed), then hashed with bcrypt (rounds=12) before storage in the `users` table. The plaintext password never touches the DB.

### SMTP Credentials Encryption
SMTP password is encrypted at rest using `AES-256-CBC` with `SSH_ENCRYPTION_KEY` (already required env var, 64-char hex = 32 bytes). Follows the same pattern as `apps/api/src/lib/ssh-crypto.ts`. The `GET /api/setup/status` endpoint returns only `{ configured: boolean }` — no credentials ever exposed.

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
| Password | password | yes (min 8 chars) |
| Confirm password | password | yes (must match) |

Display note: *"This creates the first admin account. You'll use these credentials to log in after setup completes."*

Auth is custom JWT + bcrypt (not Clerk). Password is hashed with bcrypt before storage.

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

## Environment Variables

No new env vars required. SMTP encryption reuses `SSH_ENCRYPTION_KEY` (already required by the API).

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
