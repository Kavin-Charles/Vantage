# Mail Connect Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework mail account connection so admins configure shared IMAP/SMTP server settings once, and individual users connect their mailbox with email + password only.

**Architecture:** New `workspace_imap_config` DB table (one row per workspace) stores shared IMAP/SMTP server settings. A new `mail-config.ts` route handles GET/PUT for this config (PUT is admin-only). `POST /api/mail/accounts/imap` is modified to fetch workspace config when host/port are omitted. A new `POST /api/mail/accounts/imap/test` endpoint verifies credentials against workspace config using a live IMAP connection. The settings page is rewritten as a flat list + modal (`ConnectAccountModal`) that adapts based on user role and whether workspace config exists.

**Tech Stack:** Kysely migrations, TypeScript strict, Zod, Express, ImapFlow (already installed), React, `apiFetch` utility.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/db/migrations/20260530_002_workspace_imap_config.ts` | Create | DB migration: create `workspace_imap_config` table |
| `packages/db/src/schema.ts` | Modify | Add `WorkspaceImapConfigTable`, add to `Database`, add convenience types |
| `apps/api/src/routes/mail-config.ts` | Create | `GET /api/mail/workspace-config` + `PUT /api/mail/workspace-config` (admin-only) |
| `apps/api/src/routes/mail-accounts.ts` | Modify | Add `POST /imap/test`; make host/port optional in `POST /imap` (fetch from workspace config) |
| `apps/api/src/index.ts` | Modify | Register `createMailConfigRouter` at `/api/mail/workspace-config` |
| `apps/api/src/__tests__/mail-config.test.ts` | Create | Tests for both workspace-config endpoints |
| `apps/api/src/__tests__/mail-accounts.test.ts` | Modify | Tests for `/imap/test` and modified `/imap` |
| `apps/web/app/(dashboard)/settings/mail/page.tsx` | Rewrite | Flat list + admin server config section + "Connect account" button |
| `apps/web/components/mail/ConnectAccountModal.tsx` | Create | Multi-step modal: provider picker → Gmail redirect or IMAP connect form |

---

## Task 1: DB Migration + Schema Types

**Files:**
- Create: `packages/db/migrations/20260530_002_workspace_imap_config.ts`
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Create the migration file**

```typescript
// packages/db/migrations/20260530_002_workspace_imap_config.ts
import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workspace_imap_config')
    .addColumn('workspace_id', 'uuid', col =>
      col.primaryKey().references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('imap_host', 'text', col => col.notNull())
    .addColumn('imap_port', 'integer', col => col.notNull())
    .addColumn('smtp_host', 'text', col => col.notNull())
    .addColumn('smtp_port', 'integer', col => col.notNull())
    .addColumn('use_ssl', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('workspace_imap_config').execute();
}
```

- [ ] **Step 2: Add schema types to `packages/db/src/schema.ts`**

After the `SystemSettingsTable` interface (around line 546), add:

```typescript
export interface WorkspaceImapConfigTable {
  workspace_id: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  use_ssl: Generated<boolean>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}
```

In the `Database` interface (after `system_settings: SystemSettingsTable;`), add:

```typescript
workspace_imap_config: WorkspaceImapConfigTable;
```

After the `CalendarEvent` convenience types at the end of the file, add:

```typescript
export type WorkspaceImapConfig = Selectable<WorkspaceImapConfigTable>;
export type NewWorkspaceImapConfig = Insertable<WorkspaceImapConfigTable>;
export type WorkspaceImapConfigUpdate = Updateable<WorkspaceImapConfigTable>;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd D:/Projects/Vencore
pnpm --filter @vencore/db tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/20260530_002_workspace_imap_config.ts packages/db/src/schema.ts
git commit -m "feat(db): add workspace_imap_config table"
```

---

## Task 2: Workspace IMAP Config Routes

**Files:**
- Create: `apps/api/src/routes/mail-config.ts`
- Create: `apps/api/src/__tests__/mail-config.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/__tests__/mail-config.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

function buildMockDb(rows: object[] = []) {
  const chain: Record<string, unknown> = {};
  const fns = ['selectFrom','where','selectAll','select','orderBy','execute',
                'executeTakeFirst','executeTakeFirstOrThrow','insertInto','values',
                'returning','returningAll','deleteFrom','updateTable','set','onConflict',
                'doUpdateSet','column'];
  for (const f of fns) chain[f] = vi.fn().mockReturnValue(chain);
  chain['execute'] = vi.fn().mockResolvedValue(rows);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(rows[0] ?? null);
  chain['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(rows[0] ?? { workspace_id: 'ws1' });
  return chain;
}

function buildReq(overrides: Record<string, unknown> = {}) {
  return {
    workspace: { id: 'ws1' },
    user: { id: 'u1', role: 'admin' },
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}

function buildRes() {
  const json = vi.fn();
  return { json, status: vi.fn().mockReturnValue({ json }), redirect: vi.fn() };
}

beforeEach(() => vi.resetModules());

describe('GET /api/mail/workspace-config', () => {
  it('returns config when it exists', async () => {
    const fakeConfig = { workspace_id: 'ws1', imap_host: 'imap.co.com', imap_port: 993,
                         smtp_host: 'smtp.co.com', smtp_port: 587, use_ssl: true };
    const db = buildMockDb([fakeConfig]);
    const { createMailConfigRouter } = await import('../routes/mail-config');
    const router = createMailConfigRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    const getHandler = routes[0]?.route?.stack[0]?.handle;
    const req = buildReq();
    const res = buildRes();
    await getHandler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: fakeConfig, error: null });
  });

  it('returns null when no config exists', async () => {
    const db = buildMockDb([]);
    const { createMailConfigRouter } = await import('../routes/mail-config');
    const router = createMailConfigRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    const getHandler = routes[0]?.route?.stack[0]?.handle;
    const req = buildReq();
    const res = buildRes();
    await getHandler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: null, error: null });
  });
});

