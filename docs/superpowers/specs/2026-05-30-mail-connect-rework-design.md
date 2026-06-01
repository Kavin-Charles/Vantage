# Mail Connect Rework — Design Spec

**Date:** 2026-05-30
**Status:** Approved

---

## Overview

Rework the mail account connection system so that:
- Admins configure shared IMAP/SMTP server settings once per workspace.
- Individual users connect their own mailbox with email + password only.
- Gmail users connect via OAuth (unchanged, per-user).
- The settings page is a clean flat list with a single "Connect account" modal.

---

## Architecture

### New DB Table

```sql
CREATE TABLE workspace_imap_config (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  imap_host    text NOT NULL,
  imap_port    int  NOT NULL,
  smtp_host    text NOT NULL,
  smtp_port    int  NOT NULL,
  use_ssl      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```

One row per workspace. Upserted by admins. No migration to existing `email_accounts` data needed.

### New/Modified Files

| File | Change |
|---|---|
| `packages/db/migrations/NNNN_workspace_imap_config.ts` | New migration |
| `packages/db/src/types.ts` | Add `WorkspaceImapConfig` type + `workspace_imap_config` to `Database` |
| `apps/api/src/routes/mail-config.ts` | New router: GET + PUT `/api/mail/workspace-config` |
| `apps/api/src/routes/mail-accounts.ts` | Add `POST /imap/test`; modify `POST /imap` to fetch workspace config server-side when host/port omitted |
| `apps/api/src/index.ts` | Register `createMailConfigRouter` |
| `apps/web/app/(dashboard)/settings/mail/page.tsx` | Full rewrite |
| `apps/web/components/mail/ConnectAccountModal.tsx` | New component |

---

## Settings Page Layout

```
Settings → Mail
┌─ [Admin only] Workspace Mail Server card ────────────────┐
│  IMAP host [input]  Port [input]                         │
│  SMTP host [input]  Port [input]  SSL [toggle]           │
│  [Save]                                                  │
└──────────────────────────────────────────────────────────┘

Your accounts
  [icon] email@company.com   [status badge]   [Disconnect]
  [icon] other@gmail.com     [status badge]   [Disconnect]

[Connect account]  ← opens ConnectAccountModal
```

- Status badge: `idle` → "Synced 2h ago" | `syncing` → "Syncing…" | `error` → "Error: {msg}" (amber/red text).
- No "Sync now" button — sync is automated.
- Disconnect button triggers `DELETE /api/mail/accounts/:id` with confirmation dialog.

---

## ConnectAccountModal

Single modal, multi-step per provider.

### Step 0 — Provider Picker
Two buttons: **Gmail** | **Company mail**

### Gmail path (Step 1)
Show "Redirecting to Google…" message, immediately call `POST /api/mail/accounts/gmail/auth-url`, navigate to returned URL. Modal closes on navigation.

### Company mail path — workspace config exists
Step 1 (only step):
- Email address input
- Password input (`type="password"`)
- Server settings display (locked, greyed): `imap.company.com:993 · smtp.company.com:587`
- [Connect] button

On Connect:
1. `POST /api/mail/accounts/imap/test` — verifies creds against workspace config.
2. If ok: `POST /api/mail/accounts/imap` with `{ email, imap_pass, smtp_pass }`.
3. Success → close modal, refresh account list.
4. Error → inline error message below inputs.

### Company mail path — no workspace config, user is admin
Step 1 (only step):
- Email address input
- Password input
- Expanded server settings (editable): IMAP host, IMAP port, SMTP host, SMTP port, SSL toggle
- [Connect] button

On Connect:
1. `PUT /api/mail/workspace-config` — saves server settings.
2. `POST /api/mail/accounts/imap/test` — verifies creds.
3. If ok: `POST /api/mail/accounts/imap` with full fields.
4. Error → inline error, workspace config already saved (idempotent on retry).

### Company mail path — no workspace config, user is not admin
Step 1:
- Static message: "Your admin hasn't configured the company mail server yet. Ask them to set it up in Settings → Mail."
- No form. [Close] button only.

---

## API Endpoints

### `GET /api/mail/workspace-config`
- Auth: requireAuth
- Returns workspace's IMAP config or `{ data: null, error: null }` if not set.

### `PUT /api/mail/workspace-config`
- Auth: requireAuth + requireAdmin
- Body: `{ imap_host, imap_port, smtp_host, smtp_port, use_ssl }`
- Upserts `workspace_imap_config` for current workspace.
- Returns saved config.

### `POST /api/mail/accounts/imap/test`
- Auth: requireAuth
- Body: `{ email, imap_pass, smtp_pass }`
- Fetches workspace IMAP config server-side (400 if not configured).
- Opens real IMAP connection (imapflow), attempts AUTH, closes immediately.
- Timeout: 8 seconds.
- Returns `{ data: { ok: true }, error: null }` or 400 with `{ error: { code, message } }` (message is the raw IMAP error for display).

### `POST /api/mail/accounts/imap` (modified)
- Existing endpoint, backward-compatible.
- If `imap_host` omitted in body: fetches workspace config server-side to fill host/port/ssl fields.
- If `imap_host` provided: uses provided values (admin first-connect path).
- Stores `imap_pass` and `smtp_pass` encrypted (unchanged).

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| IMAP auth failure | 400 with raw IMAP error message shown inline |
| IMAP timeout (8s) | 400 "Connection timed out — check host and port" |
| No workspace config on test | 400 "Workspace mail server not configured" |
| Admin save fails | Inline error in server settings section of modal |
| Gmail OAuth error | Existing redirect-to-frontend error handling (unchanged) |

---

## Out of Scope

- Per-user IMAP server override (all users share workspace config)
- IMAP auto-detect from domain (removed — admin sets explicitly)
- Sync-now button
- Multiple workspace IMAP configs
