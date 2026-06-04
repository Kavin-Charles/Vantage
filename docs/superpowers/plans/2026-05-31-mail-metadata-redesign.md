# Mail Metadata Redesign + Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch mail storage to metadata-only (no email bodies stored in DB), add live body fetch, and fix three active bugs: JSONB insert crash on sync, infinite setup redirect loop, and OAuth callback landing on login page.

**Architecture:** Remove `body_html`/`body_text` columns from `emails` table. Sync workers store metadata only (subject, snippet, from, folder, flags). A new `GET /api/mail/emails/:id/body` endpoint fetches the full message live from IMAP/Gmail on demand. Three bug fixes are independent of the redesign and can be applied cleanly.

**Tech Stack:** Kysely migrations, ImapFlow, googleapis, Next.js 14 App Router route handlers, Express

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/db/migrations/20260531_001_mail_body_drop.ts` | Drop body_html/body_text columns |
| Modify | `packages/db/src/schema.ts` | Remove body fields from EmailTable |
| Modify | `apps/api/src/lib/mail-provider.ts` | Remove body from FetchedEmail; add fetchBody method |
| Modify | `apps/api/src/lib/gmail-provider.ts` | Use metadata format for sync; implement fetchBody |
| Modify | `apps/api/src/lib/imap-provider.ts` | Remove source from sync fetch; implement fetchBody |
| Modify | `apps/api/src/workers/mail-sync.ts` | Remove body from insert; JSON.stringify JSONB arrays |
| Create | `apps/api/src/routes/mail-body.ts` | GET /api/mail/emails/:id/body live fetch |
| Modify | `apps/api/src/routes/mail-emails.ts` | Remove body_html/body_text from sent email insert |
| Modify | `apps/api/src/index.ts` | Register mail-body router |
| Modify | `apps/api/src/routes/auth.ts` | Change sameSite: 'strict' → 'lax' on vencore_token |
| Create | `apps/web/app/api/setup/activate/route.ts` | Set vencore_setup_done cookie + redirect |
| Modify | `apps/web/app/setup/page.tsx` | Redirect to /api/setup/activate instead of / |
| Modify | `apps/web/middleware.ts` | Pass `from` param when redirecting to /setup |
| Modify | `apps/web/hooks/useMailSocket.ts` | Remove body_html/body_text from MailSocketEmail |
| Modify | `apps/web/app/(dashboard)/mail/page.tsx` | Remove body from Email interface |
| Modify | `apps/web/components/mail/EmailDetail.tsx` | Fetch body on open; loading state |

---

## Task 1: DB Migration + Schema Types

**Files:**
- Create: `packages/db/migrations/20260531_001_mail_body_drop.ts`
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Create migration**

```typescript
// packages/db/migrations/20260531_001_mail_body_drop.ts
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('emails').dropColumn('body_html').execute();
  await db.schema.alterTable('emails').dropColumn('body_text').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('emails').addColumn('body_html', 'text').execute();
  await db.schema.alterTable('emails').addColumn('body_text', 'text').execute();
}
```

- [ ] **Step 2: Update EmailTable in schema.ts**

In `packages/db/src/schema.ts`, find `EmailTable` and remove the `body_html` and `body_text` lines:

```typescript
// Remove these two lines from EmailTable:
//   body_html: string | null;
//   body_text: string | null;
```

The interface after removal should go from `bcc_addresses` directly to `snippet`:

```typescript
export interface EmailTable {
  id: Generated<string>;
  account_id: string;
  workspace_id: string;
  user_id: string;
  message_id: string;
  thread_id: string | null;
  subject: string | null;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  snippet: string | null;
  folder: Generated<'inbox' | 'sent' | 'drafts' | 'trash' | 'spam'>;
  is_read: Generated<boolean>;
  is_starred: Generated<boolean>;
  sent_at: string;
  synced_at: Generated<string>;
  contact_id: string | null;
  deal_id: string | null;
}
```

- [ ] **Step 3: Run migration**

```bash
cd apps/api && npx tsx src/migrate.ts
```

Expected: migration `20260531_001_mail_body_drop` runs successfully.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd packages/db && npx tsc --noEmit
```

