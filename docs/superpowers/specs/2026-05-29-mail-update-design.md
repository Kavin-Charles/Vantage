# Mail Update — Phase 4 Design

**Goal:** Real-time email delivery to the browser + deeper CRM integration (deal linking, activity logging, compose from contact/deal context).

**Builds on:** `docs/superpowers/specs/2026-05-15-mail-design.md` (v1 mail system). This spec extends it; all v1 decisions still apply.

---

## Scope

1. **Real-time delivery** — new emails pushed to browser via WebSocket; no polling, no manual refresh
2. **Deal auto-linking** — emails matched to open deals at sync time via contact
3. **Activity logging** — inbound and outbound emails appear in CRM activity timeline
4. **Compose from CRM** — "Send email" button on contact/deal pages opens pre-filled compose modal

---

## Architecture

Gmail Pub/Sub and IMAP IDLE both feed into the existing Bull queue. After a sync job inserts emails, the worker publishes to Redis pub/sub. A WebSocket handler (per-user) subscribes to the Redis channel and pushes payloads to the browser. TanStack Query cache is updated on receipt — no refetch needed.

```
Gmail Pub/Sub webhook ──┐
                         ├──► Bull queue ──► sync worker ──► Postgres
IMAP IDLE / polling  ───┘                        │
                                                  ├──► Redis PUBLISH mail:user:{userId}
                                                  └──► Activity insert
                                                           │
                                          Redis SUB ───────┘
                                               │
                                          WS handler ──► browser (cache update)
```

**WebSocket:** one persistent connection per authenticated user at `/api/mail/ws`. Auth via signed session token in query param (`?token=...`). On connect, server subscribes to `mail:user:{userId}` Redis channel. On disconnect, unsubscribes. Project already has WS infrastructure (SFTP) — same pattern.

**Gmail Pub/Sub:** Google pushes to `POST /api/mail/webhook/gmail`. Server verifies token, enqueues `incremental-sync` for the affected account. Watch registered via `users.watch()` on account connect; expires every 7 days — renewed by daily cron.

**IMAP IDLE:** long-lived worker process (`imap-idle.ts`) maintains one IMAP IDLE connection per active IMAP account. On new-message notification, enqueues `incremental-sync`. Restarts on disconnect with exponential backoff (max 60s). Falls back to 5-min polling if server does not support IDLE.

---

## Data Model Changes

### `emails` table — two new columns

```sql
ALTER TABLE emails
  ADD COLUMN deal_id     uuid REFERENCES deals(id) ON DELETE SET NULL,
  ADD COLUMN activity_id uuid REFERENCES activity(id) ON DELETE SET NULL;
```

- `deal_id` — set at sync time. Null if no open deal found for the contact.
- `activity_id` — back-ref to the Activity record created for this email. Null for emails synced before this update (backfill not required).

### `activity` table — no schema change

`type = 'email'` already exists. `meta` jsonb stores:

```json
{
  "email_id": "uuid",
  "direction": "inbound" | "outbound",
  "subject": "string",
  "snippet": "string"
}
```

### `email_accounts` table — one new column

```sql
ALTER TABLE email_accounts
  ADD COLUMN gmail_watch_expiry timestamptz;
```

Used by the renewal cron to skip accounts whose watch is still valid.

### No new tables.

---

## API Changes

### New routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/mail/webhook/gmail` | Gmail Pub/Sub push. Verifies `X-Goog-Channel-Token` header, enqueues incremental sync for the account matching the push notification's `emailAddress`. Returns 204. |
| `WS` | `/api/mail/ws` | WebSocket connection. Query param `token` = signed session JWT. On auth success, subscribes to `mail:user:{userId}` Redis channel. Pushes `{ type: 'new_email', email: EmailRow }` on receive. |

### Modified routes

| Method | Path | Change |
|--------|------|--------|
| `GET` | `/api/mail/emails` | Add `deal_id` query param — filter emails by deal |
| `POST` | `/api/mail/send` | Accept optional `deal_id` in body — attached to sent email + activity record |
| `POST` | `/api/mail/accounts/gmail/auth-url` | After OAuth, also call `users.watch()` and store expiry |

### No removed routes.

---

## Sync Worker Changes

**Location:** `apps/api/src/workers/mail-sync.ts`

