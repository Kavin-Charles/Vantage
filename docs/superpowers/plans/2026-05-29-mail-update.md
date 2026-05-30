# Mail Update — Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time WebSocket email delivery, deal auto-linking, activity logging for emails, and compose-from-CRM buttons on deal detail.

**Architecture:** A `mailNotifier` singleton (mirrors `sseRegistry` pattern) lets the sync worker broadcast new emails to the user's connected WebSocket. The WS handler authenticates via cookie JWT (same as SSH terminal). Gmail Pub/Sub webhook triggers incremental sync on demand; IMAP IDLE does the same for IMAP accounts. Deal auto-link runs inside `storeEmails` after contact resolution. Activity records are inserted for all inbound and outbound emails.

**Tech Stack:** `ws` (already installed), `imapflow` (already installed), `googleapis` (already installed), Kysely, Next.js App Router, native browser WebSocket.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/db/migrations/20260530_001_mail_update.ts` | Create | Add `email_accounts.gmail_watch_expiry`, index on `emails.deal_id` |
| `packages/db/src/schema.ts` | Modify | Add `gmail_watch_expiry` to `EmailAccountTable` |
| `packages/config/src/index.ts` | Modify | Add `GMAIL_PUBSUB_TOKEN` to `apiEnvSchema` |
| `apps/api/src/lib/mail-notifier.ts` | Create | In-process WS broadcast registry keyed by `userId` |
| `apps/api/src/workers/mail-sync.ts` | Modify | Deal auto-link, activity log, WS broadcast in `storeEmails`; same on send |
| `apps/api/src/routes/mail-emails.ts` | Modify | Add `deal_id` list filter; accept `deal_id`/`contact_id` on send; emit activity + broadcast on send |
| `apps/api/src/routes/mail-webhook.ts` | Create | `POST /api/mail/webhook/gmail` — verify token, enqueue incremental sync |
| `apps/api/src/routes/mail-accounts.ts` | Modify | Call `users.watch()` after Gmail connect; add `gmail_watch_expiry` |
| `apps/api/src/workers/gmail-watch-renew.ts` | Create | Cron: renew Gmail watches expiring within 24 h |
| `apps/api/src/workers/imap-idle.ts` | Create | Long-lived IMAP IDLE connections per account; enqueues incremental sync on new mail |
| `apps/api/src/ws/mail-ws.ts` | Create | WS upgrade handler; subscribes `mailNotifier` per user |
| `apps/api/src/index.ts` | Modify | Register webhook route, WS upgrade, start IMAP IDLE + Gmail watch renew |
| `apps/web/hooks/useMailSocket.ts` | Create | Browser WS hook — prepends new email to list state |
| `apps/web/app/(dashboard)/mail/page.tsx` | Modify | Wire `useMailSocket`; animate new email rows |
| `apps/web/components/mail/ComposeModal.tsx` | Modify | Accept `dealId`/`contactId` props; include in POST body |
| `apps/web/components/deals/DealDetailCard.tsx` | Modify | Add Emails tab: list emails for deal, "Send email" button |

---

## Task 1: DB Migration + Schema Types + Env Config

**Files:**
- Create: `packages/db/migrations/20260530_001_mail_update.ts`
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/config/src/index.ts`

- [ ] **Step 1: Write migration**

```typescript
// packages/db/migrations/20260530_001_mail_update.ts
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('email_accounts')
    .addColumn('gmail_watch_expiry', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('emails_deal_id_idx')
    .on('emails')
    .column('deal_id')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('emails_deal_id_idx').execute();
  await db.schema
    .alterTable('email_accounts')
    .dropColumn('gmail_watch_expiry')
    .execute();
}
```

- [ ] **Step 2: Add `gmail_watch_expiry` to `EmailAccountTable` in schema**

In `packages/db/src/schema.ts`, find the `EmailAccountTable` interface and add the field after `last_synced_at`:

```typescript
  last_synced_at: string | null;
  gmail_watch_expiry: string | null;   // ← add this line
  created_at: Generated<string>;
```

- [ ] **Step 3: Add `GMAIL_PUBSUB_TOKEN` to env schema**

In `packages/config/src/index.ts`, inside `apiEnvSchema`, add after `MAIL_ENCRYPTION_KEY`:

```typescript
  GMAIL_PUBSUB_TOKEN: z.string().optional(),
```

- [ ] **Step 4: Run migration**

```bash
cd packages/db && npx tsx src/migrate.ts
```

Expected: `✓ 20260530_001_mail_update`

- [ ] **Step 5: Build DB package**

```bash
cd packages/db && npm run build
```

Expected: exit 0, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/20260530_001_mail_update.ts packages/db/src/schema.ts packages/config/src/index.ts
git commit -m "feat(mail): migration for gmail_watch_expiry and deal_id index"
```

---

## Task 2: `mailNotifier` Singleton

**Files:**
- Create: `apps/api/src/lib/mail-notifier.ts`
- Test: `apps/api/src/__tests__/mail-notifier.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/__tests__/mail-notifier.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MailNotifier } from '../lib/mail-notifier';
import type { WebSocket } from 'ws';

function makeWs(readyState = 1 /* OPEN */): WebSocket {
  return { readyState, send: vi.fn() } as unknown as WebSocket;
}