Expected: 0 errors. (If errors, body_html/body_text are referenced elsewhere — fix those references first.)

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/20260531_001_mail_body_drop.ts packages/db/src/schema.ts
git commit -m "feat(db): drop body_html/body_text from emails table"
```

---

## Task 2: Remove Body from Providers + Fix JSONB in storeEmails

**Files:**
- Modify: `apps/api/src/lib/mail-provider.ts`
- Modify: `apps/api/src/lib/gmail-provider.ts`
- Modify: `apps/api/src/lib/imap-provider.ts`
- Modify: `apps/api/src/workers/mail-sync.ts`
- Test: `apps/api/src/__tests__/mail-accounts.test.ts` (update existing tests)

This task has two sub-goals:
1. Remove `body_html`/`body_text` from the sync path (providers + storeEmails)
2. Fix the JSONB bug: `storeEmails` passes raw JS arrays for JSONB columns without `JSON.stringify`, causing `ERROR: invalid input syntax for type json`

- [ ] **Step 1: Write failing test for JSONB fix**

In `apps/api/src/__tests__/mail-accounts.test.ts` (or a new `apps/api/src/__tests__/mail-sync.test.ts`), add a test that verifies `storeEmails` handles arrays with multiple email addresses without throwing:

```typescript
// apps/api/src/__tests__/mail-sync.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeEmailsForTest } from '../workers/mail-sync';

const insertMock = vi.fn().mockReturnThis();
const onConflictMock = vi.fn().mockReturnThis();
const returningAllMock = vi.fn().mockReturnThis();
const executeTakeFirstMock = vi.fn().mockResolvedValue(null);

const db = {
  insertInto: () => ({
    values: (vals: unknown) => {
      insertMock(vals);
      return {
        onConflict: () => ({
          returningAll: () => ({ executeTakeFirst: executeTakeFirstMock }),
        }),
      };
    },
  }),
  selectFrom: () => ({ where: () => ({ select: () => ({ executeTakeFirst: vi.fn().mockResolvedValue(null) }) }) }),
} as any;