After every new email inserted (both full-sync and incremental-sync):

1. **Deal auto-link** — if `contact_id` is set, query open deals (`stage NOT IN ('won', 'lost')`) for that contact ordered by `updated_at DESC`, take first result, set `deal_id`. Skip if no contact or no open deals.
2. **Activity emit** — insert `Activity` record: `type='email'`, `workspace_id`, `user_id`, `contact_id`, `deal_id`, `meta={ email_id, direction:'inbound', subject, snippet }`.
3. **Redis publish** — `PUBLISH mail:user:{userId} <JSON>` where JSON is the full email row (same shape as `GET /api/mail/emails/:id` response).

On `send-email` job completion:
- Same deal-link + activity emit with `direction: 'outbound'`.
- Redis publish after sent message is synced back from provider.

---

## New Workers / Crons

### `apps/api/src/workers/imap-idle.ts`

- Spawned as a long-lived process alongside the main API.
- On startup: query all active IMAP accounts, open IMAP IDLE connection per account via `imapflow`.
- On `exists` event (new mail): enqueue `incremental-sync` for that account.
- On disconnect: exponential backoff reconnect (1s → 2s → 4s … 60s cap).
- Falls back to 5-min polling if `imapflow` IDLE not supported by server.
- Tracks connections in `Map<accountId, ImapFlow>`.

### `gmail-watch-renew` cron

- Schedule: daily at 02:00 UTC.
- Query all Gmail accounts where `gmail_watch_expiry < now() + interval '1 day'`.
- Call `users.watch()` for each, update `gmail_watch_expiry`.
- Protected by `CRON_SECRET` header (existing pattern).

---

## UI Changes

### `useMailSocket()` hook — new

`apps/web/src/hooks/useMailSocket.ts`

- Opens WS to `/api/mail/ws?token=...` on mount, closes on unmount.
- On `new_email` message: calls `queryClient.setQueryData` to prepend email to active folder cache.
- Updates unread count in sidebar nav atom/store.
- Reconnects on disconnect (same exponential backoff pattern as other WS hooks).

### `/mail` page

- Add `useMailSocket()` on page mount.
- New email rows animate in (CSS slide-down, 200ms) so user sees arrival without jarring jump.
- Sidebar unread badge updates live from hook.

### Deal detail page — Emails tab

- New "Emails" tab added to deal detail (alongside existing tabs).
- Calls `GET /api/mail/emails?deal_id=:id`.
- Same list UI as contact Emails tab (subject, snippet, date, direction badge).
- "Send email" button in tab header → opens compose modal pre-filled with deal's primary contact email + `deal_id` in context.

### Contact detail page — Emails tab (existing, extended)

- Add "Send email" button to tab header (mirrors deal pattern).
- Compose modal pre-filled with contact email.

### Compose modal (additions to v1)

- Hidden `deal_id` field — set when modal opened from deal context.
- On successful send: optimistic activity record inserted into contact/deal activity timeline.

### Activity feed (existing, extended)

- Email activity items: envelope icon, subject truncated to 60 chars, direction badge ("Received" / "Sent"), relative time, linked contact + deal chips.
- Clicking item navigates to full email in `/mail` (opens to that message).

---

## Security

- Gmail Pub/Sub webhook: verify `X-Goog-Channel-Token` matches `GMAIL_PUBSUB_TOKEN` env var. Reject with 401 if mismatch.
- WS auth: validate signed JWT in `token` query param before subscribing to Redis channel. Reject on expiry or invalid signature.
- Deal-link query scoped to `workspace_id` — no cross-workspace data access.
- All new API routes pass through existing `requireWorkspace` middleware.

---

## Environment Variables Added

```
GMAIL_PUBSUB_TOKEN=     # Verification token for Gmail Pub/Sub push webhook
```

---

## Migration

Two migrations required:

1. `add_deal_id_activity_id_to_emails` — adds `deal_id`, `activity_id` columns to `emails`
2. `add_gmail_watch_expiry_to_email_accounts` — adds `gmail_watch_expiry` to `email_accounts`

Backfill not required for existing rows.

---

## Out of Scope

- Attachment upload in compose (v1 out-of-scope, still deferred)
- Drafts management
- Email open tracking
- Spam folder management
- Multiple accounts in single compose window
- Mobile push notifications for new email
