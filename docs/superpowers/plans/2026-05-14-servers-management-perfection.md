# Servers Management Perfection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 SSH bugs (hardcoded root user, LogsTab auto-refresh keystroke trigger, SSE stream leaks on tab-switch) and add per-workspace SSH user, per-server SSH port, server edit UI, and agent token regeneration from the server detail page.

**Architecture:** Two additive DB migrations (one column each); minimal API changes to 3 existing routers; React component fixes and additions in 2 pages. No new pages. All DB changes are backward-compatible (new columns have DB defaults).

**Tech Stack:** PostgreSQL + Kysely migrations, Zod, Express, Next.js 14 App Router, TanStack Query, TypeScript strict, pnpm monorepo.

---

## File Map

| File | Action |
|------|--------|
| `packages/db/migrations/20240106_001_ssh_user.ts` | Create |
| `packages/db/migrations/20240106_002_server_ssh_port.ts` | Create |
| `packages/db/src/schema.ts` | Modify — add `ssh_user` to `WorkspaceSshKeypairTable`, `ssh_port` to `ServerTable` |
| `packages/types/src/index.ts` | Modify — add `ssh_user` to `WorkspaceSshKeypair`, `ssh_port` to `Server` |
| `apps/api/src/lib/ssh-exec.ts` | Modify — add `port?` to `SshSessionConfig`, use it in `connectConfig` |
| `apps/api/src/routes/ssh-keypair.ts` | Modify — fix route paths to `/keypair`, add `ssh_user` to GET/DELETE, add PATCH endpoint |
| `apps/api/src/routes/servers.ts` | Modify — add `ssh_port` to schemas and selects, add `POST /:id/token-regen` |
| `apps/api/src/routes/ssh-actions.ts` | Modify — `resolvePrivateKey` returns `{privateKey, sshUser}`, `resolveServer` returns `ssh_port`, update all 6 `withSshSession` calls |
| `apps/web/lib/servers.ts` | Modify — update `updateServer` body type, add `regenToken` |
| `apps/web/lib/ssh.ts` | Modify — add `updateSshUser` |
| `apps/web/app/(dashboard)/settings/ssh/page.tsx` | Modify — add `ssh_user` input + save |
| `apps/web/app/(dashboard)/servers/[id]/page.tsx` | Modify — edit modal, token regen in OverviewTab, 3 bug fixes |

---

### Task 1: DB Migration — ssh_user on workspace_ssh_keypairs

**Files:**
- Create: `packages/db/migrations/20240106_001_ssh_user.ts`

Context: Migration files in this project use `import type { Kysely } from 'kysely'` and export `up`/`down` functions. See `packages/db/migrations/20240105_001_ssh_management.ts` for the exact pattern. The `alterTable` schema builder adds a column to an existing table.

- [ ] **Step 1: Create the migration file**

```typescript
// packages/db/migrations/20240106_001_ssh_user.ts
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('workspace_ssh_keypairs')
    .addColumn('ssh_user', 'varchar(64)', col => col.notNull().defaultTo('root'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('workspace_ssh_keypairs')
    .dropColumn('ssh_user')
    .execute();
}
```

- [ ] **Step 2: Verify TypeScript syntax**

```bash
cd D:/Projects/Vantage
pnpm --filter @vantage/db exec tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/db/migrations/20240106_001_ssh_user.ts
git commit -m "feat: add ssh_user column to workspace_ssh_keypairs"
```

---

### Task 2: DB Migration — ssh_port on servers

**Files:**
- Create: `packages/db/migrations/20240106_002_server_ssh_port.ts`

Context: Same migration pattern as Task 1. `servers` table already exists from `20240101_001_initial_schema.ts`.

- [ ] **Step 1: Create the migration file**

```typescript
// packages/db/migrations/20240106_002_server_ssh_port.ts
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('servers')
    .addColumn('ssh_port', 'integer', col => col.notNull().defaultTo(22))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('servers')
    .dropColumn('ssh_port')
    .execute();
}
```

- [ ] **Step 2: Verify TypeScript syntax**

```bash
cd D:/Projects/Vantage
pnpm --filter @vantage/db exec tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/db/migrations/20240106_002_server_ssh_port.ts
git commit -m "feat: add ssh_port column to servers (default 22)"
```

---

### Task 3: DB Schema Types + Shared Types

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/types/src/index.ts`

Context: `ServerTable` is at line 113 in `packages/db/src/schema.ts`. `WorkspaceSshKeypairTable` is further down in the same file. In `packages/types/src/index.ts`, `Server` interface is at line 245 and `WorkspaceSshKeypair` is at line 340.

`Generated<T>` in Kysely = `ColumnType<T, T | undefined, T>` — the column is optional in `Insertable<>` (insert can omit it, DB uses default), required in `Selectable<>`. Use `Generated<number>` for `ssh_port` (DB default 22) and `Generated<string>` for `ssh_user` (DB default 'root').

- [ ] **Step 1: Add `ssh_port` to `ServerTable` in `packages/db/src/schema.ts`**

In `ServerTable`, after `net_out_bytes: number | null;` (line 126) and before `status`, add one line:

```typescript
  ssh_port: Generated<number>;
