# Mail Feature Design

**Goal:** Per-user email inbox inside Vantage — connect Gmail or company IMAP mail, view/send/manage emails, auto-linked to contacts.

**Architecture:** Two providers (Gmail API + IMAP/SMTP) behind a shared `MailProvider` abstraction. Background sync worker (Bull + Redis) stores emails locally in Postgres. UI reads from DB only — never hits provider directly at render time.

**Tech Stack:** `googleapis` (Gmail API + OAuth2), `imapflow` (IMAP), `nodemailer` (SMTP), Bull queue (sync jobs), `@google-cloud/local-auth` (dev OAuth), Kysely (DB), Next.js App Router (UI), TanStack Query (data fetching).

---

## Providers

### Gmail
- Connect via Google OAuth2 (`googleapis`).
- Read emails via Gmail REST API (threads, messages, history).
- Send via Gmail API (`users.messages.send`).
- Incremental sync via `historyId` — only fetch changes since last sync.
- Tokens (access + refresh) stored encrypted in DB.

### Company Mail (IMAP/SMTP)
- Connect by entering IMAP + SMTP credentials (host, port, user, password, SSL).
- Read via `imapflow` (modern IMAP client).
- Send via `nodemailer`.
- Incremental sync via `UIDVALIDITY` + `UIDNEXT`.
- Credentials stored encrypted in DB (AES-256-GCM, same pattern as SSH keypairs).

---

## Data Model

### `email_accounts`
```
id              uuid PK generated
user_id         uuid FK → users
workspace_id    uuid FK → workspaces
provider        'gmail' | 'imap'
email           string                        -- connected address
display_name    string | null

-- Gmail only (null for IMAP)
access_token    string | null                 -- encrypted
refresh_token   string | null                 -- encrypted
gmail_history_id string | null               -- for incremental sync

-- IMAP only (null for Gmail)
imap_host       string | null
imap_port       number | null
imap_user       string | null
imap_pass       string | null                 -- encrypted
smtp_host       string | null
smtp_port       number | null
smtp_user       string | null
smtp_pass       string | null                 -- encrypted
use_ssl         boolean default true

-- Sync state
sync_status     'idle' | 'syncing' | 'error'  default 'idle'
sync_error      string | null                 -- last error message
last_synced_at  string | null
created_at      string generated
updated_at      string generated
```

### `emails`
```
id              uuid PK generated
account_id      uuid FK → email_accounts
workspace_id    uuid FK → workspaces
user_id         uuid FK → users
message_id      string                        -- provider's unique ID (unique per account)
thread_id       string | null                 -- Gmail thread ID or IMAP conversation
subject         string | null
from_address    string
from_name       string | null
to_addresses    jsonb                         -- string[]
cc_addresses    jsonb                         -- string[]
bcc_addresses   jsonb                         -- string[]
body_html       string | null
body_text       string | null
snippet         string | null                 -- first 200 chars of body_text
folder          'inbox' | 'sent' | 'drafts' | 'trash' | 'spam'
is_read         boolean default false
is_starred      boolean default false
sent_at         string                        -- ISO timestamp from provider
synced_at       string generated
contact_id      uuid | null FK → contacts     -- auto-linked at sync time (by email address match)
deal_id         uuid | null FK → deals        -- reserved for future use; not set in v1
```

Unique constraint: `(account_id, message_id)` — prevents duplicate sync.

### `email_attachments`
```
id              uuid PK generated
email_id        uuid FK → emails
filename        string
size_bytes      number
mime_type       string
storage_key     string                        -- R2 object key (uploaded during sync)
created_at      string generated
```

---

## Sync Worker

**Location:** `apps/api/src/workers/mail-sync.ts`

**Job types (Bull queue `mail-sync`):**
- `full-sync` — triggered on account connect; paginate all messages, insert to DB
- `incremental-sync` — triggered every 5 min per account; fetch only new/changed since last sync
- `send-email` — triggered on send request; calls provider API/SMTP then syncs sent message back

**Full sync flow:**
1. Fetch all message IDs from provider (paginated)
2. For each message: fetch metadata + body
3. Insert into `emails` (skip if `(account_id, message_id)` already exists)
4. Auto-link: look up `from_address` and each `to_addresses` entry against `contacts.email` in same workspace → set `contact_id` (first match wins)
5. Update `email_accounts.sync_status = 'idle'`, `last_synced_at = now()`

**Incremental sync flow (Gmail):**
1. Call `users.history.list` with `startHistoryId = gmail_history_id`
2. Process added/removed/label-changed messages
3. Update `gmail_history_id` to latest

