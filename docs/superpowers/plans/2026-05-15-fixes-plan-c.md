# Fixes Plan C — Notifications

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two notification features: email alerts when infra alerts fire, and an in-app notification system with bell icon and unread badge.

**Architecture:** 
- Email: new `sendAlertEmail` helper wrapping nodemailer (already in package.json via auth.ts usage), called fire-and-forget after alert insert in agent.ts.
- In-app: new `notifications` DB table, CRUD routes, web badge + dropdown in Topbar.

**Tech Stack:** Node.js + Express + Kysely + Zod + nodemailer + Vitest (API). Next.js 14 App Router + TanStack Query (Web). pnpm workspace. Worktree at `D:/Projects/Vantage/.worktrees/fixes` on branch `feat/fixes-and-features`.

---

## File Map

| File | Change |
|---|---|
| `apps/api/src/lib/send-alert-email.ts` | Create — nodemailer helper for alert emails |
| `apps/api/src/routes/agent.ts` | Import send-alert-email, call after each new alert insert |
| `packages/db/migrations/20240109_001_notifications.ts` | Create — notifications table migration |
| `packages/db/src/schema.ts` | Add NotificationTable + Database entry |
| `apps/api/src/routes/notifications.ts` | Create — GET list, PATCH read, PATCH read-all |
| `apps/api/src/index.ts` | Register notifications route |
| `apps/web/components/NotificationBell.tsx` | Create — bell icon, unread count, dropdown |
| `apps/web/components/Topbar.tsx` | Import and render NotificationBell |
| `apps/api/src/__tests__/send-alert-email.test.ts` | Unit tests for email helper |
| `apps/api/src/__tests__/notifications.test.ts` | Unit tests for notifications route |

---

## Task 1: Email alert notification helper

**Files:**
- Create: `apps/api/src/lib/send-alert-email.ts`
- Create: `apps/api/src/__tests__/send-alert-email.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/send-alert-email.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock nodemailer before importing the module
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
    }),
  },
}));

const mockSmtp = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'noreply@example.com',
  password: 'secret',
  from: 'Vantage <noreply@example.com>',
};

describe('sendAlertEmail', () => {
  it('sends an email when smtp is configured', async () => {
    const nodemailer = await import('nodemailer');
    const { sendAlertEmail } = await import('../lib/send-alert-email');

    await sendAlertEmail(mockSmtp, ['admin@example.com'], {
      severity: 'critical',
      message: 'CPU usage at 97% on "prod-server" (threshold: 85%)',
      resource_type: 'server',
    });

    expect(nodemailer.default.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com' }),
    );
    const transport = (nodemailer.default.createTransport as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: expect.stringContaining('admin@example.com'),
        subject: expect.stringContaining('critical'),
      }),
    );
  });

  it('does not throw when smtp is null', async () => {
    const { sendAlertEmail } = await import('../lib/send-alert-email');
    await expect(sendAlertEmail(null, [], {
      severity: 'warning',
      message: 'test',
      resource_type: 'server',
    })).resolves.not.toThrow();
  });

  it('does not throw when adminEmails is empty', async () => {
    const { sendAlertEmail } = await import('../lib/send-alert-email');
    await expect(sendAlertEmail(mockSmtp, [], {
      severity: 'info',
      message: 'test',
      resource_type: 'server',
    })).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd D:/Projects/Vantage && pnpm --filter api test send-alert-email --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the email helper**

Create `apps/api/src/lib/send-alert-email.ts`:

```typescript
import type { SmtpConfig } from '@vantage/config';
import { logger } from './logger';

interface AlertInfo {
  severity: 'critical' | 'warning' | 'info';
  message: string;
  resource_type: string;
}

/**
 * Send an alert notification email to workspace admins.
 * Swallows errors — must never crash the parent request.
 */