```

The full `ServerTable` after the edit:

```typescript
export interface ServerTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  region: string | null;
  ip_address: string | null;
  agent_token_hash: string;
  cpu_pct: number | null;
  mem_pct: number | null;
  disk_pct: number | null;
  uptime_seconds: number | null;
  load_avg_1m: number | null;
  net_in_bytes: number | null;
  net_out_bytes: number | null;
  ssh_port: Generated<number>;
  status: Generated<ServerStatus>;
  last_ping_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}
```

- [ ] **Step 2: Add `ssh_user` to `WorkspaceSshKeypairTable` in `packages/db/src/schema.ts`**

Find `WorkspaceSshKeypairTable` and add `ssh_user` after `iv`:

```typescript
export interface WorkspaceSshKeypairTable {
  id: Generated<string>;
  workspace_id: string;
  public_key: string;
  encrypted_private_key: string;
  iv: string;
  ssh_user: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}
```

- [ ] **Step 3: Add `ssh_port` to `Server` in `packages/types/src/index.ts`**

In `Server` interface (line 245), after `net_out_bytes: number | null;` and before `status`, add:

```typescript
  ssh_port: number;
```

Full `Server` interface after edit:

```typescript
export interface Server {
  id: string;
  workspace_id: string;
  name: string;
  region: string | null;
  ip_address: string | null;
  agent_token_hash: string;
  cpu_pct: number | null;
  mem_pct: number | null;
  disk_pct: number | null;
  uptime_seconds: number | null;
  load_avg_1m: number | null;
  net_in_bytes: number | null;
  net_out_bytes: number | null;
  ssh_port: number;
  status: ServerStatus;
  last_ping_at: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Add `ssh_user` to `WorkspaceSshKeypair` in `packages/types/src/index.ts`**

In `WorkspaceSshKeypair` (line 340), add `ssh_user` after `public_key`:

```typescript
export interface WorkspaceSshKeypair {
  id: string;
  workspace_id: string;
  public_key: string;
  ssh_user: string;
  // encrypted_private_key and iv are never sent to clients
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 5: Type-check both packages**

```bash
cd D:/Projects/Vantage
pnpm --filter @vantage/db exec tsc --noEmit 2>&1 | head -20
pnpm --filter @vantage/types exec tsc --noEmit 2>&1 | head -20
```

Expected: no errors in either

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/types/src/index.ts
git commit -m "feat: add ssh_user and ssh_port to schema and shared types"
```

---

### Task 4: SSH Exec Config — add port to SshSessionConfig

**Files:**
- Modify: `apps/api/src/lib/ssh-exec.ts`

Context: `SshSessionConfig` interface is near the top of the file. `withSshSession` builds a `connectConfig` object that currently hardcodes `port: 22`. We add optional `port?: number` to `SshSessionConfig` and use `config.port ?? 22` in the connection config. This is a pure additive change — all existing callers still work (omitting `port` uses 22).

- [ ] **Step 1: Add `port?` to `SshSessionConfig`**

Find:
```typescript
export interface SshSessionConfig {
  host: string;
  username: string;
  privateKey: string; // PEM string, decrypted
}
```

Replace with:
```typescript
export interface SshSessionConfig {
  host: string;
  port?: number;      // defaults to 22 if not provided
  username: string;
  privateKey: string; // PEM string, decrypted
}
```

- [ ] **Step 2: Update `connectConfig` inside `withSshSession`**

Find:
```typescript
    const connectConfig: ConnectConfig = {
      host: config.host,
      port: 22,
      username: config.username,
      privateKey: config.privateKey,
      readyTimeout: 30_000,
    };
```

Replace with:
```typescript
    const connectConfig: ConnectConfig = {
      host: config.host,
      port: config.port ?? 22,
      username: config.username,
      privateKey: config.privateKey,
      readyTimeout: 30_000,
    };
```

- [ ] **Step 3: Type-check**

```bash
cd D:/Projects/Vantage
pnpm --filter api exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/ssh-exec.ts
git commit -m "feat: add optional port to SshSessionConfig"
```

---

### Task 5: SSH Keypair Route — fix paths, add ssh_user, add PATCH

**Files:**
- Modify: `apps/api/src/routes/ssh-keypair.ts`

Context: There is a URL mismatch bug — the web lib (`apps/web/lib/ssh.ts`) calls `/api/ssh/keypair` but the current router registers `router.get('/')` and `router.delete('/')` which maps to `GET /api/ssh/` and `DELETE /api/ssh/`. Fix: change all routes to use the `/keypair` sub-path.

Also: `generateAndStoreKeypair` is the internal helper. Add `sshUser: string` parameter so DELETE can preserve the existing user.

The updated file adds:
- `z` import for Zod (validation on the new PATCH)
- `updateSshUserSchema` Zod schema
- `GET /keypair` — selects `ssh_user` in addition to existing columns
- `PATCH /keypair` — new endpoint to update `ssh_user`
- `DELETE /keypair` — reads existing `ssh_user` before deleting, passes it to `generateAndStoreKeypair`
- `generateAndStoreKeypair(db, workspaceId, sshUser)` — accepts `sshUser`, inserts it, returns it

- [ ] **Step 1: Rewrite `apps/api/src/routes/ssh-keypair.ts`**

```typescript
// apps/api/src/routes/ssh-keypair.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { generateKeyPairSync } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { encryptPrivateKey } from '../lib/ssh-crypto';

const updateSshUserSchema = z.object({
  ssh_user: z.string().min(1).max(64).regex(/^[\w.-]+$/, 'Invalid SSH username'),
});

export function createSshKeypairRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/ssh/keypair — get (or generate) workspace public key + ssh_user
  router.get('/keypair', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      let keypair = await db
        .selectFrom('workspace_ssh_keypairs')
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'workspace_id', 'public_key', 'ssh_user', 'created_at', 'updated_at'])
        .executeTakeFirst();

      if (!keypair) {
        keypair = await generateAndStoreKeypair(db, workspace.id, 'root');
      }

      res.json({ data: keypair, error: null });
    } catch (err) { next(err); }
  });

  // PATCH /api/ssh/keypair — update ssh_user only
  router.patch('/keypair', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { ssh_user } = updateSshUserSchema.parse(req.body);

      const updated = await db
        .updateTable('workspace_ssh_keypairs')
        .set({ ssh_user, updated_at: new Date().toISOString() })
        .where('workspace_id', '=', workspace.id)
        .returning(['id', 'workspace_id', 'public_key', 'ssh_user', 'created_at', 'updated_at'])
        .executeTakeFirst();

      if (!updated) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'No SSH keypair found. Visit Settings → SSH to generate one.' } });
        return;
      }
      res.json({ data: updated, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/ssh/keypair — regenerate keypair, preserve ssh_user
  router.delete('/keypair', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      // Read existing ssh_user before deleting so regeneration preserves it
      const existing = await db
        .selectFrom('workspace_ssh_keypairs')
        .where('workspace_id', '=', workspace.id)
        .select(['ssh_user'])
        .executeTakeFirst();

      await db
        .deleteFrom('workspace_ssh_keypairs')
        .where('workspace_id', '=', workspace.id)
        .execute();

      const keypair = await generateAndStoreKeypair(db, workspace.id, existing?.ssh_user ?? 'root');
      res.json({ data: keypair, error: null });
    } catch (err) { next(err); }
  });

  return router;
}

async function generateAndStoreKeypair(
  db: Kysely<Database>,
  workspaceId: string,
  sshUser: string,
): Promise<{ id: string; workspace_id: string; public_key: string; ssh_user: string; created_at: string; updated_at: string }> {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });

  const { encryptedPrivateKey, iv } = encryptPrivateKey(privateKey);

  const row = await db
    .insertInto('workspace_ssh_keypairs')
    .values({
      workspace_id: workspaceId,
      public_key: publicKey,
      encrypted_private_key: encryptedPrivateKey,
      iv,
      ssh_user: sshUser,
    })
    .returning(['id', 'workspace_id', 'public_key', 'ssh_user', 'created_at', 'updated_at'])
    .executeTakeFirstOrThrow();

  return row;
}
```

- [ ] **Step 2: Type-check**

```bash
cd D:/Projects/Vantage
pnpm --filter api exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/ssh-keypair.ts
git commit -m "feat: fix keypair route paths, add ssh_user to GET/DELETE, add PATCH endpoint"
```

---

### Task 6: Servers Route — ssh_port + token-regen

**Files:**
- Modify: `apps/api/src/routes/servers.ts`

Context:
- `updateServerSchema` is currently `createServerSchema.partial()`. `createServerSchema` has `name`, `region`, `ip_address`. We need `ssh_port` in update but NOT in create (it's a connection config, not a server property that the agent reports). Use `.extend()` on the partial to add `ssh_port`.
- The `GET /` and `GET /:id` selects need `'ssh_port'` added.
- New `POST /:id/token-regen` uses `randomBytes` and `createHash` which are already imported.

- [ ] **Step 1: Update `updateServerSchema`**

Find:
```typescript
const updateServerSchema = createServerSchema.partial();
```

Replace with:
```typescript
const updateServerSchema = createServerSchema.partial().extend({
  ssh_port: z.number().int().min(1).max(65535).optional(),
});
```

- [ ] **Step 2: Add `'ssh_port'` to the list select (`GET /`)**

Find the select array in the list route. It currently has `'net_out_bytes', 'status', 'last_ping_at'`. Change to include `'ssh_port'` between `net_out_bytes` and `status`:

```typescript
.select(['id', 'workspace_id', 'name', 'region', 'ip_address', 'cpu_pct', 'mem_pct', 'disk_pct', 'uptime_seconds', 'load_avg_1m', 'net_in_bytes', 'net_out_bytes', 'ssh_port', 'status', 'last_ping_at', 'created_at', 'updated_at'])
```

- [ ] **Step 3: Add `'ssh_port'` to the single-server select (`GET /:id`)**

Same change in the `GET /:id` route — there are two `.select([...])` calls there (one for the server, one for snapshots). Only the servers table select needs `ssh_port`:

```typescript
.select(['id', 'workspace_id', 'name', 'region', 'ip_address', 'cpu_pct', 'mem_pct', 'disk_pct', 'uptime_seconds', 'load_avg_1m', 'net_in_bytes', 'net_out_bytes', 'ssh_port', 'status', 'last_ping_at', 'created_at', 'updated_at'])
```

- [ ] **Step 4: Add `POST /:id/token-regen` endpoint**

Add this route before `return router;`:

```typescript
  // Regenerate agent token — new token returned once, same one-time reveal as POST /
  router.post('/:id/token-regen', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const updated = await db
        .updateTable('servers')
        .set({ agent_token_hash: tokenHash, updated_at: new Date().toISOString() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id', 'name'])
        .executeTakeFirst();

      if (!updated) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Server not found' } });
        return;
      }

      res.json({ data: { agent_token: rawToken }, error: null });
    } catch (err) { next(err); }
  });
```

- [ ] **Step 5: Type-check**

```bash
cd D:/Projects/Vantage
pnpm --filter api exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/servers.ts
git commit -m "feat: add ssh_port to server routes, add token-regen endpoint"
```

---

### Task 7: SSH Actions Route — real ssh_user + ssh_port in all connections

**Files:**
- Modify: `apps/api/src/routes/ssh-actions.ts`

Context: Two helpers at the top of the file handle DB lookups before each action:

`resolveServer` — selects `['id', 'workspace_id', 'name', 'ip_address']`. Add `'ssh_port'`.

`resolvePrivateKey` — returns `Promise<string | null>` (just the decrypted key). Change return type to `Promise<{ privateKey: string; sshUser: string } | null>` by adding `'ssh_user'` to the select and returning an object.

6 routes call both helpers and then call `withSshSession({ host: server.ip_address!, username: 'root', privateKey }, ...)`. Update all 6 to use `username: creds.sshUser, port: server.ssh_port, privateKey: creds.privateKey`. The `history` route does NOT call `withSshSession` — leave it unchanged.

- [ ] **Step 1: Update `resolveServer` to select and return `ssh_port`**

Find `resolveServer` and replace its select:

```typescript
async function resolveServer(
  db: Kysely<Database>,
  req: Request,
  res: Response,
  workspaceId: string,
) {
  const server = await db
    .selectFrom('servers')
    .where('id', '=', req.params['id']!)
    .where('workspace_id', '=', workspaceId)
    .select(['id', 'workspace_id', 'name', 'ip_address', 'ssh_port'])
    .executeTakeFirst();

  if (!server) {
    res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Server not found' } });
    return null;
  }
  if (!server.ip_address) {
    res.status(400).json({ data: null, error: { code: 'NO_IP', message: 'Server has no ip_address configured' } });
    return null;
  }
  return server;
}
```

- [ ] **Step 2: Update `resolvePrivateKey` to return `{ privateKey, sshUser }`**

Find `resolvePrivateKey` and replace entirely:

```typescript
async function resolvePrivateKey(
  db: Kysely<Database>,
  res: Response,
  workspaceId: string,
): Promise<{ privateKey: string; sshUser: string } | null> {
  const keypair = await db
    .selectFrom('workspace_ssh_keypairs')
    .where('workspace_id', '=', workspaceId)
    .select(['encrypted_private_key', 'iv', 'ssh_user'])
    .executeTakeFirst();

  if (!keypair) {
    res.status(400).json({
      data: null,
      error: { code: 'NO_KEYPAIR', message: 'No SSH keypair configured. Generate one in Settings → SSH.' },
    });
    return null;
  }

  return {
    privateKey: decryptPrivateKey(keypair.encrypted_private_key, keypair.iv),
    sshUser: keypair.ssh_user,
  };
}
```

- [ ] **Step 3: Update all 6 withSshSession call sites**

In each of the 6 routes (`/exec`, `/services`, `/service/:name`, `/logs`, POST `/files`, GET `/files/read`):

Change every occurrence of:
```typescript
const privateKey = await resolvePrivateKey(db, res, workspace.id);
if (!privateKey) return;
```
to:
```typescript
const creds = await resolvePrivateKey(db, res, workspace.id);
if (!creds) return;
```

And change every `withSshSession` call from:
```typescript
await withSshSession({ host: server.ip_address!, username: 'root', privateKey }, async (conn) => {
```
to:
```typescript
await withSshSession({ host: server.ip_address!, port: server.ssh_port, username: creds.sshUser, privateKey: creds.privateKey }, async (conn) => {
```

This same substitution applies to ALL 6 routes — the pattern is identical in each one.

- [ ] **Step 4: Type-check**

```bash
cd D:/Projects/Vantage
pnpm --filter api exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/ssh-actions.ts
git commit -m "fix: use workspace ssh_user and server ssh_port in all SSH connections"
```

---

### Task 8: Web Libs — servers.ts + ssh.ts

**Files:**
- Modify: `apps/web/lib/servers.ts`
- Modify: `apps/web/lib/ssh.ts`

Context:
- `updateServer` body type currently is `Partial<{ name: string; region: string }>` — missing `ip_address` and `ssh_port`. Extend it.
- Add `regenToken(token, id)` → `POST /api/servers/:id/token-regen`.
- Add `updateSshUser(token, ssh_user)` → `PATCH /api/ssh/keypair`.

- [ ] **Step 1: Rewrite `apps/web/lib/servers.ts`**

```typescript
import { apiFetch } from './api';
import type { Server, MetricsSnapshot } from '@vantage/types';

export async function listServers(token: string) {
  return apiFetch<{ data: Server[]; total: number; error: null }>('/api/servers', { token });
}

export async function createServer(token: string, body: { name: string; region?: string; ip_address?: string }) {
  return apiFetch<{ data: Server & { agent_token: string }; error: null }>('/api/servers', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function getServer(token: string, id: string) {
  return apiFetch<{ data: Server & { snapshots: MetricsSnapshot[] }; error: null }>(`/api/servers/${id}`, { token });
}

export async function updateServer(
  token: string,
  id: string,
  body: Partial<{ name: string; region: string; ip_address: string; ssh_port: number }>,
) {
  return apiFetch<{ data: Server; error: null }>(`/api/servers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteServer(token: string, id: string) {
  return apiFetch<{ data: { ok: boolean }; error: null }>(`/api/servers/${id}`, {
    method: 'DELETE',
    token,
  });
}

export async function regenToken(token: string, id: string) {
  return apiFetch<{ data: { agent_token: string }; error: null }>(`/api/servers/${id}/token-regen`, {
    method: 'POST',
    token,
  });
}
```

- [ ] **Step 2: Add `updateSshUser` to `apps/web/lib/ssh.ts`**

After the `regenerateSshKeypair` function (line 15), add:

```typescript
export async function updateSshUser(token: string, sshUser: string) {
  return apiFetch<{ data: WorkspaceSshKeypair; error: null }>('/api/ssh/keypair', {
    method: 'PATCH',
    body: JSON.stringify({ ssh_user: sshUser }),
    token,
  });
}
```

`WorkspaceSshKeypair` is already imported at line 2.

- [ ] **Step 3: Type-check**

```bash
cd D:/Projects/Vantage
pnpm --filter web exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/servers.ts apps/web/lib/ssh.ts
git commit -m "feat: add regenToken to servers lib, add updateSshUser to ssh lib"
```

---

### Task 9: SSH Settings Page — ssh_user input + save

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/ssh/page.tsx`

Context: The current page shows the public key display and a regenerate section. We add a "SSH Username" card between them. The `ssh_user` value comes from `data?.data?.ssh_user` (now returned by the API since Task 5). State is synced from the query result via `useEffect`. Saving calls `PATCH /api/ssh/keypair` via `updateSshUser`.

- [ ] **Step 1: Rewrite `apps/web/app/(dashboard)/settings/ssh/page.tsx`**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/FormField';
import { useApiToken } from '@/lib/useApiToken';
import { getSshKeypair, regenerateSshKeypair, updateSshUser } from '@/lib/ssh';

export default function SshSettingsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sshUser, setSshUser] = useState('');
  const [sshUserError, setSshUserError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['ssh-keypair'],
    queryFn: async () => getSshKeypair(await getToken()),
  });

  useEffect(() => {
    if (data?.data?.ssh_user) setSshUser(data.data.ssh_user);
  }, [data]);

  const regenMut = useMutation({
    mutationFn: async () => regenerateSshKeypair(await getToken()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ssh-keypair'] });
      setConfirming(false);
    },
  });

  const sshUserMut = useMutation({
    mutationFn: async () => updateSshUser(await getToken(), sshUser),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ssh-keypair'] });
      setSshUserError('');
    },
    onError: (err: Error) => {
      setSshUserError(err.message);
    },
  });

  function handleSshUserSave(e: React.FormEvent) {
    e.preventDefault();
    if (!sshUser.trim()) { setSshUserError('Username is required'); return; }
    if (!/^[\w.-]+$/.test(sshUser)) { setSshUserError('Only letters, digits, dots, hyphens and underscores allowed'); return; }
    setSshUserError('');
    sshUserMut.mutate();
  }

  const publicKey = data?.data?.public_key ?? '';

  function copyKey() {
    void navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600 }}>SSH Keys</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Vantage uses a single workspace SSH keypair to connect to your servers. Add the public key to{' '}
        <code style={{ fontFamily: 'monospace', fontSize: 12 }}>~/.ssh/authorized_keys</code> on each server you want to manage.
      </p>

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {/* Public key */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Public Key</div>
              <Button onClick={copyKey}>{copied ? 'Copied!' : 'Copy'}</Button>
            </div>
            <pre style={{ margin: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, fontSize: 11, fontFamily: 'monospace', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200 }}>
              {publicKey}
            </pre>
            <p style={{ margin: '16px 0 8px', fontSize: 12, color: 'var(--text3)' }}>
              Add this key to <code style={{ fontFamily: 'monospace' }}>~/.ssh/authorized_keys</code> on your server:
            </p>
            <pre style={{ margin: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, fontSize: 12, fontFamily: 'monospace' }}>
              {'echo "<PUBLIC_KEY>" >> ~/.ssh/authorized_keys'}
            </pre>
          </div>

          {/* SSH Username */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>SSH Username</div>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 12px' }}>
              The user Vantage SSH-es in as. Common values:{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 12 }}>root</code>,{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 12 }}>ubuntu</code>,{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 12 }}>ec2-user</code>.
            </p>
            <form onSubmit={handleSshUserSave} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <FormField label="">
                  <Input
                    value={sshUser}
                    onChange={e => setSshUser(e.target.value)}
                    placeholder="root"
                    style={{ fontFamily: 'monospace' }}
                  />
                </FormField>
                {sshUserError && (
                  <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>{sshUserError}</div>
                )}
              </div>
              <Button type="submit" variant="primary" disabled={sshUserMut.isPending}>
                {sshUserMut.isPending ? 'Saving…' : 'Save'}
              </Button>
            </form>
          </div>

          {/* Regenerate */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Regenerate keypair</div>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 12px' }}>
              This will invalidate the current keypair. You will need to update{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 12 }}>authorized_keys</code> on every server before SSH access works again.
            </p>
            {!confirming ? (
              <Button onClick={() => setConfirming(true)}>Regenerate</Button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => setConfirming(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => regenMut.mutate()} disabled={regenMut.isPending}>
                  {regenMut.isPending ? 'Regenerating…' : 'Yes, regenerate'}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd D:/Projects/Vantage
pnpm --filter web exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add 'apps/web/app/(dashboard)/settings/ssh/page.tsx'
git commit -m "feat: add ssh_user input to SSH settings page"
```

---

### Task 10: Server Detail Page — Edit Modal + Token Regen

**Files:**
- Modify: `apps/web/app/(dashboard)/servers/[id]/page.tsx`

Context: The file currently imports `useQuery` from `@tanstack/react-query` and `getServer` from `@/lib/servers`. We need to add `useMutation`, `useQueryClient`, `updateServer`, `regenToken`, `Modal`, and `FormField`/`Input`.

`OverviewTab` currently takes `{ server, snapshots }` props. We add token regen state + mutation inside it (self-contained, uses `useApiToken` like the other tab components do).

`ServerDetailPage` gets an "Edit" button in the Topbar and an edit modal with state managed in the parent.

- [ ] **Step 1: Update imports at the top of the file**

Change line 4:
```typescript
import { use, useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
```
to:
```typescript
import { use, useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
```

Change line 10:
```typescript
import { getServer } from '@/lib/servers';
```
to:
```typescript
import { getServer, updateServer, regenToken } from '@/lib/servers';
```

After line 11 (after the `@/lib/ssh` import), add:
```typescript
import { Modal } from '@/components/ui/Modal';
import { FormField, Input } from '@/components/ui/FormField';
```

- [ ] **Step 2: Replace `OverviewTab` with token regen support**

Replace the entire `OverviewTab` function (lines 48–80) with:

```typescript
function OverviewTab({ server, snapshots }: {
  server: Server & { snapshots: MetricsSnapshot[] };
  snapshots: MetricsSnapshot[];
}) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [regenConfirming, setRegenConfirming] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const regenMut = useMutation({
    mutationFn: async () => regenToken(await getToken(), server.id),
    onSuccess: (res) => {
      setNewToken(res.data.agent_token);
      setRegenConfirming(false);
      qc.invalidateQueries({ queryKey: ['server', server.id] });
    },
  });

  return (
    <>
      {/* Metric sparklines */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <MetricCard label="CPU" value={server.cpu_pct} unit="%" snapshots={snap(snapshots, 'cpu_pct')} color="var(--blue)" />
        <MetricCard label="Memory" value={server.mem_pct} unit="%" snapshots={snap(snapshots, 'mem_pct')} color="var(--purple)" />
        <MetricCard label="Disk" value={server.disk_pct} unit="%" snapshots={snap(snapshots, 'disk_pct')} color="var(--amber)" />
        <MetricCard label="Load avg (1m)" value={server.load_avg_1m} unit="" snapshots={snap(snapshots, 'load_avg_1m')} color="var(--green)" />
      </div>

      {/* Meta */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Details</div>
        {[
          ['Uptime', server.uptime_seconds !== null ? `${Math.floor(server.uptime_seconds / 86400)}d ${Math.floor((server.uptime_seconds % 86400) / 3600)}h` : '—'],
          ['IP', server.ip_address ?? '—'],
          ['SSH Port', String(server.ssh_port ?? 22)],
          ['Last ping', server.last_ping_at ? new Date(server.last_ping_at).toLocaleString() : 'never'],
          ['Net in (interval)', server.net_in_bytes !== null ? `${(server.net_in_bytes / 1024).toFixed(1)} KB` : '—'],
          ['Net out (interval)', server.net_out_bytes !== null ? `${(server.net_out_bytes / 1024).toFixed(1)} KB` : '—'],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{value}</span>
          </div>
        ))}

        {/* Agent token regen */}
        <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Agent Token</div>
          {!regenConfirming ? (
            <Button onClick={() => setRegenConfirming(true)}>Regenerate token</Button>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 8px' }}>
                This disconnects the current agent until you update its token. Continue?
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => setRegenConfirming(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => regenMut.mutate()} disabled={regenMut.isPending}>
                  {regenMut.isPending ? 'Regenerating…' : 'Regenerate'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New token reveal modal */}
      {newToken && (
        <Modal title="New agent token" onClose={() => setNewToken(null)}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Copy this token now — it won&apos;t be shown again.
          </p>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', marginBottom: 16 }}>
            {newToken}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Update the agent on your server:</p>
          <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 12, overflow: 'auto' }}>
{`VANTAGE_TOKEN=${newToken} vantage-agent`}
          </pre>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button variant="primary" onClick={() => setNewToken(null)}>Done</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
```

- [ ] **Step 3: Add edit modal state + mutation to `ServerDetailPage`**

In `ServerDetailPage` (line 484+), add after the existing `tab` state declaration:

```typescript
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', region: '', ip_address: '', ssh_port: 22 });

  const editMut = useMutation({
    mutationFn: async () => updateServer(await getToken(), id, {
      name: editForm.name || undefined,
      region: editForm.region || undefined,
      ip_address: editForm.ip_address || undefined,
      ssh_port: editForm.ssh_port,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['server', id] });
      setEditOpen(false);
    },
  });

  function openEdit() {
    if (!server) return;
    setEditForm({
      name: server.name,
      region: server.region ?? '',
      ip_address: server.ip_address ?? '',
      ssh_port: server.ssh_port ?? 22,
    });
    setEditOpen(true);
  }
```

- [ ] **Step 4: Update Topbar and add edit modal JSX**

Change the Topbar line (currently `<Topbar action={<Button onClick={() => router.push('/servers')}>← Servers</Button>} />`):

```typescript
      <Topbar action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => router.push('/servers')}>← Servers</Button>
          <Button onClick={openEdit}>Edit</Button>
        </div>
      } />
```

After the closing `</>` of the tab content section (before the closing `</>` of the whole return), add:

```typescript
      {editOpen && (
        <Modal title={`Edit ${server.name}`} onClose={() => setEditOpen(false)}>
          <form onSubmit={e => { e.preventDefault(); editMut.mutate(); }}>
            <FormField label="Name *">
              <Input required value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </FormField>
            <FormField label="Region">
              <Input value={editForm.region} onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))} placeholder="us-east-1" />
            </FormField>
            <FormField label="IP Address">
              <Input value={editForm.ip_address} onChange={e => setEditForm(f => ({ ...f, ip_address: e.target.value }))} placeholder="1.2.3.4" />
            </FormField>
            <FormField label="SSH Port">
              <Input
                type="number"
                min={1}
                max={65535}
                value={String(editForm.ssh_port)}
                onChange={e => setEditForm(f => ({ ...f, ssh_port: parseInt(e.target.value, 10) || 22 }))}
              />
            </FormField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button type="button" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={editMut.isPending}>
                {editMut.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
```

- [ ] **Step 5: Type-check**

```bash
cd D:/Projects/Vantage
pnpm --filter web exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add 'apps/web/app/(dashboard)/servers/[id]/page.tsx'
git commit -m "feat: add server edit modal and token regen to server detail page"
```

---

### Task 11: Server Detail Page — Three Bug Fixes

**Files:**
- Modify: `apps/web/app/(dashboard)/servers/[id]/page.tsx`

Three bugs fixed in this task. All are in the same file as Task 10.

---

**Bug 1 — LogsTab: autoRefresh interval recreated on every keystroke**

Root cause (line 338–346): `useEffect` deps array is `[autoRefresh, source, service, filePath, lines]`. Any change to `service` or `filePath` (every keystroke) tears down and rebuilds the interval.

Fix: Remove all deps except `autoRefresh`. Read `source`/`service`/`filePath`/`lines` via refs so the interval callback always has current values.

- [ ] **Step 1: Add refs inside `LogsTab`**

After the existing `outputRef` and `ctrlRef` and `autoRefreshRef` declarations, add:

```typescript
  const sourceRef = useRef(source);
  const serviceRef = useRef(service);
  const filePathRef = useRef(filePath);
  const linesRef = useRef(lines);
```

- [ ] **Step 2: Add four sync effects inside `LogsTab`**

Add these four effects after the ref declarations:

```typescript
  useEffect(() => { sourceRef.current = source; }, [source]);
  useEffect(() => { serviceRef.current = service; }, [service]);
  useEffect(() => { filePathRef.current = filePath; }, [filePath]);
  useEffect(() => { linesRef.current = lines; }, [lines]);
```

- [ ] **Step 3: Update `fetchLogs` to read from refs**

Replace the `fetchLogs` function (lines 315–336):

```typescript
  function fetchLogs() {
    ctrlRef.current?.abort();
    setLoading(true);
    setOutput([]);
    const body = sourceRef.current === 'journalctl'
      ? { source: 'journalctl', service: serviceRef.current || undefined, lines: linesRef.current }
      : { source: 'file', path: filePathRef.current, lines: linesRef.current };
    getToken().then(token => {
      ctrlRef.current = openSshStream(
        `/api/servers/${serverId}/ssh/logs`,
        body,
        token,
        (event) => {
          if (event.type === 'stdout') {
            setOutput(prev => [...prev, event.line]);
            setTimeout(() => outputRef.current?.scrollTo(0, outputRef.current.scrollHeight), 0);
          }
          if (event.type === 'exit' || event.type === 'error') setLoading(false);
        },
      );
    });
  }
```

- [ ] **Step 4: Fix the `useEffect` deps**

Replace lines 338–346:

```typescript
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(fetchLogs, 10_000);
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh]);
```

Remove the `// eslint-disable-next-line react-hooks/exhaustive-deps` comment that was on line 345.

---

**Bug 2 — TerminalTab: SSE stream not cancelled on unmount**

Root cause: `runCmd` calls `openSshStream` (returns `AbortController`) but doesn't store it. When user switches tabs, `TerminalTab` unmounts but the stream keeps running.

- [ ] **Step 5: Add stream ref and cleanup effect to `TerminalTab`**

In `TerminalTab`, after `outputRef` declaration (line 90), add:

```typescript
  const streamRef = useRef<AbortController | null>(null);
```

After `fetchHistory` function definition, add a cleanup effect:

```typescript
  useEffect(() => {
    return () => { streamRef.current?.abort(); };
  }, []);
```

- [ ] **Step 6: Store the AbortController in `runCmd`**

Replace `runCmd` (lines 98–123):

```typescript
  async function runCmd() {
    if (!command.trim() || running) return;
    streamRef.current?.abort(); // cancel any prior stream
    setRunning(true);
    setOutput([]);
    setExitCode(null);
    const token = await getToken();

    streamRef.current = openSshStream(
      `/api/servers/${serverId}/ssh/exec`,
      { command },
      token,
      (event) => {
        if (event.type === 'stdout' || event.type === 'stderr') {
          setOutput(prev => [...prev, { type: event.type, text: event.line }]);
          setTimeout(() => outputRef.current?.scrollTo(0, outputRef.current.scrollHeight), 0);
        } else if (event.type === 'exit') {
          setExitCode(event.code);
          setRunning(false);
          void fetchHistory();
        } else if (event.type === 'error') {
          setOutput(prev => [...prev, { type: 'error', text: event.message }]);
          setRunning(false);
        }
      },
    );
  }
```

---

**Bug 3 — ServicesTab: SSE streams not cancelled on unmount**

Root cause: `fetchServices` and `doAction` both call `openSshStream` without storing the `AbortController`. Two streams can be live simultaneously.

- [ ] **Step 7: Add stream refs and cleanup effect to `ServicesTab`**

In `ServicesTab`, after the `actioning` state declaration (line 195), add:

```typescript
  const fetchStreamRef = useRef<AbortController | null>(null);
  const actionStreamRef = useRef<AbortController | null>(null);
```

After the ref declarations, add a cleanup effect:

```typescript
  useEffect(() => {
    return () => {
      fetchStreamRef.current?.abort();
      actionStreamRef.current?.abort();
    };
  }, []);
```

- [ ] **Step 8: Store the controller in `fetchServices`**

Replace `fetchServices` (lines 197–211):

```typescript
  function fetchServices() {
    fetchStreamRef.current?.abort();
    setLoading(true);
    setLines([]);
    getToken().then(token => {
      fetchStreamRef.current = openSshStream(
        `/api/servers/${serverId}/ssh/services`,
        {},
        token,
        (event) => {
          if (event.type === 'stdout') setLines(prev => [...prev, event.line]);
          if (event.type === 'exit' || event.type === 'error') setLoading(false);
        },
      );
    });
  }
```

- [ ] **Step 9: Store the controller in `doAction`**

Replace `doAction` (lines 213–237):

```typescript
  function doAction(serviceName: string, action: 'start' | 'stop' | 'restart' | 'status') {
    actionStreamRef.current?.abort();
    setActioning(serviceName);
    setActionOutput({ name: serviceName, lines: [], exitCode: null });
    getToken().then(token => {
      actionStreamRef.current = openSshStream(
        `/api/servers/${serverId}/ssh/service/${encodeURIComponent(serviceName)}`,
        { action },
        token,
        (event) => {
          if (event.type === 'stdout' || event.type === 'stderr') {
            setActionOutput(prev => prev ? { ...prev, lines: [...prev.lines, event.line] } : null);
          }
          if (event.type === 'exit') {
            setActionOutput(prev => prev ? { ...prev, exitCode: event.code } : null);
            setActioning(null);
            fetchServices();
          }
          if (event.type === 'error') {
            setActionOutput(prev => prev ? { ...prev, lines: [...prev.lines, event.message], exitCode: 1 } : null);
            setActioning(null);
          }
        },
      );
    });
  }
```

- [ ] **Step 10: Type-check**

```bash
cd D:/Projects/Vantage
pnpm --filter web exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 11: Commit**

```bash
git add 'apps/web/app/(dashboard)/servers/[id]/page.tsx'
git commit -m "fix: LogsTab autoRefresh keystroke bug, TerminalTab/ServicesTab SSE cleanup on unmount"
```