**Incremental sync flow (IMAP):**
1. Open mailbox, check `UIDVALIDITY` matches stored value (if not, re-full-sync)
2. Fetch UIDs > stored `UIDNEXT - 1`
3. Insert new emails

**Error handling:** On failure, set `sync_status = 'error'`, `sync_error = message`. Retry with exponential backoff (Bull built-in).

---

## API Routes

All routes under `/api/mail`, require `requireAuth` middleware, scoped to `req.user.id`.

### Account Management
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mail/accounts` | List user's connected accounts |
| POST | `/api/mail/accounts/gmail/auth-url` | Generate Google OAuth2 URL |
| GET | `/api/mail/accounts/gmail/callback` | OAuth callback — exchange code for tokens, save account, enqueue full-sync |
| POST | `/api/mail/accounts/imap` | Connect IMAP account (validate credentials first, then save + enqueue full-sync) |
| DELETE | `/api/mail/accounts/:id` | Disconnect — delete account + all emails for this account |
| POST | `/api/mail/accounts/:id/sync` | Trigger manual incremental sync |

### Email Operations
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mail/emails` | List emails (paginated). Query: `account_id`, `folder`, `contact_id`, `q` (FTS on subject/snippet), `page`, `per_page` |
| GET | `/api/mail/emails/:id` | Get full email with attachments |
| POST | `/api/mail/send` | Send email. Body: `account_id`, `to`, `cc?`, `bcc?`, `subject`, `body_html`, `reply_to_message_id?` |
| PATCH | `/api/mail/emails/:id` | Update: `is_read?`, `is_starred?`, `folder?` |
| DELETE | `/api/mail/emails/:id` | Move to trash (set `folder = 'trash'`, mirror to provider) |

---

## UI

### `/mail` — Main Mail Page

Three-pane layout matching Vantage design system:

**Left pane (folder sidebar):**
- Account switcher (dropdown if multiple accounts)
- Folder list: Inbox, Sent, Starred, Trash
- Unread count badge on Inbox
- "Connect account" link → `/settings?tab=mail`

**Middle pane (email list):**
- Paginated list, newest first
- Each row: sender name, subject, snippet, relative time, unread dot, linked contact chip
- Click row → loads detail in right pane
- Search bar (FTS on subject/snippet)

**Right pane (email detail):**
- Subject, from/to/cc, sent time
- Body (render `body_html` in sandboxed iframe; fallback to `body_text`)
- Linked contact badge (if `contact_id` set) → links to `/contacts/:id`
- Attachments list with download links
- Reply button → pre-fills compose modal

**Compose modal:**
- Triggered by "Compose" button (top of left pane)
- Fields: From (account selector), To, Cc (optional), Subject, body (contenteditable rich text — bold/italic/link only)
- Send button → POST `/api/mail/send`

### `/settings` — Mail Tab

- List connected accounts (email, provider badge, sync status, last synced)
- "Connect Gmail" button → OAuth flow
- "Connect company mail" → inline form (IMAP host/port/user/pass + SMTP host/port/user/pass + SSL toggle)
- Disconnect button per account (confirms before deleting)
- Manual sync button per account

### Contact Detail — Emails Tab

- New "Emails" tab on `/contacts/:id` page
- Calls `GET /api/mail/emails?contact_id=:id`
- Shows email list (subject, snippet, date) — click to open full email in a drawer

### Sidebar Nav

Add **Mail** entry to CRM section in `Sidebar.tsx` (between Activity and the section divider):
```tsx
{ href: '/mail', label: 'Mail', icon: <EnvelopeIcon /> }
```

---

## Security

- All OAuth tokens and IMAP/SMTP passwords encrypted at rest (AES-256-GCM, same pattern as `workspace_ssh_keypairs`).
- Encryption key from `MAIL_ENCRYPTION_KEY` env var.
- Email bodies stored as-is in DB — rendered in sandboxed iframe on client to prevent XSS.
- OAuth callback validates `state` param (CSRF protection) — state = signed JWT with user_id, expires 10 min.
- All API routes verify `account.user_id === req.user.id` before any read/write.

---

## Environment Variables

```
GOOGLE_CLIENT_ID=          # Gmail OAuth app client ID
GOOGLE_CLIENT_SECRET=      # Gmail OAuth app client secret
GOOGLE_REDIRECT_URI=       # e.g. http://localhost:3001/api/mail/accounts/gmail/callback
MAIL_ENCRYPTION_KEY=       # 32-byte hex key for encrypting tokens/passwords
```

---

## Out of Scope (v1)

- Gmail push notifications (Pub/Sub) — polling every 5 min is sufficient for v1
- Attachment upload when composing (download only)
- Drafts management
- Email open tracking
- Multiple accounts sending from same compose window
- Spam folder management