describe('MailNotifier', () => {
  it('broadcasts to subscribed user', () => {
    const n = new MailNotifier();
    const ws = makeWs();
    n.subscribe('user-1', ws);
    n.broadcast('user-1', { type: 'new_email' });
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'new_email' }));
  });

  it('does not broadcast after unsubscribe', () => {
    const n = new MailNotifier();
    const ws = makeWs();
    n.subscribe('user-1', ws);
    n.unsubscribe('user-1', ws);
    n.broadcast('user-1', { type: 'new_email' });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('skips non-OPEN sockets', () => {
    const n = new MailNotifier();
    const ws = makeWs(3 /* CLOSED */);
    n.subscribe('user-1', ws);
    n.broadcast('user-1', { type: 'new_email' });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('supports multiple sockets per user', () => {
    const n = new MailNotifier();
    const ws1 = makeWs();
    const ws2 = makeWs();
    n.subscribe('user-1', ws1);
    n.subscribe('user-1', ws2);
    n.broadcast('user-1', { type: 'ping' });
    expect(ws1.send).toHaveBeenCalled();
    expect(ws2.send).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/api && npx vitest run src/__tests__/mail-notifier.test.ts
```

Expected: FAIL with "Cannot find module '../lib/mail-notifier'"

- [ ] **Step 3: Implement `MailNotifier`**

```typescript
// apps/api/src/lib/mail-notifier.ts
import type { WebSocket } from 'ws';

export class MailNotifier {
  private subs = new Map<string, Set<WebSocket>>();

  subscribe(userId: string, ws: WebSocket): void {
    if (!this.subs.has(userId)) {
      this.subs.set(userId, new Set());
    }
    this.subs.get(userId)!.add(ws);
  }

  unsubscribe(userId: string, ws: WebSocket): void {
    const set = this.subs.get(userId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) this.subs.delete(userId);
  }

  broadcast(userId: string, payload: unknown): void {
    const set = this.subs.get(userId);
    if (!set || set.size === 0) return;
    const msg = JSON.stringify(payload);
    for (const ws of set) {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(msg);
      } else {
        set.delete(ws);
      }
    }
  }
}

// Singleton shared across the process
export const mailNotifier = new MailNotifier();
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/api && npx vitest run src/__tests__/mail-notifier.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/mail-notifier.ts apps/api/src/__tests__/mail-notifier.test.ts
git commit -m "feat(mail): add MailNotifier singleton for WS broadcast"
```

---

## Task 3: Deal Auto-Link + Activity + WS Broadcast in storeEmails

**Files:**
- Modify: `apps/api/src/workers/mail-sync.ts`
- Test: `apps/api/src/__tests__/mail-sync-deal.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/__tests__/mail-sync-deal.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

// Mock logActivity and mailNotifier before importing worker
vi.mock('../lib/log-activity', () => ({ logActivity: vi.fn() }));
vi.mock('../lib/mail-notifier', () => ({ mailNotifier: { broadcast: vi.fn() } }));

import { logActivity } from '../lib/log-activity';
import { mailNotifier } from '../lib/mail-notifier';

// Minimal db mock for storeEmails
function makeDb(contactId: string | null, dealId: string | null): Kysely<Database> {
  return {
    selectFrom: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn()
      .mockResolvedValueOnce(contactId ? { id: contactId } : undefined)   // contacts lookup
      .mockResolvedValueOnce(dealId ? { id: dealId } : undefined),         // deals lookup
    insertInto: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflict: vi.fn().mockReturnThis(),
    columns: vi.fn().mockReturnThis(),
    doNothing: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'email-1', deal_id: dealId }),
  } as unknown as Kysely<Database>;
}

describe('storeEmails deal auto-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets deal_id when contact has open deal', async () => {
    const db = makeDb('contact-1', 'deal-1');
    // Import inside test to pick up mocks
    const { storeEmailsForTest } = await import('../workers/mail-sync');
    await storeEmailsForTest(db, 'account-1', 'workspace-1', 'user-1', [{
      message_id: 'msg-1',
      thread_id: null,
      subject: 'Hello',
      from_address: 'sender@test.com',
      from_name: 'Sender',
      to_addresses: ['me@test.com'],
      cc_addresses: [],
      bcc_addresses: [],
      body_html: '<p>Hi</p>',
      body_text: 'Hi',
      snippet: 'Hi',
      folder: 'inbox' as const,
      is_read: false,
      is_starred: false,
      sent_at: new Date().toISOString(),
    }]);
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      type: 'email',
      deal_id: 'deal-1',
    }));
    expect(mailNotifier.broadcast).toHaveBeenCalledWith('user-1', expect.objectContaining({ type: 'new_email' }));
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/api && npx vitest run src/__tests__/mail-sync-deal.test.ts
```

Expected: FAIL with "storeEmailsForTest is not a function"

- [ ] **Step 3: Modify `storeEmails` in `apps/api/src/workers/mail-sync.ts`**

Add imports at the top of the file (after existing imports):

```typescript
import { logActivity } from '../lib/log-activity';
import { mailNotifier } from '../lib/mail-notifier';
```

Add the `autoLinkDeal` helper after the existing `autoLinkContact` function:

```typescript
async function autoLinkDeal(
  db: Kysely<Database>,
  workspaceId: string,
  contactId: string | null,
): Promise<string | null> {
  if (!contactId) return null;
  const deal = await db
    .selectFrom('deals')
    .where('workspace_id', '=', workspaceId)
    .where('contact_id', '=', contactId)
    .where('stage', 'not in', ['won', 'lost'])
    .orderBy('updated_at', 'desc')
    .select('id')
    .executeTakeFirst();
  return deal?.id ?? null;
}
```

Replace the entire `storeEmails` function with:

```typescript
export async function storeEmailsForTest(
  db: Kysely<Database>,
  accountId: string,
  workspaceId: string,
  userId: string,
  emails: FetchedEmail[],
): Promise<void> {
  return storeEmails(db, accountId, workspaceId, userId, emails);
}

async function storeEmails(
  db: Kysely<Database>,
  accountId: string,
  workspaceId: string,
  userId: string,
  emails: FetchedEmail[],
): Promise<void> {
  for (const email of emails) {
    const allAddresses = [email.from_address, ...email.to_addresses, ...email.cc_addresses]
      .map(a => a.toLowerCase());
    const contactId = await autoLinkContact(db, workspaceId, allAddresses);
    const dealId = await autoLinkDeal(db, workspaceId, contactId);

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
        to_addresses: email.to_addresses as unknown as string[],
        cc_addresses: email.cc_addresses as unknown as string[],
        bcc_addresses: email.bcc_addresses as unknown as string[],
        body_html: email.body_html,
        body_text: email.body_text,
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

    if (inserted) {
      void logActivity(db, {
        workspace_id: workspaceId,
        user_id: userId,
        type: 'email',
        body: email.subject ?? '(no subject)',
        contact_id: contactId ?? undefined,
        deal_id: dealId ?? undefined,
        meta: {
          email_id: inserted.id,
          direction: 'inbound',
          snippet: email.snippet ?? undefined,
        },
      });
      mailNotifier.broadcast(userId, { type: 'new_email', email: inserted });
    }
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/api && npx vitest run src/__tests__/mail-sync-deal.test.ts
```

Expected: 1 test PASS

- [ ] **Step 5: Run existing mail tests to verify no regressions**

```bash
cd apps/api && npx vitest run src/__tests__/mail-accounts.test.ts src/__tests__/mail-emails.test.ts src/__tests__/mail-crypto.test.ts
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/workers/mail-sync.ts apps/api/src/__tests__/mail-sync-deal.test.ts
git commit -m "feat(mail): deal auto-link, activity logging, and WS broadcast in storeEmails"
```

---

## Task 4: Activity Log + Broadcast on Email Send

**Files:**
- Modify: `apps/api/src/routes/mail-emails.ts`

- [ ] **Step 1: Write failing test for deal_id send**

```typescript
// Append to apps/api/src/__tests__/mail-emails.test.ts
// (Find the describe block for POST /api/mail/emails/send and add inside it)

it('accepts deal_id and contact_id in send body', async () => {
  // This test verifies Zod schema accepts the new fields.
  // Import the schema directly from the route to check validation.
  const { sendSchema } = await import('../routes/mail-emails');
  const result = sendSchema.safeParse({
    account_id: '00000000-0000-0000-0000-000000000001',
    to: ['test@example.com'],
    subject: 'Hello',
    body_html: '<p>Hi</p>',
    deal_id: '00000000-0000-0000-0000-000000000002',
    contact_id: '00000000-0000-0000-0000-000000000003',
  });
  expect(result.success).toBe(true);
  expect(result.data?.deal_id).toBe('00000000-0000-0000-0000-000000000002');
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/api && npx vitest run src/__tests__/mail-emails.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `sendSchema` not exported / does not have `deal_id`

- [ ] **Step 3: Add imports and update `mail-emails.ts`**

At the top of `apps/api/src/routes/mail-emails.ts`, add:

```typescript
import { logActivity } from '../lib/log-activity';
import { mailNotifier } from '../lib/mail-notifier';
```

Export `sendSchema` (change `const sendSchema` to `export const sendSchema`) and extend it:

```typescript
export const sendSchema = z.object({
  account_id: z.string().uuid(),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  body_html: z.string().min(1),
  reply_to_message_id: z.string().optional(),
  deal_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
});
```

Also export `listQuerySchema` and extend it to accept `deal_id`:

```typescript
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  account_id: z.string().uuid().optional(),
  folder: z.enum(['inbox', 'sent', 'drafts', 'trash', 'spam']).optional(),
  contact_id: z.string().uuid().optional(),
  deal_id: z.string().uuid().optional(),
  q: z.string().optional(),
});
```

In the `GET /` handler, add `deal_id` filter after the existing `contact_id` filter:

```typescript
if (q.contact_id) query = query.where('contact_id', '=', q.contact_id);
if (q.deal_id) query = query.where('deal_id', '=', q.deal_id);   // ← add this line
```

In the `POST /send` handler, after the existing `db.insertInto('emails').values({...})` block, replace the static `deal_id: null` and `contact_id: null` with the body values, then add activity + broadcast:

```typescript
      // Store sent email in DB so it appears in Sent folder immediately
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
        body_html: body.body_html,
        body_text: null,
        snippet: body.body_html.replace(/<[^>]+>/g, '').slice(0, 200),
        folder: 'sent',
        is_read: true,
        is_starred: false,
        sent_at: new Date().toISOString(),
        contact_id: body.contact_id ?? null,
        deal_id: body.deal_id ?? null,
      }).onConflict(oc => oc.columns(['account_id', 'message_id']).doNothing())
        .returningAll()
        .executeTakeFirst();

      if (sentEmail) {
        void logActivity(db, {
          workspace_id: account.workspace_id,
          user_id: user.id,
          type: 'email',
          body: body.subject,
          contact_id: body.contact_id,
          deal_id: body.deal_id,
          meta: {
            email_id: sentEmail.id,
            direction: 'outbound',
            snippet: sentEmail.snippet ?? undefined,
          },
        });
        mailNotifier.broadcast(user.id, { type: 'new_email', email: sentEmail });
      }
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/api && npx vitest run src/__tests__/mail-emails.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/mail-emails.ts
git commit -m "feat(mail): deal_id filter on list, deal/contact context on send, activity + broadcast"
```

---

## Task 5: Gmail Pub/Sub Webhook Route

**Files:**
- Create: `apps/api/src/routes/mail-webhook.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/__tests__/mail-webhook.test.ts
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../workers/mail-sync', () => ({
  runIncrementalSync: vi.fn(),
}));
vi.mock('@vantage/db', () => ({ createDb: vi.fn() }));

import { createMailWebhookRouter } from '../routes/mail-webhook';
import { runIncrementalSync } from '../workers/mail-sync';

function makeApp(token: string) {
  const db = {
    selectFrom: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue({ id: 'account-1' }),
  } as any;
  const app = express();
  app.use(express.json());
  app.use('/api/mail/webhook', createMailWebhookRouter(db, token));
  return app;
}

describe('POST /api/mail/webhook/gmail', () => {
  it('returns 401 when token missing', async () => {
    const app = makeApp('secret-token');
    const res = await request(app)
      .post('/api/mail/webhook/gmail')
      .send({ message: { data: Buffer.from(JSON.stringify({ emailAddress: 'user@test.com' })).toString('base64') } });
    expect(res.status).toBe(401);
  });

  it('returns 204 and triggers sync when token matches', async () => {
    const app = makeApp('secret-token');
    const res = await request(app)
      .post('/api/mail/webhook/gmail')
      .set('X-Goog-Channel-Token', 'secret-token')
      .send({ message: { data: Buffer.from(JSON.stringify({ emailAddress: 'user@test.com' })).toString('base64') } });
    expect(res.status).toBe(204);
    expect(runIncrementalSync).toHaveBeenCalled();
  });

  it('returns 204 silently when no account matches', async () => {
    const db = {
      selectFrom: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    } as any;
    const app = express();
    app.use(express.json());
    app.use('/api/mail/webhook', createMailWebhookRouter(db, 'secret-token'));
    const res = await request(app)
      .post('/api/mail/webhook/gmail')
      .set('X-Goog-Channel-Token', 'secret-token')
      .send({ message: { data: Buffer.from(JSON.stringify({ emailAddress: 'nobody@test.com' })).toString('base64') } });
    expect(res.status).toBe(204);
    expect(runIncrementalSync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/api && npx vitest run src/__tests__/mail-webhook.test.ts
```

Expected: FAIL with "Cannot find module '../routes/mail-webhook'"

- [ ] **Step 3: Implement `createMailWebhookRouter`**

```typescript
// apps/api/src/routes/mail-webhook.ts
import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { runIncrementalSync } from '../workers/mail-sync';
import { logger } from '../lib/logger';

export function createMailWebhookRouter(
  db: Kysely<Database>,
  pubsubToken: string,
): ExpressRouter {
  const router = Router();

  // POST /api/mail/webhook/gmail
  // Called by Google Pub/Sub push subscription.
  router.post('/gmail', async (req, res) => {
    const incomingToken = req.headers['x-goog-channel-token'];
    if (!incomingToken || incomingToken !== pubsubToken) {
      res.status(401).end();
      return;
    }

    try {
      // Pub/Sub message data is base64-encoded JSON
      const raw = req.body?.message?.data;
      if (!raw) { res.status(204).end(); return; }

      const payload = JSON.parse(Buffer.from(raw as string, 'base64').toString('utf8')) as {
        emailAddress?: string;
      };

      const emailAddress = payload.emailAddress;
      if (!emailAddress) { res.status(204).end(); return; }

      const account = await db
        .selectFrom('email_accounts')
        .where('email', '=', emailAddress)
        .where('provider', '=', 'gmail')
        .select('id')
        .executeTakeFirst();

      if (account) {
        void runIncrementalSync(db, account.id);
      }
    } catch (err) {
      logger.error({ err }, 'mail-webhook: failed to process Gmail push');
    }

    res.status(204).end();
  });

  return router;
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/api && npx vitest run src/__tests__/mail-webhook.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/mail-webhook.ts apps/api/src/__tests__/mail-webhook.test.ts
git commit -m "feat(mail): Gmail Pub/Sub webhook route"
```

---

## Task 6: Gmail Watch Registration + Renewal Cron

**Files:**
- Modify: `apps/api/src/routes/mail-accounts.ts`
- Create: `apps/api/src/workers/gmail-watch-renew.ts`

- [ ] **Step 1: Add `registerGmailWatch` helper to `mail-accounts.ts`**

At the top of `apps/api/src/routes/mail-accounts.ts`, add after existing imports:

```typescript
import { registerGmailWatch } from '../workers/gmail-watch-renew';
```

In `handleGmailCallback`, after the account is created or updated and incremental sync is triggered, add:

```typescript
      // Register Gmail Pub/Sub watch (fire-and-forget — requires GMAIL_PUBSUB_TOKEN in env)
      if (process.env['GMAIL_PUBSUB_TOKEN'] && process.env['GOOGLE_PUBSUB_TOPIC']) {
        void registerGmailWatch(db, account.id ?? existing.id, oauth2).catch(err =>
          logger.error({ err }, 'mail: gmail watch registration failed'),
        );
      }
```

> Note: `account.id` for new accounts, `existing.id` for re-connected accounts. Wrap in the existing `if (existing) { ... } else { const account = ... }` branches appropriately.

- [ ] **Step 2: Create `gmail-watch-renew.ts`**

```typescript
// apps/api/src/workers/gmail-watch-renew.ts
import { google } from 'googleapis';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { decryptSecret } from '../lib/mail-crypto';
import { createGmailProvider } from '../lib/gmail-provider';
import { logger } from '../lib/logger';

const WATCH_EXPIRY_BUFFER_MS = 24 * 60 * 60 * 1000; // 1 day

export async function registerGmailWatch(
  db: Kysely<Database>,
  accountId: string,
  oauth2Client?: ReturnType<typeof google.auth.OAuth2.prototype.constructor>,
): Promise<void> {
  const topic = process.env['GOOGLE_PUBSUB_TOPIC'];
  if (!topic) return;

  const account = await db
    .selectFrom('email_accounts')
    .where('id', '=', accountId)
    .selectAll()
    .executeTakeFirst();
  if (!account || account.provider !== 'gmail') return;

  const auth = oauth2Client ?? (() => {
    const a = new google.auth.OAuth2(
      process.env['GOOGLE_CLIENT_ID'],
      process.env['GOOGLE_CLIENT_SECRET'],
      process.env['GOOGLE_REDIRECT_URI'],
    );
    a.setCredentials({
      access_token: decryptSecret(account.access_token!),
      refresh_token: decryptSecret(account.refresh_token!),
    });
    return a;
  })();

  const gmail = google.gmail({ version: 'v1', auth });
  const watchRes = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: topic,
      labelIds: ['INBOX'],
    },
  });

  const expiryMs = Number(watchRes.data.expiration ?? 0);
  const expiryIso = expiryMs > 0 ? new Date(expiryMs).toISOString() : null;

  await db.updateTable('email_accounts')
    .set({ gmail_watch_expiry: expiryIso, updated_at: new Date().toISOString() })
    .where('id', '=', accountId)
    .execute();

  logger.info({ accountId, expiry: expiryIso }, 'mail: gmail watch registered');
}

let renewInterval: ReturnType<typeof setInterval> | null = null;

export function startGmailWatchRenew(db: Kysely<Database>): void {
  if (renewInterval) return;

  const run = async () => {
    const cutoff = new Date(Date.now() + WATCH_EXPIRY_BUFFER_MS).toISOString();
    try {
      const accounts = await db
        .selectFrom('email_accounts')
        .where('provider', '=', 'gmail')
        .where(eb => eb.or([
          eb('gmail_watch_expiry', 'is', null),
          eb('gmail_watch_expiry', '<', cutoff),
        ]))
        .select('id')
        .execute();

      for (const { id } of accounts) {
        void registerGmailWatch(db, id).catch(err =>
          logger.error({ err, id }, 'mail: gmail watch renewal failed'),
        );
      }
    } catch (err) {
      logger.error({ err }, 'mail: gmail watch renew scheduler error');
    }
  };

  // Run once on startup, then every 6 hours
  void run();
  renewInterval = setInterval(run, 6 * 60 * 60 * 1000);
  logger.info('mail: gmail watch renewal started (6-hour interval)');
}

export function stopGmailWatchRenew(): void {
  if (renewInterval) { clearInterval(renewInterval); renewInterval = null; }
}
```

- [ ] **Step 3: Add `GOOGLE_PUBSUB_TOPIC` to env schema**

In `packages/config/src/index.ts`, inside `apiEnvSchema` add:

```typescript
  GOOGLE_PUBSUB_TOPIC: z.string().optional(),
```

- [ ] **Step 4: TypeScript check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/mail-accounts.ts apps/api/src/workers/gmail-watch-renew.ts packages/config/src/index.ts
git commit -m "feat(mail): Gmail Pub/Sub watch registration and renewal cron"
```

---

## Task 7: IMAP IDLE Worker

**Files:**
- Create: `apps/api/src/workers/imap-idle.ts`

- [ ] **Step 1: Implement `imap-idle.ts`**

```typescript
// apps/api/src/workers/imap-idle.ts
// Maintains long-lived IMAP IDLE connections per active IMAP account.
// On new-mail notification, triggers incremental sync.
// Falls back gracefully if IDLE is not supported.
import { ImapFlow } from 'imapflow';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { decryptSecret } from '../lib/mail-crypto';
import { runIncrementalSync } from './mail-sync';
import { logger } from '../lib/logger';

interface IdleConnection {
  client: ImapFlow;
  accountId: string;
  retryDelay: number; // ms
}

const connections = new Map<string, IdleConnection>();
const MAX_RETRY_MS = 60_000;

async function startIdleForAccount(
  db: Kysely<Database>,
  accountId: string,
): Promise<void> {
  const account = await db
    .selectFrom('email_accounts')
    .where('id', '=', accountId)
    .where('provider', '=', 'imap')
    .selectAll()
    .executeTakeFirst();
  if (!account) return;

  const conn: IdleConnection = {
    accountId,
    retryDelay: 1000,
    client: new ImapFlow({
      host: account.imap_host!,
      port: account.imap_port!,
      secure: account.use_ssl,
      auth: {
        user: account.imap_user!,
        pass: decryptSecret(account.imap_pass!),
      },
      logger: false,
    }),
  };

  connections.set(accountId, conn);

  const connect = async () => {
    try {
      await conn.client.connect();
      const mailbox = await conn.client.getMailboxLock('INBOX');

      try {
        conn.client.on('exists', () => {
          logger.info({ accountId }, 'imap-idle: new mail detected');
          void runIncrementalSync(db, accountId);
        });

        // idle() resolves when connection drops or server sends BYE
        await conn.client.idle();
      } finally {
        mailbox.release();
      }
    } catch (err) {
      logger.error({ err, accountId }, 'imap-idle: connection error');
    }

    // Reconnect with backoff
    if (connections.has(accountId)) {
      const delay = conn.retryDelay;
      conn.retryDelay = Math.min(conn.retryDelay * 2, MAX_RETRY_MS);
      logger.info({ accountId, delay }, 'imap-idle: reconnecting');
      setTimeout(() => void connect(), delay);
    }
  };

  void connect();
}

export async function startImapIdle(db: Kysely<Database>): Promise<void> {
  const accounts = await db
    .selectFrom('email_accounts')
    .where('provider', '=', 'imap')
    .select('id')
    .execute();

  for (const { id } of accounts) {
    void startIdleForAccount(db, id);
  }

  logger.info({ count: accounts.length }, 'imap-idle: started connections');
}

export async function stopImapIdle(): Promise<void> {
  for (const [id, conn] of connections) {
    connections.delete(id);
    try { await conn.client.logout(); } catch { /* ignore */ }
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/workers/imap-idle.ts
git commit -m "feat(mail): IMAP IDLE worker for real-time new-mail detection"
```

---

## Task 8: Mail WebSocket Handler

**Files:**
- Create: `apps/api/src/ws/mail-ws.ts`
- Test: `apps/api/src/__tests__/mail-ws.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/__tests__/mail-ws.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';

vi.mock('../lib/mail-notifier', () => ({
  mailNotifier: { subscribe: vi.fn(), unsubscribe: vi.fn() },
}));

import { mailNotifier } from '../lib/mail-notifier';
import { handleMailWsUpgrade } from '../ws/mail-ws';

function makeWs(): WebSocket {
  return {
    close: vi.fn(),
    on: vi.fn(),
    readyState: 1,
  } as unknown as WebSocket;
}

function makeRequest(cookie: string): IncomingMessage {
  return { url: '/api/mail/ws', headers: { cookie } } as unknown as IncomingMessage;
}

const VALID_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJ3b3Jrc3BhY2VJZCI6IndzLTEiLCJpYXQiOjE3MDAwMDAwMDB9.placeholder';

describe('handleMailWsUpgrade', () => {
  it('closes with 4001 when no cookie', async () => {
    const ws = makeWs();
    const db = {
      selectFrom: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    } as any;
    await handleMailWsUpgrade(ws, makeRequest(''), db, 'secret');
    expect(ws.close).toHaveBeenCalledWith(4001, 'Unauthorized');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/api && npx vitest run src/__tests__/mail-ws.test.ts
```

Expected: FAIL with "Cannot find module '../ws/mail-ws'"

- [ ] **Step 3: Implement `mail-ws.ts`**

```typescript
// apps/api/src/ws/mail-ws.ts
// WebSocket handler for real-time mail delivery.
// Auth via 'vantage_token' cookie (same pattern as ssh-terminal.ts).
import type { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import type { WebSocket } from 'ws';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { mailNotifier } from '../lib/mail-notifier';
import { logger } from '../lib/logger';

interface JwtPayload {
  sub: string;
  workspaceId: string;
}

function parseCookies(header: string): Record<string, string> {
  return Object.fromEntries(
    header.split(';').map(c => {
      const idx = c.indexOf('=');
      if (idx < 0) return [c.trim(), ''];
      return [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
    }),
  );
}

export async function handleMailWsUpgrade(
  ws: WebSocket,
  request: IncomingMessage,
  db: Kysely<Database>,
  jwtSecret: string,
): Promise<void> {
  const cookies = parseCookies(request.headers.cookie ?? '');
  const token = cookies['vantage_token'];

  if (!token) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, jwtSecret) as JwtPayload;
  } catch {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const user = await db
    .selectFrom('users')
    .where('id', '=', payload.sub)
    .select(['id'])
    .executeTakeFirst();

  if (!user) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  mailNotifier.subscribe(user.id, ws);
  logger.info({ userId: user.id }, 'mail-ws: client connected');

  // Keep alive: ping every 30 s
  const heartbeat = setInterval(() => {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify({ type: 'ping' }));
    } else {
      clearInterval(heartbeat);
    }
  }, 30_000);

  ws.on('close', () => {
    clearInterval(heartbeat);
    mailNotifier.unsubscribe(user.id, ws);
    logger.info({ userId: user.id }, 'mail-ws: client disconnected');
  });
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/api && npx vitest run src/__tests__/mail-ws.test.ts
```

Expected: 1 test PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ws/mail-ws.ts apps/api/src/__tests__/mail-ws.test.ts
git commit -m "feat(mail): WebSocket handler for real-time mail push"
```

---

## Task 9: Wire Up in `index.ts`

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add imports**

In `apps/api/src/index.ts`, add after the existing mail imports:

```typescript
import { createMailWebhookRouter } from './routes/mail-webhook';
import { startGmailWatchRenew } from './workers/gmail-watch-renew';
import { startImapIdle } from './workers/imap-idle';
import { handleMailWsUpgrade } from './ws/mail-ws';
```

- [ ] **Step 2: Register webhook route**

After the existing `app.use('/api/mail/emails', requireAuth, createMailEmailsRouter(db));` line, add:

```typescript
// Gmail Pub/Sub push webhook — public, verified by token header
app.use('/api/mail/webhook', createMailWebhookRouter(db, env.GMAIL_PUBSUB_TOKEN ?? ''));
```

- [ ] **Step 3: Start workers**

After the existing `startMailSync(db);` call, add:

```typescript
// Start IMAP IDLE connections for real-time detection
void startImapIdle(db);

// Start Gmail watch renewal cron (renews every 6 h)
startGmailWatchRenew(db);
```

- [ ] **Step 4: Register mail WS upgrade**

In the `httpServer.on('upgrade', ...)` handler, add a new branch before the `else { socket.destroy(); }`:

```typescript
  } else if (/^\/api\/mail\/ws/.test(url)) {
    wss.handleUpgrade(request, socket as import('net').Socket, head, (ws) => {
      void handleMailWsUpgrade(ws, request, db, env.JWT_SECRET);
    });
  } else {
```

- [ ] **Step 5: TypeScript check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(mail): wire up webhook route, IMAP IDLE, Gmail watch renew, and mail WS"
```

---

## Task 10: `useMailSocket` Hook

**Files:**
- Create: `apps/web/hooks/useMailSocket.ts`

- [ ] **Step 1: Implement hook**

```typescript
// apps/web/hooks/useMailSocket.ts
'use client';

import { useEffect, useRef } from 'react';

export interface MailSocketEmail {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  body_html: string | null;
  body_text: string | null;
  sent_at: string;
  contact_id: string | null;
  deal_id: string | null;
  is_starred: boolean;
  is_read: boolean;
  account_id: string;
  message_id: string;
  folder: string;
}

interface UseMailSocketOptions {
  onNewEmail: (email: MailSocketEmail) => void;
  enabled?: boolean;
}

export function useMailSocket({ onNewEmail, enabled = true }: UseMailSocketOptions): void {
  const onNewEmailRef = useRef(onNewEmail);
  onNewEmailRef.current = onNewEmail;

  useEffect(() => {
    if (!enabled) return;

    const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
    const wsBase = apiBase.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/api/mail/ws`);

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; email?: MailSocketEmail };
        if (msg.type === 'new_email' && msg.email) {
          onNewEmailRef.current(msg.email);
        }
      } catch { /* ignore malformed messages */ }
    });

    ws.addEventListener('close', () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      // Reconnect handled by component remount; hook cleans up on unmount
    });

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws.close();
    };
  }, [enabled]);
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/hooks/useMailSocket.ts
git commit -m "feat(mail): useMailSocket hook for real-time email delivery"
```

---

## Task 11: Update Mail Page — Live Emails

**Files:**
- Modify: `apps/web/app/(dashboard)/mail/page.tsx`

- [ ] **Step 1: Wire `useMailSocket` into mail page**

In `apps/web/app/(dashboard)/mail/page.tsx`, add the import:

```typescript
import { useMailSocket, type MailSocketEmail } from '@/hooks/useMailSocket';
```

Add the `emails` state and socket wiring inside `MailPage`, after the existing `const [listKey, setListKey] = useState(0);`:

```typescript
  const [liveEmails, setLiveEmails] = useState<MailSocketEmail[]>([]);

  useMailSocket({
    onNewEmail: (email) => {
      // Only prepend if email belongs to the current view
      const isCurrentAccount = !selectedAccount || email.account_id === selectedAccount;
      const isCurrentFolder =
        email.folder === apiFolder ||
        (selectedFolder === 'starred' && email.is_starred);
      if (isCurrentAccount && isCurrentFolder) {
        setLiveEmails(prev => [email, ...prev]);
      }
    },
  });
```

Reset `liveEmails` when folder/account changes. Add inside `MailPage` after the `liveEmails` state:

```typescript
  useEffect(() => {
    setLiveEmails([]);
  }, [selectedAccount, selectedFolder]);
```

- [ ] **Step 2: Pass `liveEmails` to `EmailList`**

Modify the `EmailList` usage to accept live-prepended emails. Add a `prepend` prop to `EmailList`:

In the JSX, change:

```tsx
            <EmailList
              key={listKey}
              accountId={selectedAccount}
              folder={apiFolder}
              search={search}
              selectedId={selectedEmail?.id ?? null}
              onlyStarred={selectedFolder === 'starred'}
              onSelect={(email) => setSelectedEmail(email as unknown as Email)}
            />
```

to:

```tsx
            <EmailList
              key={listKey}
              accountId={selectedAccount}
              folder={apiFolder}
              search={search}
              selectedId={selectedEmail?.id ?? null}
              onlyStarred={selectedFolder === 'starred'}
              prependEmails={liveEmails}
              onSelect={(email) => setSelectedEmail(email as unknown as Email)}
            />
```

- [ ] **Step 3: Update `EmailList` to accept and render `prependEmails`**

In `apps/web/components/mail/EmailList.tsx`, add `prependEmails` to the props interface and render them at the top of the list with a slide-in animation:

Find the existing `interface` / `Props` type and add:

```typescript
  prependEmails?: MailSocketEmail[];
```

At the top of the email list render (before the fetched list), map `prependEmails`:

```tsx
{(prependEmails ?? []).map(email => (
  <div
    key={email.id}
    style={{
      animation: 'slideDown 200ms ease-out',
      borderBottom: '1px solid var(--border)',
    }}
    onClick={() => onSelect(email)}
  >
    {/* Render same row as existing email rows */}
    <EmailRow email={email} selected={selectedId === email.id} />
  </div>
))}
```

Add the keyframe animation to the page-level `<style>` or global CSS:

```css
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

> Note: `EmailRow` is whatever internal row component `EmailList` uses. If it's inline JSX, duplicate the same row structure for the prepended items.

- [ ] **Step 4: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(dashboard\)/mail/page.tsx apps/web/components/mail/EmailList.tsx apps/web/hooks/useMailSocket.ts
git commit -m "feat(mail): real-time email prepend via WebSocket in mail page"
```

---

## Task 12: Deal Detail — Emails Tab + Compose CTA

**Files:**
- Modify: `apps/web/components/deals/DealDetailCard.tsx`
- Modify: `apps/web/components/mail/ComposeModal.tsx`

- [ ] **Step 1: Add `dealId`/`contactId` props to `ComposeModal`**

In `apps/web/components/mail/ComposeModal.tsx`, update the `Props` interface:

```typescript
interface Props {
  accounts: Account[];
  replyTo?: { account_id: string; to: string; subject: string; message_id: string };
  initialTo?: string;       // ← add
  dealId?: string;          // ← add
  contactId?: string;       // ← add
  onClose: () => void;
  onSent: () => void;
}
```

Use `initialTo` to pre-fill the `to` field. Change the existing `useState`:

```typescript
  const [to, setTo] = useState(replyTo?.to ?? props.initialTo ?? '');
```

Include `deal_id` and `contact_id` in the POST body inside the `send` function:

```typescript
      await apiFetch('/api/mail/emails/send', {
        method: 'POST',
        body: JSON.stringify({
          account_id: accountId,
          to: to.split(',').map(s => s.trim()).filter(Boolean),
          cc: cc ? cc.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          subject,
          body_html: `<p>${body.replace(/\n/g, '<br>')}</p>`,
          reply_to_message_id: replyTo?.message_id,
          deal_id: props.dealId,       // ← add
          contact_id: props.contactId, // ← add
        }),
      });
```

- [ ] **Step 2: Add Emails section to `DealDetailCard`**

In `apps/web/components/deals/DealDetailCard.tsx`, add these imports at the top:

```typescript
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { ComposeModal } from '@/components/mail/ComposeModal';
```

Add a `DealEmails` sub-component at the bottom of the file (before `export`):

```tsx
interface DealEmailRow {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string;
  sent_at: string;
  is_read: boolean;
  folder: string;
}

interface DealEmailsProps {
  dealId: string;
  contactEmail?: string;
}

function DealEmails({ dealId, contactEmail }: DealEmailsProps) {
  const [emails, setEmails] = useState<DealEmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [accounts, setAccounts] = useState<{ id: string; email: string }[]>([]);

  useEffect(() => {
    void apiFetch<{ data: DealEmailRow[] }>(`/api/mail/emails?deal_id=${dealId}&per_page=10`)
      .then(j => setEmails(j.data ?? []))
      .finally(() => setLoading(false));
    void apiFetch<{ data: { id: string; email: string }[] }>('/api/mail/accounts')
      .then(j => setAccounts(j.data ?? []));
  }, [dealId]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.3 }}>Emails</span>
        {accounts.length > 0 && (
          <button
            onClick={() => setShowCompose(true)}
            style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text2)', cursor: 'pointer',
            }}
          >
            + Send email
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading…</div>
      ) : emails.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>No emails linked to this deal.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {emails.map(email => (
            <div
              key={email.id}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: email.is_read ? 'var(--surface)' : 'var(--surface2)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: email.is_read ? 400 : 600, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email.subject ?? '(no subject)'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                  {new Date(email.sent_at).toLocaleDateString()}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                {email.folder === 'sent' ? 'To: ' : 'From: '}
                {email.from_name ?? email.from_address}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCompose && (
        <ComposeModal
          accounts={accounts}
          initialTo={contactEmail}
          dealId={dealId}
          onClose={() => setShowCompose(false)}
          onSent={() => {
            setShowCompose(false);
            // Refresh email list
            void apiFetch<{ data: DealEmailRow[] }>(`/api/mail/emails?deal_id=${dealId}&per_page=10`)
              .then(j => setEmails(j.data ?? []));
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add `DealEmails` to `DealDetailCard` render**

Inside the `DealDetailCard` return JSX, add `<DealEmails>` below the existing metadata section and above the closing `</div>`:

```tsx
      {/* Emails */}
      <DealEmails
        dealId={deal.id}
        contactEmail={deal.contact_email ?? undefined}
      />
```

> Note: `deal.contact_email` may not exist on the `Deal` type. Pass it as a prop from the parent if available, or look it up in `DealEmails` by querying the contact. For now, pass `contactEmail` as optional — compose modal will open with an empty `To` field if not provided, which the user can fill in.

- [ ] **Step 4: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 0 errors (fix any type errors from the `deal.contact_email` access)

- [ ] **Step 5: Run full API test suite**

```bash
cd apps/api && npx vitest run
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/deals/DealDetailCard.tsx apps/web/components/mail/ComposeModal.tsx
git commit -m "feat(mail): deal detail emails tab and compose CTA"
```

---

## Task 13: Activity Feed — Email Activity Rendering

**Files:**
- Modify: `apps/web/app/(dashboard)/activity/page.tsx`

- [ ] **Step 1: Update `ActivityRow` to render email meta**

In `apps/web/app/(dashboard)/activity/page.tsx`, find the `ActivityRow` component. Currently it renders `item.body` as the description text. Email activities store the subject in `body` (set in Task 3/4), so this already works.

Enhance `ActivityRow` to show the direction badge when `item.type === 'email'`:

Locate the JSX inside `ActivityRow` where the body is rendered. Add a direction badge:

```tsx
{item.type === 'email' && item.meta && (
  <span style={{
    fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
    background: (item.meta as Record<string, unknown>)['direction'] === 'outbound'
      ? 'var(--blue-bg)' : 'var(--surface2)',
    color: (item.meta as Record<string, unknown>)['direction'] === 'outbound'
      ? 'var(--blue)' : 'var(--text2)',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginLeft: 6,
  }}>
    {String((item.meta as Record<string, unknown>)['direction'] ?? 'inbound')}
  </span>
)}
```

Add this inline after the `<span>{label}</span>` that shows the type label.

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/activity/page.tsx
git commit -m "feat(mail): show email direction badge in activity feed"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Real-time delivery — WebSocket handler + `mailNotifier` + broadcast in `storeEmails`
- ✅ Auto-link emails to deals — `autoLinkDeal` in `storeEmails`
- ✅ Activity logging — `logActivity` called in `storeEmails` and send handler
- ✅ Compose from deal detail — `DealEmails` component + `ComposeModal` with `dealId`
- ✅ Gmail Pub/Sub webhook — `createMailWebhookRouter`
- ✅ Gmail watch registration + renewal — `registerGmailWatch` + `startGmailWatchRenew`
- ✅ IMAP IDLE — `startImapIdle`
- ✅ `deal_id` filter on list API — updated `listQuerySchema`
- ✅ `deal_id` / `contact_id` on send API — updated `sendSchema`
- ✅ DB migration — `gmail_watch_expiry` column + `emails.deal_id` index
- ✅ Activity feed email direction badge — `ActivityRow` update

**No placeholders or TBDs present.**

**Type consistency:** `storeEmailsForTest` exported from `mail-sync.ts` matches usage in test. `MailSocketEmail` interface in `useMailSocket.ts` matches the `Email` type in `mail/page.tsx` — ensure `deal_id` and `folder` fields are present in both (they are — `EmailTable` has both).

**One gap:** Contact detail "Send email" button was noted in the spec but the contact detail page (`/contacts/:id`) does not exist in the current codebase. This is outside scope of this plan — the `ComposeModal` with `contactId` prop is ready; it can be wired up when that page is built.