describe('storeEmails JSONB', () => {
  beforeEach(() => insertMock.mockClear());

  it('JSON.stringifies address arrays for JSONB columns', async () => {
    await storeEmailsForTest(db, 'acc-1', 'ws-1', 'user-1', [{
      message_id: 'msg-1',
      thread_id: null,
      subject: 'Test',
      from_address: 'a@example.com',
      from_name: null,
      to_addresses: ['b@example.com', 'c@example.com'],
      cc_addresses: [],
      bcc_addresses: [],
      snippet: null,
      folder: 'inbox',
      is_read: false,
      is_starred: false,
      sent_at: new Date().toISOString(),
    }]);

    const vals = insertMock.mock.calls[0]?.[0];
    expect(vals.to_addresses).toBe('["b@example.com","c@example.com"]');
    expect(vals.cc_addresses).toBe('[]');
    expect(vals.bcc_addresses).toBe('[]');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/api && npx vitest run src/__tests__/mail-sync.test.ts
```

Expected: FAIL — `to_addresses` is an array, not a string.

- [ ] **Step 3: Update FetchedEmail in mail-provider.ts**

Remove `body_html` and `body_text` from the `FetchedEmail` interface:

```typescript
// apps/api/src/lib/mail-provider.ts
export interface FetchedEmail {
  message_id: string;
  thread_id: string | null;
  subject: string | null;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  // body_html and body_text removed — bodies are never stored, fetched live on demand
  snippet: string | null;
  folder: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam';
  is_read: boolean;
  is_starred: boolean;
  sent_at: string; // ISO timestamp
}
```

Leave `SyncCursor`, `SendEmailParams`, and `MailProvider` unchanged.

- [ ] **Step 4: Update gmail-provider.ts — use metadata format**

In `apps/api/src/lib/gmail-provider.ts`, change `getMessage` to use `format: 'metadata'` (fetches headers + snippet, no body). This is much faster and cheaper:

```typescript
async function getMessage(id: string): Promise<FetchedEmail | null> {
  try {
    const { data } = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'To', 'Cc', 'Bcc', 'Date'],
    });
    const headers = data.payload?.headers ?? [];
    const h = (name: string) => headers.find(x => x.name?.toLowerCase() === name)?.value ?? null;
    const { address: from_address, name: from_name } = parseFrom(h('from') ?? '');
    const labels = data.labelIds ?? [];

    return {
      message_id: data.id!,
      thread_id: data.threadId ?? null,
      subject: h('subject'),
      from_address,
      from_name,
      to_addresses: parseAddressList(h('to')),
      cc_addresses: parseAddressList(h('cc')),
      bcc_addresses: parseAddressList(h('bcc')),
      snippet: data.snippet?.slice(0, 300) ?? null,
      folder: labelToFolder(labels),
      is_read: !labels.includes('UNREAD'),
      is_starred: labels.includes('STARRED'),
      sent_at: new Date(Number(data.internalDate)).toISOString(),
    };
  } catch {
    return null;
  }
}
```

Remove the `parseParts` function and all `body_html`/`body_text` variables from this file — they are no longer needed for the sync path.

- [ ] **Step 5: Update imap-provider.ts — remove source fetch**

In `apps/api/src/lib/imap-provider.ts`, in both `fetchAll` and `fetchIncremental`, change the `client.fetch` call to use `envelope: true` without `source: true`. Remove the raw source body extraction. Keep snippet from subject fallback:

In `fetchAll`, change:
```typescript
for await (const msg of client.fetch('1:*', { envelope: true, source: true })) {
  const env = msg.envelope;
  if (!env) continue;
  const raw = msg.source?.toString('utf8') ?? '';
  const bodyStart = raw.indexOf('\r\n\r\n');
  const body_text = bodyStart !== -1 ? raw.slice(bodyStart + 4, bodyStart + 50004).trim() : null;

  emails.push({
    // ...
    body_html: null,
    body_text: body_text || null,
    snippet: body_text?.slice(0, 200) ?? null,
    // ...
  });
```

To:
```typescript
for await (const msg of client.fetch('1:*', { envelope: true })) {
  const env = msg.envelope;
  if (!env) continue;

  emails.push({
    message_id: env.messageId ?? `imap-${mailboxName}-${msg.uid}`,
    thread_id: null,
    subject: env.subject ?? null,
    from_address: env.from?.[0]?.address ?? '',
    from_name: env.from?.[0]?.name ?? null,
    to_addresses: (env.to ?? []).map(a => a.address).filter((a): a is string => Boolean(a)),
    cc_addresses: (env.cc ?? []).map(a => a.address).filter((a): a is string => Boolean(a)),
    bcc_addresses: (env.bcc ?? []).map(a => a.address).filter((a): a is string => Boolean(a)),
    snippet: env.subject?.slice(0, 200) ?? null,
    folder,
    is_read: msg.flags?.has('\\Seen') ?? false,
    is_starred: msg.flags?.has('\\Flagged') ?? false,
    sent_at: env.date?.toISOString() ?? new Date().toISOString(),
  });
```

Make the same change in `fetchIncremental` (change `client.fetch(\`${cursor.uidnext}:*\`, { envelope: true, source: true }, { uid: true })` to remove `source: true` and remove the body_text/body_html lines).

- [ ] **Step 6: Fix storeEmails in mail-sync.ts**

In `apps/api/src/workers/mail-sync.ts`, in the `storeEmails` function:

1. Remove `body_html` and `body_text` from the `.values({...})` insert.
2. Fix the JSONB arrays — replace `as unknown as string[]` with `JSON.stringify(...)`:

```typescript
const inserted = await db
  .insertInto('emails')
  .values({
    account_id: accountId,
    workspace_id: workspaceId,
    user_id: userId,
    message_id: email.message_id,
    thread_id: email.thread_id,
    subject: email.subject,
    from_address: email.from_address,
    from_name: email.from_name,
    to_addresses: JSON.stringify(email.to_addresses) as unknown as string[],
    cc_addresses: JSON.stringify(email.cc_addresses) as unknown as string[],
    bcc_addresses: JSON.stringify(email.bcc_addresses) as unknown as string[],
    snippet: email.snippet,
    folder: email.folder,
    is_read: email.is_read,
    is_starred: email.is_starred,
    sent_at: email.sent_at,
    contact_id: contactId,
    deal_id: dealId,
  })
  .onConflict(oc => oc.columns(['account_id', 'message_id']).doNothing())
  .returningAll()
  .executeTakeFirst();
```

- [ ] **Step 7: Run tests**

```bash
cd apps/api && npx vitest run src/__tests__/mail-sync.test.ts
```

Expected: PASS — `to_addresses` is the JSON string `'["b@example.com","c@example.com"]'`.

- [ ] **Step 8: Run full test suite**

```bash
cd apps/api && npx vitest run
```

Expected: all tests pass. (TypeScript errors about removed body fields are OK to fix inline.)

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/lib/mail-provider.ts apps/api/src/lib/gmail-provider.ts apps/api/src/lib/imap-provider.ts apps/api/src/workers/mail-sync.ts apps/api/src/__tests__/mail-sync.test.ts
git commit -m "feat(mail): metadata-only sync — remove body from providers, fix JSONB insert"
```

---

## Task 3: Add fetchBody to MailProvider + Implement for Gmail and IMAP

**Files:**
- Modify: `apps/api/src/lib/mail-provider.ts`
- Modify: `apps/api/src/lib/gmail-provider.ts`
- Modify: `apps/api/src/lib/imap-provider.ts`

The `fetchBody(messageId)` method fetches the full email body live from the provider. Called only when a user opens a specific email.

- [ ] **Step 1: Add fetchBody to MailProvider interface**

In `apps/api/src/lib/mail-provider.ts`, add `fetchBody` to the `MailProvider` interface:

```typescript
export interface MailProvider {
  /** Full sync. Calls onBatch per page. Returns cursor for future incremental syncs. */
  fetchAll(onBatch: (emails: FetchedEmail[]) => Promise<void>): Promise<SyncCursor>;

  /**
   * Incremental sync since cursor.
   * Throws Error('HISTORY_EXPIRED') or Error('UIDVALIDITY_CHANGED') if full re-sync needed.
   */
  fetchIncremental(cursor: SyncCursor): Promise<{ emails: FetchedEmail[]; newCursor: SyncCursor }>;

  /**
   * Fetch the full body of a single message by its provider message_id.
   * Returns null fields if the message cannot be found.
   */
  fetchBody(messageId: string): Promise<{ body_html: string | null; body_text: string | null }>;

  /** Send an email. Returns provider's message_id. */
  sendEmail(params: SendEmailParams): Promise<{ message_id: string }>;

  /** Mirror a flag/folder change to the provider. */
  updateEmail(
    message_id: string,
    update: { is_read?: boolean; is_starred?: boolean; folder?: string },
  ): Promise<void>;
}
```

- [ ] **Step 2: Implement fetchBody in gmail-provider.ts**

In `apps/api/src/lib/gmail-provider.ts`, in the `return { ... }` object, add `fetchBody`:

```typescript
async fetchBody(messageId: string) {
  try {
    const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    const headers = data.payload?.headers ?? [];
    const h = (name: string) => headers.find(x => x.name?.toLowerCase() === name)?.value ?? null;

    let body_html: string | null = null;
    let body_text: string | null = null;

    function parseParts(parts: NonNullable<typeof data.payload>['parts']): void {
      if (!parts) return;
      for (const p of parts) {
        if (p.mimeType === 'text/html' && p.body?.data) {
          body_html ??= Buffer.from(p.body.data, 'base64url').toString('utf8');
        } else if (p.mimeType === 'text/plain' && p.body?.data) {
          body_text ??= Buffer.from(p.body.data, 'base64url').toString('utf8');
        }
        if (p.parts) parseParts(p.parts);
      }
    }

    if (data.payload?.body?.data) {
      const raw = Buffer.from(data.payload.body.data, 'base64url').toString('utf8');
      if (data.payload.mimeType === 'text/html') body_html = raw;
      else body_text = raw;
    } else {
      parseParts(data.payload?.parts);
    }

    return { body_html, body_text };
  } catch {
    return { body_html: null, body_text: null };
  }
},
```

- [ ] **Step 3: Implement fetchBody in imap-provider.ts**

In `apps/api/src/lib/imap-provider.ts`, add `fetchBody` to the returned object:

```typescript
async fetchBody(messageId: string) {
  const client = makeClient(opts);
  await client.connect();
  try {
    // Synthetic IDs from our sync have format: imap-{MAILBOXNAME}-{UID}
    // Real Message-ID headers are used otherwise.
    const syntheticMatch = messageId.match(/^imap-(.+)-(\d+)$/);

    let sourceStr: string | null = null;

    if (syntheticMatch) {
      const mailboxName = syntheticMatch[1]!;
      const uid = Number(syntheticMatch[2]);
      await client.mailboxOpen(mailboxName);
      for await (const msg of client.fetch([uid], { source: true }, { uid: true })) {
        sourceStr = msg.source?.toString('utf8') ?? null;
        break;
      }
    } else {
      // Search by Message-ID header across INBOX first, then Sent
      for (const mailboxName of ['INBOX', 'Sent', 'Sent Items', 'Sent Messages']) {
        try {
          await client.mailboxOpen(mailboxName);
          const uids = await client.search({ header: ['Message-Id', messageId] });
          if (uids.length > 0) {
            for await (const msg of client.fetch([uids[0]!], { source: true }, { uid: true })) {
              sourceStr = msg.source?.toString('utf8') ?? null;
              break;
            }
            if (sourceStr) break;
          }
        } catch { /* mailbox might not exist */ }
      }
    }

    if (!sourceStr) return { body_html: null, body_text: null };

    // Simple body extraction: everything after the blank line separating headers from body
    const bodyStart = sourceStr.indexOf('\r\n\r\n');
    if (bodyStart === -1) return { body_html: null, body_text: null };
    const body_text = sourceStr.slice(bodyStart + 4).trim() || null;
    return { body_html: null, body_text };
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
},
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: 0 errors related to `fetchBody`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/mail-provider.ts apps/api/src/lib/gmail-provider.ts apps/api/src/lib/imap-provider.ts
git commit -m "feat(mail): add fetchBody to MailProvider — live body fetch per provider"
```

---

## Task 4: Live Body Fetch Route

**Files:**
- Create: `apps/api/src/routes/mail-body.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/__tests__/mail-body.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/__tests__/mail-body.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createMailBodyRouter } from '../routes/mail-body';

const mockFetchBody = vi.fn();
vi.mock('../lib/gmail-provider', () => ({
  createGmailProvider: () => ({ fetchBody: mockFetchBody }),
}));
vi.mock('../lib/imap-provider', () => ({
  createImapProvider: () => ({ fetchBody: mockFetchBody }),
}));
vi.mock('../lib/mail-crypto', () => ({
  decryptSecret: (s: string) => s,
}));

const mockEmail = {
  id: 'email-1',
  account_id: 'acc-1',
  message_id: 'msg-1',
  user_id: 'user-1',
};
const mockAccount = {
  id: 'acc-1',
  provider: 'gmail',
  access_token: 'tok',
  refresh_token: 'rtok',
  imap_host: null,
  imap_port: null,
  imap_user: null,
  imap_pass: null,
  smtp_host: null,
  smtp_port: null,
  smtp_user: null,
  smtp_pass: null,
  use_ssl: true,
};

function makeDb(emailRow: typeof mockEmail | null, accountRow: typeof mockAccount | null) {
  return {
    selectFrom: (table: string) => ({
      where: () => ({ where: () => ({
        select: () => ({ executeTakeFirst: vi.fn().mockResolvedValue(table === 'emails' ? emailRow : null) }),
        selectAll: () => ({ executeTakeFirst: vi.fn().mockResolvedValue(table === 'email_accounts' ? accountRow : null) }),
      }) }),
    }),
  } as any;
}

function makeApp(db: ReturnType<typeof makeDb>) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = { id: 'user-1', workspace_id: 'ws-1' };
    next();
  });
  app.use('/', createMailBodyRouter(db));
  return app;
}