export async function sendAlertEmail(
  smtp: SmtpConfig | null | undefined,
  adminEmails: string[],
  alert: AlertInfo,
): Promise<void> {
  if (!smtp || adminEmails.length === 0) return;

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.password },
    });

    const severityLabel = alert.severity.toUpperCase();
    await transporter.sendMail({
      from: smtp.from,
      to: adminEmails.join(', '),
      subject: `[Vantage ${severityLabel}] ${alert.resource_type} alert`,
      text: [
        `A ${alert.severity} alert was triggered:`,
        '',
        alert.message,
        '',
        'Log in to Vantage to acknowledge or resolve this alert.',
      ].join('\n'),
    });
  } catch (err) {
    logger.error({ err }, 'sendAlertEmail: failed to send');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd D:/Projects/Vantage && pnpm --filter api test send-alert-email --reporter=verbose 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add apps/api/src/lib/send-alert-email.ts apps/api/src/__tests__/send-alert-email.test.ts && git commit -m "feat(alerts): add sendAlertEmail helper for email notifications"
```

---

## Task 2: Wire email notifications into agent route

**Files:**
- Modify: `apps/api/src/routes/agent.ts`
- Modify: `apps/api/src/index.ts` — pass smtp config to agent router

The agent router currently only takes `db`. We need to also pass `smtp` config and a way to get admin emails.

- [ ] **Step 1: Update createAgentRouter signature**

In `apps/api/src/routes/agent.ts`, update the function signature and add email hook:

1. Add imports at top:

```typescript
import type { SmtpConfig } from '@vantage/config';
import { sendAlertEmail } from '../lib/send-alert-email';
```

2. Change function signature from:
```typescript
export function createAgentRouter(db: Kysely<Database>): ExpressRouter {
```
to:
```typescript
export function createAgentRouter(db: Kysely<Database>, smtp?: SmtpConfig | null): ExpressRouter {
```

3. After each `await db.insertInto('alerts').values({...}).execute();` call in the threshold evaluation loop, add:

```typescript
            // Fire-and-forget email notification
            void (async () => {
              try {
                const admins = await db
                  .selectFrom('users')
                  .where('workspace_id', '=', server.workspace_id)
                  .where('role', '=', 'admin')
                  .select('email')
                  .execute();
                await sendAlertEmail(smtp, admins.map(a => a.email), {
                  severity,
                  message: `${metric.prefix} at ${Math.round(metric.value)}% on "${server.name}" (threshold: ${metric.threshold}%)`,
                  resource_type: 'server',
                });
              } catch (err) {
                // already swallowed by sendAlertEmail, but catch here too
              }
            })();
```

- [ ] **Step 2: Pass smtp to agent router in index.ts**

In `apps/api/src/index.ts`, find:
```typescript
app.use('/api/agent', createAgentRouter(db));
```

Replace with:
```typescript
app.use('/api/agent', createAgentRouter(db, config.smtp));
```

- [ ] **Step 3: Run full test suite**

```bash
cd D:/Projects/Vantage && pnpm --filter api test --reporter=verbose 2>&1 | tail -20
```

Expected: All passing.

- [ ] **Step 4: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add apps/api/src/routes/agent.ts apps/api/src/index.ts && git commit -m "feat(alerts): send email to workspace admins when new alert fires"
```

---

## Task 3: In-app notifications — DB migration + schema

**Files:**
- Create: `packages/db/migrations/20240109_001_notifications.ts`
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Write the failing test**

There's no test to run here — this is a schema change. Run the migration after implementing.

- [ ] **Step 2: Create migration**

Create `packages/db/migrations/20240109_001_notifications.ts`:

```typescript
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('notifications')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(db.fn('gen_random_uuid', [])))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('type', 'varchar(50)', col => col.notNull())
    .addColumn('title', 'varchar(255)', col => col.notNull())
    .addColumn('body', 'text')
    .addColumn('resource_type', 'varchar(50)')
    .addColumn('resource_id', 'uuid')
    .addColumn('read', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(db.fn('now', [])))
    .execute();

  await db.schema
    .createIndex('notifications_user_id_idx')
    .on('notifications')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('notifications_workspace_read_idx')
    .on('notifications')
    .columns(['workspace_id', 'read'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('notifications').ifExists().execute();
}
```

- [ ] **Step 3: Add NotificationTable to schema.ts**

In `packages/db/src/schema.ts`, add after the `ApiKeyTable` interface:

```typescript
export interface NotificationTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  resource_type: string | null;
  resource_id: string | null;
  read: Generated<boolean>;
  created_at: Generated<Date>;
}
```

In the `Database` interface at the bottom of schema.ts, add:
```typescript
  notifications: NotificationTable;
```

Also add convenience types after existing ones:
```typescript
export type Notification = Selectable<NotificationTable>;
export type NewNotification = Insertable<NotificationTable>;
export type NotificationUpdate = Updateable<NotificationTable>;
```

- [ ] **Step 4: Run the migration**

```bash
cd D:/Projects/Vantage/packages/db && npm run db:migrate 2>&1 | tail -10
```

Expected: Migration runs successfully, `notifications` table created.

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add packages/db/migrations/20240109_001_notifications.ts packages/db/src/schema.ts && git commit -m "feat(notifications): add notifications table migration and schema"
```

---

## Task 4: Notifications API route

**Files:**
- Create: `apps/api/src/routes/notifications.ts`
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/src/__tests__/notifications.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/notifications.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

function buildMockDb(notifications: object[] = [], count = 0) {
  const chain: Record<string, unknown> = {};
  for (const f of ['selectFrom','where','selectAll','orderBy','limit','offset','select','execute','executeTakeFirstOrThrow','updateTable','set','returning']) {
    chain[f] = vi.fn().mockReturnValue(chain);
  }
  chain['execute'] = vi.fn().mockResolvedValue(notifications);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue({ count });
  chain['fn'] = { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) };
  return {
    selectFrom: vi.fn().mockReturnValue(chain),
    updateTable: vi.fn().mockReturnValue(chain),
    fn: { countAll: vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue('count') }) },
  };
}

describe('GET /api/notifications', () => {
  it('returns paginated notifications for current user', async () => {
    const fakeNotifs = [{ id: 'n1', title: 'Alert fired', read: false }];
    const db = buildMockDb(fakeNotifs, 1);
    const { createNotificationsRouter } = await import('../routes/notifications');
    const router = createNotificationsRouter(db as never);

    const getRoute = (router as unknown as { stack: { route: { path: string; method?: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/');
    expect(getRoute).toBeDefined();

    const handler = getRoute!.route.stack[0]!.handle;
    const req = { query: {}, workspace: { id: 'ws1' }, user: { id: 'u1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: fakeNotifs, total: 1, error: null }),
    );
  });
});

describe('PATCH /api/notifications/read-all', () => {
  it('marks all user notifications as read', async () => {
    const db = buildMockDb();
    const { createNotificationsRouter } = await import('../routes/notifications');
    const router = createNotificationsRouter(db as never);

    const readAllRoute = (router as unknown as { stack: { route: { path: string; stack: { handle: Function }[] } }[] }).stack
      .find(s => s.route?.path === '/read-all');
    expect(readAllRoute).toBeDefined();

    const handler = readAllRoute!.route.stack[0]!.handle;
    const req = { workspace: { id: 'ws1' }, user: { id: 'u1' } };
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await handler(req, res, vi.fn());

    expect(db.updateTable).toHaveBeenCalledWith('notifications');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd D:/Projects/Vantage && pnpm --filter api test notifications --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create notifications route**

Create `apps/api/src/routes/notifications.ts`:

```typescript
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(50).default(20),
  unread_only: z.coerce.boolean().optional(),
});

export function createNotificationsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/notifications
  router.get('/', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, unread_only } = parsed.data;

      let query = db
        .selectFrom('notifications')
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '=', user.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (unread_only) query = query.where('read', '=', false);

      const notifications = await query.execute();

      let countQuery = db
        .selectFrom('notifications')
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '=', user.id)
        .select(db.fn.countAll<number>().as('count'));

      if (unread_only) countQuery = countQuery.where('read', '=', false);

      const { count } = await countQuery.executeTakeFirstOrThrow();

      res.json({ data: notifications, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/notifications/unread-count
  router.get('/unread-count', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const { count } = await db
        .selectFrom('notifications')
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '=', user.id)
        .where('read', '=', false)
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

      res.json({ data: { count: Number(count) }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/notifications/read-all
  router.patch('/read-all', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      await db
        .updateTable('notifications')
        .set({ read: true })
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '=', user.id)
        .where('read', '=', false)
        .execute();

      res.json({ data: null, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/notifications/:id/read
  router.patch('/:id/read', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const notification = await db
        .updateTable('notifications')
        .set({ read: true })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '=', user.id)
        .returningAll()
        .executeTakeFirst();

      if (!notification) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Notification not found' } });
        return;
      }
      res.json({ data: notification, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 4: Register notifications route in index.ts**

In `apps/api/src/index.ts`, add import:
```typescript
import { createNotificationsRouter } from './routes/notifications';
```

And register after the activity route:
```typescript
app.use('/api/notifications', requireAuth, createNotificationsRouter(db));
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd D:/Projects/Vantage && pnpm --filter api test notifications --reporter=verbose 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 6: Run full test suite**

```bash
cd D:/Projects/Vantage && pnpm --filter api test --reporter=verbose 2>&1 | tail -20
```

Expected: All passing.

- [ ] **Step 7: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add apps/api/src/routes/notifications.ts apps/api/src/index.ts apps/api/src/__tests__/notifications.test.ts && git commit -m "feat(notifications): add in-app notifications API"
```

---

## Task 5: NotificationBell web component + Topbar integration

**Files:**
- Create: `apps/web/components/NotificationBell.tsx`
- Modify: `apps/web/components/Topbar.tsx`

- [ ] **Step 1: Create NotificationBell component**

Create `apps/web/components/NotificationBell.tsx`:

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: countData } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => apiFetch<{ data: { count: number }; error: null }>('/api/notifications/unread-count'),
    refetchInterval: 30_000,
  });

  const { data: listData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiFetch<{ data: Notification[]; error: null }>('/api/notifications?per_page=20'),
    enabled: open,
  });

  const readAllMut = useMutation({
    mutationFn: () => apiFetch('/api/notifications/read-all', { method: 'PATCH' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });

  const readOneMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const unread = countData?.data?.count ?? 0;
  const notifications: Notification[] = listData?.data ?? [];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: 34, height: 34, borderRadius: 8,
          border: '1px solid var(--border)',
          background: open ? 'var(--surface2)' : 'var(--surface)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}
        title="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text2)' }}>
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--red)',
            border: '1.5px solid var(--surface)',
          }} />
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 340,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 500,
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              Notifications {unread > 0 && `(${unread})`}
            </span>
            {unread > 0 && (
              <button
                onClick={() => readAllMut.mutate()}
                style={{
                  fontSize: 12, color: 'var(--text3)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
                No notifications
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => { if (!n.read) readOneMut.mutate(n.id); }}
                  style={{
                    padding: '12px 14px',
                    borderTop: '1px solid var(--border)',
                    background: n.read ? 'transparent' : 'var(--surface2)',
                    cursor: n.read ? 'default' : 'pointer',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  {!n.read && (
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: 'var(--blue)', flexShrink: 0, marginTop: 5,
                    }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 500, color: 'var(--text)', marginBottom: 2 }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                      {formatRelative(n.created_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add NotificationBell to Topbar**

In `apps/web/components/Topbar.tsx`:

1. Add import:
```tsx
import { NotificationBell } from './NotificationBell';
```

2. In the JSX, inside `<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>`, add `<NotificationBell />` before the `{action}` render:

```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Search */}
        <div style={{ ... }}>
          ...
        </div>

        <NotificationBell />

        {action}
      </div>
```

- [ ] **Step 3: Wire alert creation to notification creation in agent.ts**

In `apps/api/src/routes/agent.ts`, after the `await db.insertInto('alerts').values({...}).execute();` block (where the alert fires), also create notifications for all workspace users (or admins only):

Add after the alert insert inside the `if (!existingAlert)` block:

```typescript
            // Create in-app notifications for all workspace admins
            void (async () => {
              try {
                const admins = await db
                  .selectFrom('users')
                  .where('workspace_id', '=', server.workspace_id)
                  .where('role', '=', 'admin')
                  .select(['id', 'email'])
                  .execute();

                if (admins.length > 0) {
                  await db.insertInto('notifications').values(
                    admins.map(admin => ({
                      workspace_id: server.workspace_id,
                      user_id: admin.id,
                      type: 'alert',
                      title: `${severity === 'critical' ? '🔴' : '🟡'} ${metric.prefix} alert on "${server.name}"`,
                      body: `${metric.prefix} at ${Math.round(metric.value)}% (threshold: ${metric.threshold}%)`,
                      resource_type: 'server',
                      resource_id: server.id,
                    })),
                  ).execute();

                  // Also send email
                  await sendAlertEmail(smtp, admins.map(a => a.email), {
                    severity,
                    message: `${metric.prefix} at ${Math.round(metric.value)}% on "${server.name}" (threshold: ${metric.threshold}%)`,
                    resource_type: 'server',
                  });
                }
              } catch (err) {
                // swallow — notifications must not crash agent pings
              }
            })();
```

Note: Remove the earlier standalone `sendAlertEmail` call added in Task 2 (if you added it separately) — this replaces it.

- [ ] **Step 4: Run full test suite**

```bash
cd D:/Projects/Vantage && pnpm --filter api test --reporter=verbose 2>&1 | tail -20
```

Expected: All passing.

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/Vantage/.worktrees/fixes && git add apps/web/components/NotificationBell.tsx apps/web/components/Topbar.tsx apps/api/src/routes/agent.ts && git commit -m "feat(notifications): add in-app notification bell, badge, and alert wiring"
```