describe('PUT /api/mail/workspace-config', () => {
  it('rejects non-admin with 403', async () => {
    const db = buildMockDb([]);
    const { createMailConfigRouter } = await import('../routes/mail-config');
    const router = createMailConfigRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    // PUT route has requireAdmin as first middleware in its stack
    const requireAdminHandler = routes[1]?.route?.stack[0]?.handle;
    const req = buildReq({ user: { id: 'u1', role: 'member' } });
    const res = buildRes();
    const next = vi.fn();
    requireAdminHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('upserts config and returns saved data for admin', async () => {
    const saved = { workspace_id: 'ws1', imap_host: 'imap.co.com', imap_port: 993,
                    smtp_host: 'smtp.co.com', smtp_port: 587, use_ssl: true };
    const db = buildMockDb([saved]);
    const { createMailConfigRouter } = await import('../routes/mail-config');
    const router = createMailConfigRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    // PUT route: stack[0] = requireAdmin, stack[1] = actual handler
    const putHandler = routes[1]?.route?.stack[1]?.handle;
    const req = buildReq({
      body: { imap_host: 'imap.co.com', imap_port: 993, smtp_host: 'smtp.co.com', smtp_port: 587, use_ssl: true },
    });
    const res = buildRes();
    await putHandler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: saved, error: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd D:/Projects/Vencore
pnpm --filter api test -- mail-config --run
```

Expected: FAIL — `Cannot find module '../routes/mail-config'`

- [ ] **Step 3: Create the route file**

```typescript
// apps/api/src/routes/mail-config.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/auth';

const workspaceImapConfigSchema = z.object({
  imap_host: z.string().min(1),
  imap_port: z.coerce.number().int().min(1).max(65535),
  smtp_host: z.string().min(1),
  smtp_port: z.coerce.number().int().min(1).max(65535),
  use_ssl: z.boolean().default(true),
});

export function createMailConfigRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/mail/workspace-config
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const config = await db
        .selectFrom('workspace_imap_config')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .executeTakeFirst();
      res.json({ data: config ?? null, error: null });
    } catch (err) { next(err); }
  });

  // PUT /api/mail/workspace-config — admin only
  router.put('/', requireAdmin, async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = workspaceImapConfigSchema.parse(req.body);
      const config = await db
        .insertInto('workspace_imap_config')
        .values({ workspace_id: workspace.id, ...body })
        .onConflict(oc =>
          oc.column('workspace_id').doUpdateSet({
            imap_host: body.imap_host,
            imap_port: body.imap_port,
            smtp_host: body.smtp_host,
            smtp_port: body.smtp_port,
            use_ssl: body.use_ssl,
            updated_at: new Date().toISOString(),
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();
      res.json({ data: config, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 4: Register in `apps/api/src/index.ts`**

Add import at the top with the other mail imports:
```typescript
import { createMailConfigRouter } from './routes/mail-config';
```

Add route registration after the mail accounts route (around line 103):
```typescript
app.use('/api/mail/workspace-config', requireAuth, createMailConfigRouter(db));
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter api test -- mail-config --run
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/mail-config.ts apps/api/src/__tests__/mail-config.test.ts apps/api/src/index.ts
git commit -m "feat(api): add workspace IMAP config endpoints"
```

---

## Task 3: IMAP Test Endpoint + Modified IMAP Connect

**Files:**
- Modify: `apps/api/src/routes/mail-accounts.ts`
- Modify: `apps/api/src/__tests__/mail-accounts.test.ts`

- [ ] **Step 1: Write failing tests**

Add these test blocks to `apps/api/src/__tests__/mail-accounts.test.ts` (after existing tests):

```typescript
vi.mock('imapflow', () => ({
  ImapFlow: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('POST /api/mail/accounts/imap/test', () => {
  it('returns 400 when workspace config is missing', async () => {
    const db = buildMockDb([]);
    (db as Record<string, unknown>)['executeTakeFirst'] = vi.fn().mockResolvedValue(null);
    const { createMailAccountsRouter } = await import('../routes/mail-accounts');
    const router = createMailAccountsRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    // /imap/test is the 3rd route (index 2): after GET /, POST /gmail/auth-url
    const testRoute = routes.find((r: unknown) => {
      const route = (r as { route?: { path?: string } }).route;
      return route?.path === '/imap/test';
    });
    const handler = (testRoute as { route: { stack: { handle: Function }[] } }).route.stack[0]?.handle;
    const req = buildReq({ body: { email: 'user@co.com', imap_pass: 'pass' } });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns ok when IMAP connection succeeds', async () => {
    const config = { workspace_id: 'ws1', imap_host: 'imap.co.com', imap_port: 993, smtp_host: 'smtp.co.com', smtp_port: 587, use_ssl: true };
    const db = buildMockDb([config]);
    const { createMailAccountsRouter } = await import('../routes/mail-accounts');
    const router = createMailAccountsRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    const testRoute = routes.find((r: unknown) => {
      const route = (r as { route?: { path?: string } }).route;
      return route?.path === '/imap/test';
    });
    const handler = (testRoute as { route: { stack: { handle: Function }[] } }).route.stack[0]?.handle;
    const req = buildReq({ body: { email: 'user@co.com', imap_pass: 'pass' } });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ data: { ok: true }, error: null });
  });
});

describe('POST /api/mail/accounts/imap (with workspace config fallback)', () => {
  it('fetches workspace config when imap_host not provided', async () => {
    const config = { workspace_id: 'ws1', imap_host: 'imap.co.com', imap_port: 993,
                     smtp_host: 'smtp.co.com', smtp_port: 587, use_ssl: true };
    const inserted = { id: 'acc1', email: 'user@co.com', provider: 'imap', imap_pass: 'enc', smtp_pass: 'enc',
                       access_token: null, refresh_token: null };
    const db = buildMockDb([config]);
    (db as Record<string, unknown>)['executeTakeFirstOrThrow'] = vi.fn().mockResolvedValue(inserted);
    const { createMailAccountsRouter } = await import('../routes/mail-accounts');
    const router = createMailAccountsRouter(db as never);
    const routes = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
    const imapRoute = routes.find((r: unknown) => {
      const route = (r as { route?: { path?: string; methods?: Record<string, boolean> } }).route;
      return route?.path === '/imap' && route?.methods?.['post'];
    });
    const handler = (imapRoute as { route: { stack: { handle: Function }[] } }).route.stack[0]?.handle;
    const req = buildReq({ body: { email: 'user@co.com', imap_pass: 'pass', smtp_pass: 'pass' } });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter api test -- mail-accounts --run
```

Expected: new tests FAIL — route `/imap/test` not found, existing tests still pass.

- [ ] **Step 3: Add `POST /imap/test` to `apps/api/src/routes/mail-accounts.ts`**

Add before the existing `POST /imap` handler (around line 71). Also add the `imapflow` import at the top:

```typescript
import { ImapFlow } from 'imapflow';
```

Add the test route:

```typescript
// POST /api/mail/accounts/imap/test
router.post('/imap/test', async (req, res) => {
  try {
    const { workspace } = req as unknown as AuthenticatedRequest;
    const body = z.object({
      email: z.string().email(),
      imap_pass: z.string().min(1),
    }).parse(req.body);

    const config = await db
      .selectFrom('workspace_imap_config')
      .where('workspace_id', '=', workspace.id)
      .selectAll()
      .executeTakeFirst();
    if (!config) {
      res.status(400).json({ data: null, error: { code: 'NO_WORKSPACE_CONFIG', message: 'Workspace mail server not configured' } });
      return;
    }

    const client = new ImapFlow({
      host: config.imap_host,
      port: config.imap_port,
      secure: config.use_ssl,
      auth: { user: body.email, pass: body.imap_pass },
      logger: false,
    });
    await Promise.race([
      client.connect().then(() => client.logout()),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timed out — check host and port')), 8000),
      ),
    ]);
    res.json({ data: { ok: true }, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    res.status(400).json({ data: null, error: { code: 'IMAP_TEST_FAILED', message } });
  }
});
```

- [ ] **Step 4: Modify `connectImapSchema` and `POST /imap` handler in `apps/api/src/routes/mail-accounts.ts`**

Replace the existing `connectImapSchema` (lines 13–25) with:

```typescript
const connectImapSchema = z.object({
  email: z.string().email(),
  display_name: z.string().optional(),
  imap_pass: z.string().min(1),
  smtp_pass: z.string().min(1),
  imap_user: z.string().optional(),
  imap_host: z.string().optional(),
  imap_port: z.coerce.number().int().min(1).max(65535).optional(),
  smtp_user: z.string().optional(),
  smtp_host: z.string().optional(),
  smtp_port: z.coerce.number().int().min(1).max(65535).optional(),
  use_ssl: z.boolean().optional(),
});
```

Replace the `POST /imap` handler body (inside the try block, from `const body = ...` to `res.status(201)...`) with:

```typescript
const { workspace, user } = req as unknown as AuthenticatedRequest;
const body = connectImapSchema.parse(req.body);

let imapHost = body.imap_host;
let imapPort = body.imap_port;
let smtpHost = body.smtp_host;
let smtpPort = body.smtp_port;
let useSsl = body.use_ssl;

if (!imapHost || !imapPort || !smtpHost || !smtpPort) {
  const wsConfig = await db
    .selectFrom('workspace_imap_config')
    .where('workspace_id', '=', workspace.id)
    .selectAll()
    .executeTakeFirst();
  if (!wsConfig) {
    res.status(400).json({ data: null, error: { code: 'NO_WORKSPACE_CONFIG', message: 'Workspace mail server not configured' } });
    return;
  }
  imapHost = imapHost ?? wsConfig.imap_host;
  imapPort = imapPort ?? wsConfig.imap_port;
  smtpHost = smtpHost ?? wsConfig.smtp_host;
  smtpPort = smtpPort ?? wsConfig.smtp_port;
  useSsl = useSsl ?? wsConfig.use_ssl;
}

const account = await db
  .insertInto('email_accounts')
  .values({
    user_id: user.id,
    workspace_id: workspace.id,
    provider: 'imap',
    email: body.email,
    display_name: body.display_name ?? body.email,
    imap_host: imapHost,
    imap_port: imapPort,
    imap_user: body.imap_user ?? body.email,
    imap_pass: encryptSecret(body.imap_pass),
    smtp_host: smtpHost,
    smtp_port: smtpPort,
    smtp_user: body.smtp_user ?? body.email,
    smtp_pass: encryptSecret(body.smtp_pass),
    use_ssl: useSsl ?? true,
    sync_status: 'syncing',
  })
  .returningAll()
  .executeTakeFirstOrThrow();
const { imap_pass: _ip, smtp_pass: _sp, access_token: _at, refresh_token: _rt, ...safe } = account;
void runFullSync(db, account.id);
res.status(201).json({ data: safe, error: null });
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter api test -- mail-accounts --run
```

Expected: all tests PASS (including new ones).

- [ ] **Step 6: Run full test suite to check no regressions**

```bash
pnpm --filter api test --run
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/mail-accounts.ts apps/api/src/__tests__/mail-accounts.test.ts
git commit -m "feat(api): add IMAP test endpoint and workspace config fallback for IMAP connect"
```

---

## Task 4: Settings Page Rewrite

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/mail/page.tsx`

- [ ] **Step 1: Rewrite the settings page**

Replace the entire content of `apps/web/app/(dashboard)/settings/mail/page.tsx` with:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import ConnectAccountModal from '@/components/mail/ConnectAccountModal';

interface MailAccount {
  id: string;
  provider: 'gmail' | 'imap';
  email: string;
  display_name: string | null;
  sync_status: 'idle' | 'syncing' | 'error';
  sync_error: string | null;
  last_synced_at: string | null;
}

export interface WorkspaceImapConfig {
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  use_ssl: boolean;
}

interface ServerForm {
  imap_host: string;
  imap_port: string;
  smtp_host: string;
  smtp_port: string;
  use_ssl: boolean;
}

export default function MailSettingsPage() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceImapConfig | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'member'>('member');
  const [serverForm, setServerForm] = useState<ServerForm>({
    imap_host: '', imap_port: '993', smtp_host: '', smtp_port: '587', use_ssl: true,
  });
  const [showModal, setShowModal] = useState(false);
  const [savingServer, setSavingServer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('connected') === 'gmail') setSuccessMsg('Gmail account connected.');
    const oauthError = searchParams.get('error');
    if (oauthError) setError(`Gmail connection failed: ${oauthError}`);
  }, [searchParams]);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    const [meRes, configRes, accountsRes] = await Promise.all([
      apiFetch<{ data: { user: { role: 'admin' | 'member' } } }>('/api/me').catch(() => null),
      apiFetch<{ data: WorkspaceImapConfig | null }>('/api/mail/workspace-config').catch(() => null),
      apiFetch<{ data: MailAccount[] }>('/api/mail/accounts').catch(() => null),
    ]);
    if (meRes?.data?.user?.role) setUserRole(meRes.data.user.role);
    if (configRes) {
      setWorkspaceConfig(configRes.data);
      if (configRes.data) {
        setServerForm({
          imap_host: configRes.data.imap_host,
          imap_port: String(configRes.data.imap_port),
          smtp_host: configRes.data.smtp_host,
          smtp_port: String(configRes.data.smtp_port),
          use_ssl: configRes.data.use_ssl,
        });
      }
    }
    if (accountsRes) setAccounts(accountsRes.data ?? []);
  }

  async function saveServerConfig() {
    setSavingServer(true);
    setError(null);
    try {
      const saved = await apiFetch<{ data: WorkspaceImapConfig }>('/api/mail/workspace-config', {
        method: 'PUT',
        body: JSON.stringify({
          imap_host: serverForm.imap_host,
          imap_port: Number(serverForm.imap_port),
          smtp_host: serverForm.smtp_host,
          smtp_port: Number(serverForm.smtp_port),
          use_ssl: serverForm.use_ssl,
        }),
      });
      setWorkspaceConfig(saved.data);
      setSuccessMsg('Server settings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save server settings');
    } finally {
      setSavingServer(false);
    }
  }

  async function disconnect(id: string) {
    if (!confirm('Disconnect this account? All synced emails will be deleted.')) return;
    setError(null);
    try {
      await apiFetch(`/api/mail/accounts/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect');
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text)',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>Mail Accounts</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 24px' }}>
        Connect your Gmail or company mail to view and send emails inside Vencore.
      </p>

      {successMsg && (
        <div style={{ background: 'var(--green-bg)', color: 'var(--green)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {successMsg}
        </div>
      )}
      {error && (
        <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Admin: workspace IMAP server config */}
      {userRole === 'admin' && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Workspace Mail Server</h3>
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 14px' }}>
            Configure your company IMAP/SMTP server once. Team members only need to enter their password.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 80px', gap: 8, marginBottom: 10 }}>
            {([
              ['imap_host', 'IMAP host', 'imap.company.com'],
              ['imap_port', 'Port', '993'],
              ['smtp_host', 'SMTP host', 'smtp.company.com'],
              ['smtp_port', 'Port', '587'],
            ] as [keyof ServerForm, string, string][]).map(([key, label, placeholder]) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>{label}</label>
                <input
                  value={String(serverForm[key])}
                  onChange={e => setServerForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input
              type="checkbox"
              id="use-ssl"
              checked={serverForm.use_ssl}
              onChange={e => setServerForm(f => ({ ...f, use_ssl: e.target.checked }))}
            />
            <label htmlFor="use-ssl" style={{ fontSize: 13 }}>Use SSL/TLS</label>
          </div>
          <button
            onClick={() => void saveServerConfig()}
            disabled={savingServer}
            style={{ padding: '7px 14px', fontSize: 13, background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
          >
            {savingServer ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {/* Account list */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Your accounts</div>
        {accounts.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>No accounts connected yet.</p>
        )}
        {accounts.map(acc => (
          <div key={acc.id} style={{
            border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px',
            marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{acc.email}</div>
              <div style={{
                fontSize: 12, marginTop: 2,
                color: acc.sync_status === 'error' ? 'var(--red)'
                     : acc.sync_status === 'syncing' ? 'var(--amber)'
                     : 'var(--text3)',
              }}>
                {acc.provider === 'gmail' ? 'Gmail' : 'Company mail'} ·{' '}
                {acc.sync_status === 'syncing' ? 'Syncing…'
                 : acc.sync_status === 'error' ? `Error: ${acc.sync_error}`
                 : acc.last_synced_at ? `Synced ${new Date(acc.last_synced_at).toLocaleString()}`
                 : 'Not synced yet'}
              </div>
            </div>
            <button
              onClick={() => void disconnect(acc.id)}
              style={{ padding: '5px 12px', fontSize: 12, background: 'var(--red-bg)', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--red)' }}
            >
              Disconnect
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => setShowModal(true)}
        style={{ padding: '8px 16px', fontSize: 13, background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
      >
        Connect account
      </button>

      {showModal && (
        <ConnectAccountModal
          workspaceConfig={workspaceConfig}
          userRole={userRole}
          onClose={() => setShowModal(false)}
          onConnected={() => { setShowModal(false); void loadAll(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd D:/Projects/Vencore
pnpm --filter web tsc --noEmit
```

Expected: no errors (ConnectAccountModal not yet created — will show import error; fix that in Task 5 before checking here, or create a stub first).

**Stub to unblock compilation (will be replaced in Task 5):**
Create `apps/web/components/mail/ConnectAccountModal.tsx` with:
```typescript
export default function ConnectAccountModal(_props: unknown) { return null; }
```

Then re-run `pnpm --filter web tsc --noEmit`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/mail/page.tsx
git commit -m "feat(web): rewrite mail settings page with flat list and workspace config section"
```

---

## Task 5: ConnectAccountModal

**Files:**
- Create: `apps/web/components/mail/ConnectAccountModal.tsx`

- [ ] **Step 1: Replace the stub with the full component**

```typescript
// apps/web/components/mail/ConnectAccountModal.tsx
'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { WorkspaceImapConfig } from '@/app/(dashboard)/settings/mail/page';

interface Props {
  workspaceConfig: WorkspaceImapConfig | null;
  userRole: 'admin' | 'member';
  onClose: () => void;
  onConnected: () => void;
}

type Screen = 'pick' | 'gmail' | 'imap';

interface ServerFields {
  imap_host: string;
  imap_port: string;
  smtp_host: string;
  smtp_port: string;
  use_ssl: boolean;
}

export default function ConnectAccountModal({ workspaceConfig, userRole, onClose, onConnected }: Props) {
  const [screen, setScreen] = useState<Screen>('pick');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverFields, setServerFields] = useState<ServerFields>({
    imap_host: '', imap_port: '993', smtp_host: '', smtp_port: '587', use_ssl: true,
  });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admin with no prior config sees full server fields
  const showServerFields = !workspaceConfig && userRole === 'admin';
  // Non-admin with no config sees "ask admin" message
  const noConfig = !workspaceConfig && userRole !== 'admin';

  async function handleGmail() {
    setScreen('gmail');
    setError(null);
    try {
      const res = await apiFetch<{ data: { url: string } }>('/api/mail/accounts/gmail/auth-url', { method: 'POST' });
      window.location.href = res.data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start Gmail auth');
      setScreen('pick');
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      // Admin with no prior config: save server settings first
      if (showServerFields) {
        await apiFetch('/api/mail/workspace-config', {
          method: 'PUT',
          body: JSON.stringify({
            imap_host: serverFields.imap_host,
            imap_port: Number(serverFields.imap_port),
            smtp_host: serverFields.smtp_host,
            smtp_port: Number(serverFields.smtp_port),
            use_ssl: serverFields.use_ssl,
          }),
        });
      }

      // Test connection against workspace config (now saved if admin just set it)
      await apiFetch('/api/mail/accounts/imap/test', {
        method: 'POST',
        body: JSON.stringify({ email, imap_pass: password }),
      });

      // Connect account — pass server fields explicitly if admin just set them
      const body: Record<string, unknown> = {
        email,
        imap_pass: password,
        smtp_pass: password,
      };
      if (showServerFields) {
        body['imap_host'] = serverFields.imap_host;
        body['imap_port'] = Number(serverFields.imap_port);
        body['smtp_host'] = serverFields.smtp_host;
        body['smtp_port'] = Number(serverFields.smtp_port);
        body['use_ssl'] = serverFields.use_ssl;
      }
      await apiFetch('/api/mail/accounts/imap', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      onConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text)',
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
        padding: 24, width: 420, maxWidth: '90vw',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Connect mail account</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)', padding: 0, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '8px 12px', borderRadius: 6, marginBottom: 14, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Provider picker */}
        {screen === 'pick' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => void handleGmail()}
              style={{
                padding: '12px 16px', fontSize: 14, textAlign: 'left',
                background: 'var(--text)', color: '#fff', border: 'none',
                borderRadius: 8, cursor: 'pointer', fontWeight: 500,
              }}
            >
              Gmail
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>
                Connect via Google OAuth
              </div>
            </button>
            <button
              onClick={() => setScreen('imap')}
              style={{
                padding: '12px 16px', fontSize: 14, textAlign: 'left',
                background: 'var(--surface2)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontWeight: 500,
              }}
            >
              Company mail
              <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--text3)', marginTop: 2 }}>
                Connect via IMAP/SMTP
              </div>
            </button>
          </div>
        )}

        {/* Gmail redirecting */}
        {screen === 'gmail' && (
          <p style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', padding: '20px 0' }}>
            Redirecting to Google…
          </p>
        )}

        {/* Company mail: no config, non-admin */}
        {screen === 'imap' && noConfig && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
              Your admin hasn&apos;t configured the company mail server yet. Ask them to set it up in Settings → Mail.
            </p>
            <button
              onClick={() => setScreen('pick')}
              style={{ padding: '8px 14px', fontSize: 13, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
            >
              Back
            </button>
          </div>
        )}

        {/* Company mail: connect form (config exists OR admin setting up for first time) */}
        {screen === 'imap' && !noConfig && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Existing config: show locked server info */}
            {workspaceConfig && (
              <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>
                Server: {workspaceConfig.imap_host}:{workspaceConfig.imap_port} ·{' '}
                {workspaceConfig.smtp_host}:{workspaceConfig.smtp_port}
              </p>
            )}

            {/* Admin first-time setup: editable server fields */}
            {showServerFields && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
                  Server settings (saved for your team)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8, marginBottom: 8 }}>
                  {([
                    ['imap_host', 'IMAP host', 'imap.company.com'],
                    ['imap_port', 'Port', '993'],
                    ['smtp_host', 'SMTP host', 'smtp.company.com'],
                    ['smtp_port', 'Port', '587'],
                  ] as [keyof ServerFields, string, string][]).map(([key, label, placeholder]) => (
                    <div key={key}>
                      <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>{label}</label>
                      <input
                        value={String(serverFields[key])}
                        onChange={e => setServerFields(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    id="modal-use-ssl"
                    checked={serverFields.use_ssl}
                    onChange={e => setServerFields(f => ({ ...f, use_ssl: e.target.checked }))}
                  />
                  <label htmlFor="modal-use-ssl" style={{ fontSize: 13 }}>Use SSL/TLS</label>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => void handleConnect()}
                disabled={connecting || !email || !password}
                style={{
                  flex: 1, padding: '8px 14px', fontSize: 13,
                  background: 'var(--text)', color: '#fff', border: 'none',
                  borderRadius: 8, cursor: 'pointer', fontWeight: 500,
                  opacity: connecting || !email || !password ? 0.6 : 1,
                }}
              >
                {connecting ? 'Connecting…' : 'Connect'}
              </button>
              <button
                onClick={() => setScreen('pick')}
                style={{ padding: '8px 14px', fontSize: 13, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd D:/Projects/Vencore
pnpm --filter web tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual verification checklist**

Start the dev server:
```bash
cd D:/Projects/Vencore
npm run dev
```

Check:
1. Navigate to `http://localhost:3000/settings/mail`
2. **Admin user:** Workspace Mail Server card visible with 4 inputs + SSL checkbox + Save button
3. **Member user:** Workspace Mail Server card NOT visible
4. Accounts list shows connected accounts with status badges and Disconnect buttons
5. "Connect account" button opens the modal
6. **Modal - provider picker:** Two buttons visible (Gmail, Company mail)
7. **Modal - Gmail:** Clicking Gmail shows "Redirecting to Google…" and triggers OAuth
8. **Modal - Company mail (no config, admin):** Shows email + password + server settings section
9. **Modal - Company mail (config exists):** Shows email + password + locked server info text
10. **Modal - Company mail (no config, member):** Shows "Ask admin" message + Back button
11. Clicking Back returns to provider picker
12. Disconnect button shows confirmation and removes account on confirm

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/mail/ConnectAccountModal.tsx
git commit -m "feat(web): add ConnectAccountModal with Gmail and IMAP flows"
```

---

## Self-Review Checklist

- [x] All 4 modal states covered (Gmail, config exists, admin+no config, non-admin+no config)
- [x] `workspace_imap_config` migration matches schema types
- [x] `PUT /api/mail/workspace-config` is admin-only (requireAdmin applied in router)
- [x] `/imap/test` timeout 8s, returns raw IMAP error message
- [x] `POST /imap` backward-compatible: explicit host/port still accepted
- [x] `imap_user` defaults to `email` when not provided
- [x] `smtp_pass` uses same field as `imap_pass` in simplified connect form (one password field)
- [x] `WorkspaceImapConfig` type exported from page and imported by modal (avoids duplication)
- [x] No TBD or TODO placeholders
- [x] Type names consistent across tasks (`WorkspaceImapConfig`, `WorkspaceImapConfigTable`, `createMailConfigRouter`)