describe('GET /api/mail/emails/:id/body', () => {
  beforeEach(() => mockFetchBody.mockReset());

  it('returns body for gmail account', async () => {
    mockFetchBody.mockResolvedValue({ body_html: '<p>Hello</p>', body_text: 'Hello' });
    const app = makeApp(makeDb(mockEmail, mockAccount));
    const res = await request(app).get('/email-1/body');
    expect(res.status).toBe(200);
    expect(res.body.data.body_html).toBe('<p>Hello</p>');
  });

  it('returns 404 when email not found', async () => {
    const app = makeApp(makeDb(null, mockAccount));
    const res = await request(app).get('/email-1/body');
    expect(res.status).toBe(404);
  });

  it('returns 404 when account not found', async () => {
    const app = makeApp(makeDb(mockEmail, null));
    const res = await request(app).get('/email-1/body');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx vitest run src/__tests__/mail-body.test.ts
```

Expected: FAIL — `createMailBodyRouter` not found.

- [ ] **Step 3: Create mail-body.ts**

```typescript
// apps/api/src/routes/mail-body.ts
import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { decryptSecret } from '../lib/mail-crypto';
import { createGmailProvider } from '../lib/gmail-provider';
import { createImapProvider } from '../lib/imap-provider';
import { logger } from '../lib/logger';

export function createMailBodyRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/mail/emails/:id/body
  // Fetches the full body of a single email live from IMAP/Gmail. Never stored in DB.
  router.get('/:id/body', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;

      const email = await db
        .selectFrom('emails')
        .where('id', '=', req.params['id']!)
        .where('user_id', '=', user.id)
        .select(['id', 'account_id', 'message_id'])
        .executeTakeFirst();
      if (!email) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Email not found' } });
        return;
      }

      const account = await db
        .selectFrom('email_accounts')
        .where('id', '=', email.account_id)
        .selectAll()
        .executeTakeFirst();
      if (!account) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Account not found' } });
        return;
      }

      let provider;
      if (account.provider === 'gmail') {
        provider = createGmailProvider({
          accessToken: decryptSecret(account.access_token!),
          refreshToken: decryptSecret(account.refresh_token!),
          onTokenRefreshed: async (newToken) => {
            await db.updateTable('email_accounts')
              .set({ access_token: newToken, updated_at: new Date().toISOString() })
              .where('id', '=', account.id)
              .execute();
          },
        });
      } else {
        provider = createImapProvider({
          imap_host: account.imap_host!,
          imap_port: account.imap_port!,
          imap_user: account.imap_user!,
          imap_pass: decryptSecret(account.imap_pass!),
          smtp_host: account.smtp_host!,
          smtp_port: account.smtp_port!,
          smtp_user: account.smtp_user!,
          smtp_pass: decryptSecret(account.smtp_pass!),
          use_ssl: account.use_ssl,
        });
      }

      const { body_html, body_text } = await provider.fetchBody(email.message_id);

      res.json({ data: { body_html, body_text }, error: null });
    } catch (err) {
      logger.error({ err }, 'mail: fetchBody failed');
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 4: Register in index.ts**

In `apps/api/src/index.ts`, add import and registration after the existing mail routes:

```typescript
import { createMailBodyRouter } from './routes/mail-body';
```

In the routes section (after the existing mail routes):
```typescript
app.use('/api/mail/emails', requireAuth, createMailBodyRouter(db));
```

Note: This registers a second handler on `/api/mail/emails`. The existing `createMailEmailsRouter` handles `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /send`. The new `createMailBodyRouter` adds `GET /:id/body`. Both routers can coexist on the same prefix because their paths don't overlap.

- [ ] **Step 5: Run tests**

```bash
cd apps/api && npx vitest run src/__tests__/mail-body.test.ts
```

Expected: 3/3 PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/mail-body.ts apps/api/src/index.ts apps/api/src/__tests__/mail-body.test.ts
git commit -m "feat(mail): add GET /api/mail/emails/:id/body live body fetch endpoint"
```

---

## Task 5: Update Send Route + Web Types

**Files:**
- Modify: `apps/api/src/routes/mail-emails.ts`
- Modify: `apps/web/hooks/useMailSocket.ts`
- Modify: `apps/web/app/(dashboard)/mail/page.tsx`

The `POST /api/mail/send` currently stores `body_html` and `body_text` in the sent email record. After the DB migration, these columns don't exist — this would crash. This task removes them.

The web side has two type definitions that include `body_html`/`body_text`: `MailSocketEmail` in `useMailSocket.ts` and the `Email` interface in `mail/page.tsx`.

- [ ] **Step 1: Update mail-emails.ts send route**

In `apps/api/src/routes/mail-emails.ts`, in `POST /send`, remove `body_html` and `body_text` from the `db.insertInto('emails').values({...})` call. The `snippet` field is calculated from `body_html` so change it to just strip tags inline:

Find the `values({...})` block in the send route and replace it with:

```typescript
const sentEmail = await db.insertInto('emails').values({
  account_id: account.id,
  workspace_id: account.workspace_id,
  user_id: user.id,
  message_id,
  thread_id: message_id,
  subject: body.subject,
  from_address: account.email,
  from_name: account.display_name ?? account.email,
  to_addresses: JSON.stringify(body.to) as unknown as string[],
  cc_addresses: JSON.stringify(body.cc ?? []) as unknown as string[],
  bcc_addresses: JSON.stringify(body.bcc ?? []) as unknown as string[],
  snippet: body.body_html.replace(/<[^>]+>/g, '').slice(0, 300),
  folder: 'sent',
  is_read: true,
  is_starred: false,
  sent_at: new Date().toISOString(),
  contact_id: body.contact_id ?? null,
  deal_id: body.deal_id ?? null,
}).onConflict(oc => oc.columns(['account_id', 'message_id']).doNothing())
  .returningAll()
  .executeTakeFirst();
```

(The existing `to_addresses` / `cc_addresses` / `bcc_addresses` already use `JSON.stringify` — keep them. Just remove `body_html` and `body_text` fields.)

- [ ] **Step 2: Update MailSocketEmail in useMailSocket.ts**

In `apps/web/hooks/useMailSocket.ts`, remove `body_html` and `body_text` from `MailSocketEmail`:

```typescript
export interface MailSocketEmail {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  sent_at: string;
  contact_id: string | null;
  deal_id: string | null;
  is_starred: boolean;
  is_read: boolean;
  account_id: string;
  message_id: string;
  folder: string;
}
```

- [ ] **Step 3: Update Email interface in mail/page.tsx**

In `apps/web/app/(dashboard)/mail/page.tsx`, find the `Email` interface and remove `body_html` and `body_text`:

```typescript
interface Email {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  sent_at: string;
  contact_id: string | null;
  is_starred: boolean;
  is_read: boolean;
  account_id: string;
  message_id: string;
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/mail-emails.ts apps/web/hooks/useMailSocket.ts "apps/web/app/(dashboard)/mail/page.tsx"
git commit -m "feat(mail): remove body from sent email storage; update web Email types"
```

---

## Task 6: Update EmailDetail — Fetch Body on Open

**Files:**
- Modify: `apps/web/components/mail/EmailDetail.tsx`

`EmailDetail` currently reads `email.body_html` / `email.body_text` directly from the passed prop. After this task, it fetches body lazily from `GET /api/mail/emails/:id/body` when the email is opened, and shows a loading state while fetching.

- [ ] **Step 1: Rewrite EmailDetail**

Replace the entire contents of `apps/web/components/mail/EmailDetail.tsx` with:

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Email {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  sent_at: string;
  contact_id: string | null;
  is_starred: boolean;
  is_read: boolean;
  account_id: string;
  message_id: string;
}

interface Props {
  email: Email;
  onReply: (email: Email) => void;
  onClose: () => void;
}

interface EmailBody {
  body_html: string | null;
  body_text: string | null;
}

export function EmailDetail({ email, onReply, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<EmailBody | null>(null);
  const [bodyLoading, setBodyLoading] = useState(true);
  const [bodyError, setBodyError] = useState<string | null>(null);

  // Mark as read
  useEffect(() => {
    if (!email.is_read) {
      void apiFetch(`/api/mail/emails/${email.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_read: true }),
      }).catch(() => void 0);
    }
  }, [email.id, email.is_read]);

  // Fetch body when email changes
  useEffect(() => {
    setBody(null);
    setBodyLoading(true);
    setBodyError(null);

    void apiFetch<{ data: EmailBody }>(`/api/mail/emails/${email.id}/body`)
      .then(res => {
        setBody(res.data);
      })
      .catch(() => {
        setBodyError('Failed to load email body.');
      })
      .finally(() => {
        setBodyLoading(false);
      });
  }, [email.id]);

  // Write HTML into sandboxed iframe
  useEffect(() => {
    if (iframeRef.current && body?.body_html) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(body.body_html);
        doc.close();
      }
    }
  }, [body?.body_html]);

  const from = email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, fontFamily: 'var(--font-display)', letterSpacing: '-0.3px', lineHeight: 1.2, color: 'var(--text)' }}>
          {email.subject ?? '(no subject)'}
        </h1>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text3)', padding: 4, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, padding: '10px 16px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <div><span style={{ color: 'var(--text3)', fontWeight: 500 }}>From</span> &nbsp;{from}</div>
        <div><span style={{ color: 'var(--text3)', fontWeight: 500 }}>To</span> &nbsp;{email.to_addresses.join(', ')}</div>
        {email.cc_addresses.length > 0 && <div><span style={{ color: 'var(--text3)', fontWeight: 500 }}>Cc</span> &nbsp;{email.cc_addresses.join(', ')}</div>}
        <div><span style={{ color: 'var(--text3)', fontWeight: 500 }}>Date</span> &nbsp;{new Date(email.sent_at).toLocaleString()}</div>
        {email.contact_id && (
          <div>
            <Link href={`/contacts/${email.contact_id}`} style={{ color: 'var(--text)', fontSize: 12, background: 'var(--surface2)', padding: '2px 8px', borderRadius: 12, textDecoration: 'none', display: 'inline-block', marginTop: 2 }}>
              View contact &rarr;
            </Link>
          </div>
        )}
      </div>

      <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', minHeight: 300 }}>
        {bodyLoading ? (
          <div style={{ padding: 16, color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        ) : bodyError ? (
          <div style={{ padding: 16, color: 'var(--red)', fontSize: 13 }}>{bodyError}</div>
        ) : body?.body_html ? (
          <iframe
            ref={iframeRef}
            sandbox="allow-same-origin"
            style={{ width: '100%', height: '100%', minHeight: 300, border: 'none' }}
            title="Email body"
          />
        ) : (
          <pre style={{ padding: 16, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0, color: 'var(--text)' }}>
            {body?.body_text ?? '(empty)'}
          </pre>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onReply(email)}
          style={{
            padding: '8px 18px', fontSize: 13,
            background: 'var(--text)', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer',
          }}
        >
          Reply
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 0 errors related to EmailDetail.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/mail/EmailDetail.tsx
git commit -m "feat(mail): EmailDetail fetches body live on open"
```

---

## Task 7: Fix Three Bugs — Setup Redirect Loop + OAuth SameSite Cookie

This task fixes all three reported bugs in one commit:

**Bug A: Too many redirects**
Cause: `middleware.ts` redirects to `/setup` when `vencore_setup_done` cookie is missing. `SetupPage` detects setup is configured and calls `redirect('/')`. Middleware redirects to `/setup` again → infinite loop.

Fix: Create a route handler `/api/setup/activate` (inside `SETUP_PATHS`) that sets the cookie and redirects to the destination.

**Bug B: Gmail callback → login page**
Cause: `vencore_token` cookie is set with `sameSite: 'strict'`. When Google redirects to the API callback, then the API redirects to the web app — this is a cross-site navigation. Browsers don't send `SameSite=Strict` cookies on cross-site top-level navigations, so the middleware sees no token and redirects to login.

Fix: Change `sameSite: 'strict'` → `'lax'` on `vencore_token`. `SameSite=Lax` sends cookies on top-level cross-site navigations (exactly what OAuth needs).

**Bug C: Gmail JSON syntax error on sync**
Already fixed in Task 2 (`JSON.stringify` on JSONB arrays).

**Files:**
- Create: `apps/web/app/api/setup/activate/route.ts`
- Modify: `apps/web/app/setup/page.tsx`
- Modify: `apps/web/middleware.ts`
- Modify: `apps/api/src/routes/auth.ts`

- [ ] **Step 1: Create /api/setup/activate route handler**

```typescript
// apps/web/app/api/setup/activate/route.ts
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get('from') ?? '/';

  // Sanitise the redirect target — only allow relative paths
  const target = from.startsWith('/') && !from.startsWith('//') ? from : '/';

  // Redirect first, set cookie on the response so middleware sees it immediately
  const response = NextResponse.redirect(new URL(target, request.url));
  response.cookies.set('vencore_setup_done', '1', {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return response;
}
```

- [ ] **Step 2: Update SetupPage to redirect through /api/setup/activate**

In `apps/web/app/setup/page.tsx`, the `SetupPage` component currently does:
```typescript
if (configured) redirect('/');
```

Change it to accept `searchParams` and pass `from` through to the activate route:

```typescript
import { redirect } from 'next/navigation';
import { SetupWizard } from './SetupWizard';

export const metadata = { title: 'Setup — Vencore' };

async function getSetupStatus(): Promise<boolean> {
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  try {
    const res = await fetch(`${apiUrl}/api/setup/status`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    return json.data?.configured === true;
  } catch {
    return false;
  }
}

interface PageProps {
  searchParams: Promise<{ from?: string }>;
}

export default async function SetupPage({ searchParams }: PageProps) {
  const configured = await getSetupStatus();
  if (configured) {
    const params = await searchParams;
    const from = params.from ?? '/';
    redirect(`/api/setup/activate?from=${encodeURIComponent(from)}`);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            fontFamily: 'Instrument Serif, serif',
            fontSize: 32,
            fontWeight: 400,
            color: 'var(--text)',
            margin: '0 0 8px',
          }}>
            Welcome to Vencore
          </h1>
          <p style={{ color: 'var(--text2)', margin: 0 }}>
            Let's get your instance set up.
          </p>
        </div>
        <SetupWizard />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update middleware to pass `from` to /setup**

In `apps/web/middleware.ts`, when redirecting to `/setup`, include the `from` param:

Change:
```typescript
if (!setupDone && !isSetupPath) {
  return NextResponse.redirect(new URL('/setup', req.url));
}
```

To:
```typescript
if (!setupDone && !isSetupPath) {
  const setupUrl = new URL('/setup', req.url);
  setupUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(setupUrl);
}
```

- [ ] **Step 4: Fix sameSite on vencore_token in auth.ts**

In `apps/api/src/routes/auth.ts`, find ALL `res.cookie('vencore_token', ...)` calls (there are two — one in the login route, one in a setup route). Change `sameSite: 'strict'` to `sameSite: 'lax'` in both:

Search for `'strict'` in the cookie options and replace with `'lax'`:

```typescript
// Before:
res.cookie('vencore_token', token, {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict',   // <-- change this
  maxAge: 24 * 60 * 60 * 1000,
});

// After:
res.cookie('vencore_token', token, {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax',      // allows cross-site top-level navigations (OAuth callbacks)
  maxAge: 24 * 60 * 60 * 1000,
});
```

Apply to all occurrences of `sameSite: 'strict'` in auth.ts.

- [ ] **Step 5: Run API tests**

```bash
cd apps/api && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Verify TypeScript for web**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/api/setup/activate/route.ts" apps/web/app/setup/page.tsx apps/web/middleware.ts apps/api/src/routes/auth.ts
git commit -m "fix: setup redirect loop, OAuth cookie SameSite strict→lax"
```

---

## Final Verification

- [ ] Run full API test suite: `cd apps/api && npx vitest run` → all pass
- [ ] Run web TypeScript check: `cd apps/web && npx tsc --noEmit` → 0 errors
- [ ] Confirm `emails` table has no `body_html`/`body_text` columns (run migration if not done)
- [ ] Manually test: open an email in the mail UI → loading spinner → body appears
- [ ] Manually test: connect Gmail account → Google consent → lands on `/settings/mail` (not login)
- [ ] Manually test: open app in fresh browser (no cookies) → no infinite redirect
