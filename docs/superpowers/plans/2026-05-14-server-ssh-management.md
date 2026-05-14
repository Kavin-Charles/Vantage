# Server SSH Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SSH-based server management to Vantage — run commands, control systemd services, stream logs, and browse files on monitored servers, proxied through the API using a workspace RSA keypair.

**Architecture:** The Vantage API opens short-lived SSH sessions to each server's `ip_address` using an AES-256-encrypted workspace keypair stored in the DB. Output streams back to the browser via SSE (Server-Sent Events over POST using `fetch` + `ReadableStream`). Every executed command is logged for audit. The server detail page gains four new tabs: Terminal, Services, Logs, Files.

**Tech Stack:** `ssh2` (Node.js SSH client), Node.js `crypto` (AES-256-CBC), Express SSE (`res.write`), React fetch+ReadableStream SSE consumer.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/db/migrations/20240105_001_ssh_management.ts` | Create | DB migration — two new tables |
| `packages/db/src/schema.ts` | Modify | Add `WorkspaceSshKeypairTable`, `SshCommandLogTable` + convenience types |
| `packages/types/src/index.ts` | Modify | Add `WorkspaceSshKeypair`, `SshCommandLog`, `SshServiceEntry`, `SshFileEntry` |
| `packages/config/src/index.ts` | Modify | Add `SSH_ENCRYPTION_KEY` to `apiEnvSchema` |
| `.env.example` | Modify | Document `SSH_ENCRYPTION_KEY` |
| `apps/api/src/lib/ssh-crypto.ts` | Create | AES-256-CBC encrypt/decrypt for private keys |
| `apps/api/src/lib/ssh-exec.ts` | Create | `ssh2`-based SSH helper + SSE writer utility |
| `apps/api/src/routes/ssh-keypair.ts` | Create | `GET/DELETE /api/ssh/keypair` |
| `apps/api/src/routes/ssh-actions.ts` | Create | All `/api/servers/:id/ssh/*` routes |
| `apps/api/src/index.ts` | Modify | Register new routes, add `SSH_ENCRYPTION_KEY` to env parse |
| `apps/web/lib/ssh.ts` | Create | Fetch helpers + SSE-over-POST stream reader |
| `apps/web/app/(dashboard)/servers/[id]/page.tsx` | Modify | Add tab bar + Terminal/Services/Logs/Files tab panels |
| `apps/web/app/(dashboard)/settings/ssh/page.tsx` | Create | SSH keypair settings page |

---

## Task 1: DB Migration

**Files:**
- Create: `packages/db/migrations/20240105_001_ssh_management.ts`

- [ ] **Step 1: Install ssh2 package**

```bash
cd apps/api && pnpm add ssh2 && pnpm add -D @types/ssh2
```

Expected: `ssh2` appears in `apps/api/package.json` dependencies.

- [ ] **Step 2: Create the migration file**

```typescript
// packages/db/migrations/20240105_001_ssh_management.ts
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workspace_ssh_keypairs')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().unique().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('public_key', 'text', col => col.notNull())
    .addColumn('encrypted_private_key', 'text', col => col.notNull())
    .addColumn('iv', 'varchar(32)', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('ssh_command_log')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('server_id', 'uuid', col =>
      col.notNull().references('servers.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', col =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('command', 'text', col => col.notNull())
    .addColumn('exit_code', 'integer')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('ssh_command_log_server_id_idx')
    .on('ssh_command_log')
    .columns(['server_id', 'created_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('ssh_command_log').execute();
  await db.schema.dropTable('workspace_ssh_keypairs').execute();
}
```

- [ ] **Step 3: Run migration**

```bash
cd D:/Projects/Vantage && pnpm db:migrate
```

Expected output includes: `Executed 1 migrations` (or similar success message). Tables `workspace_ssh_keypairs` and `ssh_command_log` now exist in the database.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/20240105_001_ssh_management.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat: add ssh_management migration and install ssh2"
```

---

## Task 2: DB Schema Types

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Add table interfaces and convenience types**

Find the line `metrics_snapshots: MetricsSnapshotTable;` in the `Database` interface in `packages/db/src/schema.ts`. Add the two new table interfaces before it (at the top of the file with the other interfaces) and the table references + convenience types at the correct positions.

Add these two interfaces near the other table interfaces (e.g. after `AlertThresholdTable`):

```typescript
export interface WorkspaceSshKeypairTable {
  id: Generated<string>;
  workspace_id: string;
  public_key: string;
  encrypted_private_key: string;
  iv: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface SshCommandLogTable {
  id: Generated<string>;
  workspace_id: string;
  server_id: string;
  user_id: string;
  command: string;
  exit_code: number | null;
  created_at: Generated<string>;
}
```

Add to the `Database` interface (after `alert_thresholds: AlertThresholdTable;`):

```typescript
workspace_ssh_keypairs: WorkspaceSshKeypairTable;
ssh_command_log: SshCommandLogTable;
```

Add convenience types (after the existing `AlertThresholdUpdate` line):

```typescript
export type WorkspaceSshKeypair = Selectable<WorkspaceSshKeypairTable>;
export type NewWorkspaceSshKeypair = Insertable<WorkspaceSshKeypairTable>;
export type SshCommandLog = Selectable<SshCommandLogTable>;
export type NewSshCommandLog = Insertable<SshCommandLogTable>;
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd D:/Projects/Vantage && pnpm type-check
```

Expected: no errors from `packages/db`.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat: add WorkspaceSshKeypairTable and SshCommandLogTable to schema"
```

---

## Task 3: Shared Types

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Add new types to the end of `packages/types/src/index.ts`**

```typescript
export interface WorkspaceSshKeypair {
  id: string;
  workspace_id: string;
  public_key: string;
  // encrypted_private_key and iv are never sent to clients
  created_at: string;
  updated_at: string;
}

export interface SshCommandLog {
  id: string;
  workspace_id: string;
  server_id: string;
  user_id: string;
  command: string;
  exit_code: number | null;
  created_at: string;
}

export interface SshServiceEntry {
  name: string;
  load: string;
  active: string;
  sub: string;
  description: string;
}

export interface SshFileEntry {
  name: string;
  type: 'file' | 'dir' | 'link' | 'other';
  size: number;
  modified: string;
}

// SSE event shapes sent by SSH routes
export type SshStreamEvent =
  | { type: 'stdout'; line: string }
  | { type: 'stderr'; line: string }
  | { type: 'exit'; code: number }
  | { type: 'error'; message: string }
  | { type: 'service'; entry: SshServiceEntry };
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd D:/Projects/Vantage && pnpm type-check
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat: add SSH management shared types"
```

---

## Task 4: Config — SSH_ENCRYPTION_KEY

**Files:**
- Modify: `packages/config/src/index.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add `SSH_ENCRYPTION_KEY` to `apiEnvSchema`**

In `packages/config/src/index.ts`, find `apiEnvSchema` and add the new field:

```typescript
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string(),
  CRON_SECRET: z.string(),
  SSH_ENCRYPTION_KEY: z.string().min(64, 'SSH_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)'),
  PORT: z.coerce.number().default(3001),
});
```

- [ ] **Step 2: Add to `.env.example`**

Open `.env.example` and add after `JWT_SECRET`:

```
# SSH management — 32-byte hex key for encrypting stored SSH private keys
# Generate: openssl rand -hex 32
SSH_ENCRYPTION_KEY=
```

- [ ] **Step 3: Add to your local `apps/api/.env`**

```bash
echo "SSH_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> apps/api/.env
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd D:/Projects/Vantage && pnpm type-check
```

Expected: no errors. (The API won't start without `SSH_ENCRYPTION_KEY` now — that's correct.)

- [ ] **Step 5: Commit**

```bash
git add packages/config/src/index.ts .env.example
git commit -m "feat: add SSH_ENCRYPTION_KEY to config schema"
```

---

## Task 5: SSH Crypto Library

**Files:**
- Create: `apps/api/src/lib/ssh-crypto.ts`

- [ ] **Step 1: Create the crypto helper**

```typescript
// apps/api/src/lib/ssh-crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';

function getKey(): Buffer {
  const hex = process.env['SSH_ENCRYPTION_KEY'];
  if (!hex || hex.length !== 64) {
    throw new Error('SSH_ENCRYPTION_KEY must be a 64-char hex string');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptPrivateKey(plaintext: string): { encryptedPrivateKey: string; iv: string } {
  const key = getKey();
  const ivBuf = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, ivBuf);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    encryptedPrivateKey: encrypted.toString('base64'),
    iv: ivBuf.toString('hex'),
  };
}

export function decryptPrivateKey(encryptedPrivateKey: string, iv: string): string {
  const key = getKey();
  const ivBuf = Buffer.from(iv, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, ivBuf);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPrivateKey, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd D:/Projects/Vantage && pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/ssh-crypto.ts
git commit -m "feat: add AES-256-CBC SSH private key encrypt/decrypt"
```

---

## Task 6: SSH Exec Helper

**Files:**
- Create: `apps/api/src/lib/ssh-exec.ts`

This module wraps `ssh2` and provides two things:
1. `sseWrite(res, event)` — writes a typed SSE event to an Express response
2. `withSshSession(config, callback)` — opens an SSH connection, calls callback with the `Client`, closes on finish

- [ ] **Step 1: Create the helper**

```typescript
// apps/api/src/lib/ssh-exec.ts
import { Client, type ConnectConfig } from 'ssh2';
import type { Response } from 'express';
import type { SshStreamEvent } from '@vantage/types';

export interface SshSessionConfig {
  host: string;
  username: string;
  privateKey: string; // PEM string, decrypted
}

/** Write a typed SSE event to the response. Call res.end() separately when done. */
export function sseWrite(res: Response, event: SshStreamEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/** Set SSE headers on the response. Must be called before any sseWrite. */
export function sseStart(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

/**
 * Opens an SSH connection, runs the callback with the connected Client,
 * then ensures the connection is closed. The callback is responsible for
 * running commands and ending the session.
 *
 * Rejects after 30s if connection is not established.
 */
export function withSshSession(
  config: SshSessionConfig,
  callback: (conn: Client) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const connectTimeout = setTimeout(() => {
      conn.destroy();
      reject(new Error('SSH connection timeout (30s)'));
    }, 30_000);

    conn.on('ready', async () => {
      clearTimeout(connectTimeout);
      try {
        await callback(conn);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        conn.end();
      }
    });

    conn.on('error', (err) => {
      clearTimeout(connectTimeout);
      reject(err);
    });

    const connectConfig: ConnectConfig = {
      host: config.host,
      port: 22,
      username: config.username,
      privateKey: config.privateKey,
      readyTimeout: 30_000,
    };

    conn.connect(connectConfig);
  });
}

/**
 * Run a command on an open SSH connection and stream output via SSE.
 * Resolves with the exit code when the command finishes.
 */
export function runCommand(
  conn: Client,
  res: Response,
  command: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const sessionTimeout = setTimeout(() => {
      sseWrite(res, { type: 'error', message: 'Session timeout (5 minutes)' });
      resolve(1);
    }, 5 * 60_000);

    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(sessionTimeout);
        reject(err);
        return;
      }

      stream.stdout.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString('utf8').split('\n')) {
          if (line) sseWrite(res, { type: 'stdout', line });
        }
      });

      stream.stderr.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString('utf8').split('\n')) {
          if (line) sseWrite(res, { type: 'stderr', line });
        }
      });

      stream.on('close', (code: number) => {
        clearTimeout(sessionTimeout);
        resolve(code ?? 0);
      });

      stream.on('error', (err: Error) => {
        clearTimeout(sessionTimeout);
        reject(err);
      });
    });
  });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd D:/Projects/Vantage && pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/ssh-exec.ts
git commit -m "feat: add SSH session helper with SSE streaming"
```

---

## Task 7: Keypair Route

**Files:**
- Create: `apps/api/src/routes/ssh-keypair.ts`

- [ ] **Step 1: Create the keypair route**

```typescript
// apps/api/src/routes/ssh-keypair.ts
import { Router, type Router as ExpressRouter } from 'express';
import { generateKeyPairSync } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { encryptPrivateKey, decryptPrivateKey } from '../lib/ssh-crypto';

export function createSshKeypairRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/ssh/keypair — get (or generate) workspace public key
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      let keypair = await db
        .selectFrom('workspace_ssh_keypairs')
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'workspace_id', 'public_key', 'created_at', 'updated_at'])
        .executeTakeFirst();

      if (!keypair) {
        keypair = await generateAndStoreKeypair(db, workspace.id);
      }

      res.json({ data: keypair, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/ssh/keypair — regenerate (destroys old key)
  router.delete('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      await db
        .deleteFrom('workspace_ssh_keypairs')
        .where('workspace_id', '=', workspace.id)
        .execute();

      const keypair = await generateAndStoreKeypair(db, workspace.id);
      res.json({ data: keypair, error: null });
    } catch (err) { next(err); }
  });

  return router;
}

async function generateAndStoreKeypair(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<{ id: string; workspace_id: string; public_key: string; created_at: string; updated_at: string }> {
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
    })
    .returning(['id', 'workspace_id', 'public_key', 'created_at', 'updated_at'])
    .executeTakeFirstOrThrow();

  return row;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd D:/Projects/Vantage && pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/ssh-keypair.ts
git commit -m "feat: add SSH keypair route (generate, get, regenerate)"
```

---

## Task 8: SSH Actions Routes

**Files:**
- Create: `apps/api/src/routes/ssh-actions.ts`

This is the largest route file. It provides all `/api/servers/:id/ssh/*` endpoints.

- [ ] **Step 1: Create the shared helper at the top of the file**

```typescript
// apps/api/src/routes/ssh-actions.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { decryptPrivateKey } from '../lib/ssh-crypto';
import { sseStart, sseWrite, withSshSession, runCommand } from '../lib/ssh-exec';

/** Fetch the server, verify workspace ownership, check ip_address is set.
 *  Returns the server row or sends an error response and returns null. */
async function resolveServer(
  db: Kysely<Database>,
  req: Parameters<Parameters<ReturnType<typeof Router>['use']>[0]>[0],
  res: Parameters<Parameters<ReturnType<typeof Router>['use']>[0]>[1],
  workspaceId: string,
) {
  const server = await db
    .selectFrom('servers')
    .where('id', '=', (req.params as { id: string })['id']!)
    .where('workspace_id', '=', workspaceId)
    .select(['id', 'workspace_id', 'name', 'ip_address'])
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

/** Fetch and decrypt the workspace SSH private key. Returns null and sends error if missing. */
async function resolvePrivateKey(
  db: Kysely<Database>,
  res: Parameters<Parameters<ReturnType<typeof Router>['use']>[0]>[1],
  workspaceId: string,
): Promise<string | null> {
  const keypair = await db
    .selectFrom('workspace_ssh_keypairs')
    .where('workspace_id', '=', workspaceId)
    .select(['encrypted_private_key', 'iv'])
    .executeTakeFirst();

  if (!keypair) {
    res.status(400).json({
      data: null,
      error: { code: 'NO_KEYPAIR', message: 'No SSH keypair configured. Generate one in Settings → SSH.' },
    });
    return null;
  }

  return decryptPrivateKey(keypair.encrypted_private_key, keypair.iv);
}
```

- [ ] **Step 2: Add exec route**

Continue in the same file — add the router factory and exec route:

```typescript
export function createSshActionsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router({ mergeParams: true });

  // POST /api/servers/:id/ssh/exec
  router.post('/exec', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const { command } = z.object({ command: z.string().min(1) }).parse(req.body);

      const server = await resolveServer(db, req, res, workspace.id);
      if (!server) return;
      const privateKey = await resolvePrivateKey(db, res, workspace.id);
      if (!privateKey) return;

      sseStart(res);

      let exitCode: number | null = null;
      try {
        await withSshSession({ host: server.ip_address!, username: 'root', privateKey }, async (conn) => {
          exitCode = await runCommand(conn, res, command);
          sseWrite(res, { type: 'exit', code: exitCode });
        });
      } catch (err) {
        sseWrite(res, { type: 'error', message: (err as Error).message });
        exitCode = 1;
      }

      // Log the command
      await db.insertInto('ssh_command_log').values({
        workspace_id: workspace.id,
        server_id: server.id,
        user_id: user.id,
        command,
        exit_code: exitCode,
      }).execute();

      res.end();
    } catch (err) { next(err); }
  });
```

- [ ] **Step 3: Add services routes**

Continue in the same file:

```typescript
  // POST /api/servers/:id/ssh/services — list systemd services
  router.post('/services', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const server = await resolveServer(db, req, res, workspace.id);
      if (!server) return;
      const privateKey = await resolvePrivateKey(db, res, workspace.id);
      if (!privateKey) return;

      sseStart(res);

      try {
        await withSshSession({ host: server.ip_address!, username: 'root', privateKey }, async (conn) => {
          await runCommand(conn, res, 'systemctl list-units --type=service --no-pager --no-legend');
          sseWrite(res, { type: 'exit', code: 0 });
        });
      } catch (err) {
        sseWrite(res, { type: 'error', message: (err as Error).message });
      }

      res.end();
    } catch (err) { next(err); }
  });

  // POST /api/servers/:id/ssh/service/:name — action on a named service
  router.post('/service/:name', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const { action } = z.object({
        action: z.enum(['start', 'stop', 'restart', 'status']),
      }).parse(req.body);
      const serviceName = (req.params as { id: string; name: string })['name']!;
      // Sanitise: only allow alphanumeric, dash, dot, @
      if (!/^[\w@.-]+$/.test(serviceName)) {
        res.status(400).json({ data: null, error: { code: 'INVALID_SERVICE_NAME', message: 'Invalid service name' } });
        return;
      }

      const server = await resolveServer(db, req, res, workspace.id);
      if (!server) return;
      const privateKey = await resolvePrivateKey(db, res, workspace.id);
      if (!privateKey) return;

      sseStart(res);

      const command = `systemctl ${action} ${serviceName}`;
      let exitCode: number | null = null;
      try {
        await withSshSession({ host: server.ip_address!, username: 'root', privateKey }, async (conn) => {
          exitCode = await runCommand(conn, res, command);
          sseWrite(res, { type: 'exit', code: exitCode });
        });
      } catch (err) {
        sseWrite(res, { type: 'error', message: (err as Error).message });
        exitCode = 1;
      }

      await db.insertInto('ssh_command_log').values({
        workspace_id: workspace.id,
        server_id: server.id,
        user_id: user.id,
        command,
        exit_code: exitCode,
      }).execute();

      res.end();
    } catch (err) { next(err); }
  });
```

- [ ] **Step 4: Add logs route**

```typescript
  // POST /api/servers/:id/ssh/logs
  router.post('/logs', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = z.discriminatedUnion('source', [
        z.object({
          source: z.literal('journalctl'),
          service: z.string().optional(),
          lines: z.number().int().min(1).max(1000).default(200),
        }),
        z.object({
          source: z.literal('file'),
          path: z.string().min(1),
          lines: z.number().int().min(1).max(1000).default(200),
        }),
      ]).parse(req.body);

      const server = await resolveServer(db, req, res, workspace.id);
      if (!server) return;
      const privateKey = await resolvePrivateKey(db, res, workspace.id);
      if (!privateKey) return;

      let command: string;
      if (body.source === 'journalctl') {
        command = body.service
          ? `journalctl -u ${body.service} -n ${body.lines} --no-pager`
          : `journalctl -n ${body.lines} --no-pager`;
      } else {
        // Sanitise path — no shell metacharacters
        if (/[;&|`$<>]/.test(body.path)) {
          res.status(400).json({ data: null, error: { code: 'INVALID_PATH', message: 'Invalid path' } });
          return;
        }
        command = `tail -n ${body.lines} ${body.path}`;
      }

      sseStart(res);

      try {
        await withSshSession({ host: server.ip_address!, username: 'root', privateKey }, async (conn) => {
          await runCommand(conn, res, command);
          sseWrite(res, { type: 'exit', code: 0 });
        });
      } catch (err) {
        sseWrite(res, { type: 'error', message: (err as Error).message });
      }

      res.end();
    } catch (err) { next(err); }
  });
```

- [ ] **Step 5: Add files routes**

```typescript
  // POST /api/servers/:id/ssh/files — list directory
  router.post('/files', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { path } = z.object({ path: z.string().min(1).default('/') }).parse(req.body);
      if (/[;&|`$<>]/.test(path)) {
        res.status(400).json({ data: null, error: { code: 'INVALID_PATH', message: 'Invalid path' } });
        return;
      }

      const server = await resolveServer(db, req, res, workspace.id);
      if (!server) return;
      const privateKey = await resolvePrivateKey(db, res, workspace.id);
      if (!privateKey) return;

      const lines: string[] = [];
      // stat each entry with find for structured output
      const command = `ls -la --time-style=+%Y-%m-%dT%H:%M:%S ${path} 2>&1`;

      try {
        await withSshSession({ host: server.ip_address!, username: 'root', privateKey }, async (conn) => {
          return new Promise<void>((resolve, reject) => {
            conn.exec(command, (err, stream) => {
              if (err) { reject(err); return; }
              stream.stdout.on('data', (chunk: Buffer) => {
                lines.push(...chunk.toString('utf8').split('\n').filter(Boolean));
              });
              stream.stderr.on('data', (chunk: Buffer) => {
                lines.push(...chunk.toString('utf8').split('\n').filter(Boolean));
              });
              stream.on('close', () => resolve());
              stream.on('error', reject);
            });
          });
        });
      } catch (err) {
        res.status(500).json({ data: null, error: { code: 'SSH_ERROR', message: (err as Error).message } });
        return;
      }

      // Parse ls -la output (skip total line and . and ..)
      const entries = lines
        .filter(l => !l.startsWith('total') && !/ \.$/.test(l) && !/ \.\.$/.test(l) && l.trim().length > 0)
        .map(line => {
          const parts = line.split(/\s+/);
          const perms = parts[0] ?? '';
          const size = parseInt(parts[4] ?? '0', 10) || 0;
          const modified = parts[5] ?? '';
          const name = parts.slice(8).join(' ');
          const type: 'file' | 'dir' | 'link' | 'other' =
            perms.startsWith('d') ? 'dir'
            : perms.startsWith('l') ? 'link'
            : perms.startsWith('-') ? 'file'
            : 'other';
          return { name, type, size, modified };
        })
        .filter(e => e.name);

      res.json({ data: entries, error: null });
    } catch (err) { next(err); }
  });

  // GET /api/servers/:id/ssh/files/read — read file (1 MB limit)
  router.get('/files/read', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const filePath = req.query['path'] as string | undefined;
      if (!filePath) {
        res.status(400).json({ data: null, error: { code: 'MISSING_PATH', message: 'path query param required' } });
        return;
      }
      if (/[;&|`$<>]/.test(filePath)) {
        res.status(400).json({ data: null, error: { code: 'INVALID_PATH', message: 'Invalid path' } });
        return;
      }

      const server = await resolveServer(db, req, res, workspace.id);
      if (!server) return;
      const privateKey = await resolvePrivateKey(db, res, workspace.id);
      if (!privateKey) return;

      const MAX_BYTES = 1024 * 1024; // 1 MB
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let tooLarge = false;

      try {
        await withSshSession({ host: server.ip_address!, username: 'root', privateKey }, async (conn) => {
          return new Promise<void>((resolve, reject) => {
            conn.exec(`cat ${filePath}`, (err, stream) => {
              if (err) { reject(err); return; }
              stream.stdout.on('data', (chunk: Buffer) => {
                totalBytes += chunk.length;
                if (totalBytes > MAX_BYTES) { tooLarge = true; stream.close(); return; }
                chunks.push(chunk);
              });
              stream.on('close', () => resolve());
              stream.on('error', reject);
            });
          });
        });
      } catch (err) {
        res.status(500).json({ data: null, error: { code: 'SSH_ERROR', message: (err as Error).message } });
        return;
      }

      if (tooLarge) {
        res.status(413).json({ data: null, error: { code: 'FILE_TOO_LARGE', message: 'File exceeds 1 MB limit' } });
        return;
      }

      res.json({ data: { content: Buffer.concat(chunks).toString('utf8') }, error: null });
    } catch (err) { next(err); }
  });

  // GET /api/servers/:id/ssh/history
  router.get('/history', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const serverId = (req.params as { id: string })['id']!;
      const page = Math.max(1, Number(req.query['page'] ?? 1));
      const perPage = Math.min(100, Number(req.query['per_page'] ?? 50));

      // Verify server belongs to workspace
      const server = await db
        .selectFrom('servers')
        .where('id', '=', serverId)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!server) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Server not found' } });
        return;
      }

      const logs = await db
        .selectFrom('ssh_command_log')
        .where('server_id', '=', serverId)
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(perPage)
        .offset((page - 1) * perPage)
        .execute();

      const total = await db
        .selectFrom('ssh_command_log')
        .where('server_id', '=', serverId)
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirst();

      res.json({ data: logs, total: Number(total?.count ?? 0), error: null });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd D:/Projects/Vantage && pnpm type-check
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/ssh-actions.ts
git commit -m "feat: add SSH actions routes (exec, services, logs, files, history)"
```

---

## Task 9: Register Routes in API Index

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add imports**

At the top of `apps/api/src/index.ts`, after the last existing import, add:

```typescript
import { createSshKeypairRouter } from './routes/ssh-keypair';
import { createSshActionsRouter } from './routes/ssh-actions';
```

- [ ] **Step 2: Register routes**

In `apps/api/src/index.ts`, after the `app.use('/api/alert-thresholds', ...)` line, add:

```typescript
// SSH management
app.use('/api/ssh', requireAuth, createSshKeypairRouter(db));
app.use('/api/servers/:id/ssh', requireAuth, createSshActionsRouter(db));
```

- [ ] **Step 3: Verify TypeScript and start API**

```bash
cd D:/Projects/Vantage && pnpm type-check
```

Then manually start the API and verify no startup crash:

```bash
cd apps/api && pnpm dev
```

Expected: API starts without errors. `SSH_ENCRYPTION_KEY missing` error means you forgot to add it to `.env` — run: `echo "SSH_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env`

- [ ] **Step 4: Smoke test keypair endpoint**

With the API running and logged in (cookie present), test:

```bash
curl -s -b "vantage_token=<your-token>" http://localhost:3001/api/ssh/keypair | jq .
```

Expected: `{ data: { id: "...", public_key: "-----BEGIN RSA PUBLIC KEY-----...", ... }, error: null }`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat: register SSH keypair and SSH actions routes"
```

---

## Task 10: Web SSH Library

**Files:**
- Create: `apps/web/lib/ssh.ts`

- [ ] **Step 1: Create the helper**

```typescript
// apps/web/lib/ssh.ts
import { apiFetch } from './api';
import type { WorkspaceSshKeypair, SshCommandLog, SshStreamEvent, SshFileEntry } from '@vantage/types';

// ── Keypair ──────────────────────────────────────────────────────────────────

export async function getSshKeypair(token: string) {
  return apiFetch<{ data: WorkspaceSshKeypair; error: null }>('/api/ssh/keypair', { token });
}

export async function regenerateSshKeypair(token: string) {
  return apiFetch<{ data: WorkspaceSshKeypair; error: null }>('/api/ssh/keypair', {
    method: 'DELETE',
    token,
  });
}

// ── SSH command history ───────────────────────────────────────────────────────

export async function getSshHistory(token: string, serverId: string, page = 1) {
  return apiFetch<{ data: SshCommandLog[]; total: number; error: null }>(
    `/api/servers/${serverId}/ssh/history?page=${page}`,
    { token },
  );
}

// ── File listing / reading ───────────────────────────────────────────────────

export async function listFiles(token: string, serverId: string, path: string) {
  return apiFetch<{ data: SshFileEntry[]; error: null }>(
    `/api/servers/${serverId}/ssh/files`,
    { method: 'POST', body: JSON.stringify({ path }), token },
  );
}

export async function readFile(token: string, serverId: string, path: string) {
  return apiFetch<{ data: { content: string }; error: null }>(
    `/api/servers/${serverId}/ssh/files/read?path=${encodeURIComponent(path)}`,
    { token },
  );
}

// ── SSE streaming (POST-based) ────────────────────────────────────────────────

/**
 * Opens an SSE stream from a POST endpoint.
 * EventSource only supports GET, so we use fetch + ReadableStream.
 *
 * @param url     Full URL to POST to
 * @param body    Request body (will be JSON-serialised)
 * @param token   Auth token (Bearer header)
 * @param onEvent Called for each parsed SSE event
 * @returns       AbortController — call .abort() to cancel the stream
 */
export function openSshStream(
  url: string,
  body: Record<string, unknown>,
  token: string,
  onEvent: (event: SshStreamEvent) => void,
): AbortController {
  const controller = new AbortController();

  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? '';

  (async () => {
    try {
      const res = await fetch(`${apiUrl}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        onEvent({ type: 'error', message: `HTTP ${res.status}: ${text}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE format: "data: {...}\n\n"
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(6)) as SshStreamEvent;
            onEvent(event);
          } catch {
            // ignore malformed events
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onEvent({ type: 'error', message: (err as Error).message });
      }
    }
  })();

  return controller;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd D:/Projects/Vantage && pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/ssh.ts
git commit -m "feat: add web SSH library with SSE-over-POST stream reader"
```

---

## Task 11: Server Detail Page — Tab Bar + Terminal Tab

**Files:**
- Modify: `apps/web/app/(dashboard)/servers/[id]/page.tsx`

The existing page renders the Overview content directly. We'll wrap it in a tab system.

- [ ] **Step 1: Add tab state and tab bar to the page**

At the top of the `ServerDetailPage` component, after the existing state/query hooks, add:

```typescript
const searchParams = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search)
  : new URLSearchParams();
const [tab, setTab] = useState<'overview' | 'terminal' | 'services' | 'logs' | 'files'>(
  (searchParams.get('tab') as 'overview' | 'terminal' | 'services' | 'logs' | 'files') ?? 'overview',
);
```

Replace the existing return block's content (everything inside `<div style={{ padding: 24 }}>`) with:

```tsx
<div style={{ padding: 24 }}>
  {/* Header */}
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{server.name}</h2>
    <Badge label={server.status} color={statusColor[server.status] ?? 'gray'} />
    {server.region && <span style={{ fontSize: 13, color: 'var(--text3)' }}>{server.region}</span>}
  </div>

  {/* Tab bar */}
  <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
    {(['overview', 'terminal', 'services', 'logs', 'files'] as const).map(t => (
      <button
        key={t}
        onClick={() => setTab(t)}
        style={{
          background: 'none',
          border: 'none',
          borderBottom: tab === t ? '2px solid var(--text)' : '2px solid transparent',
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: tab === t ? 600 : 400,
          color: tab === t ? 'var(--text)' : 'var(--text3)',
          cursor: 'pointer',
          textTransform: 'capitalize',
          marginBottom: -1,
        }}
      >
        {t}
      </button>
    ))}
  </div>

  {/* Tab panels */}
  {tab === 'overview' && <OverviewTab server={server} snapshots={snapshots} />}
  {tab === 'terminal' && <TerminalTab serverId={id} />}
  {tab === 'services' && <ServicesTab serverId={id} />}
  {tab === 'logs' && <LogsTab serverId={id} />}
  {tab === 'files' && <FilesTab serverId={id} />}
</div>
```

- [ ] **Step 2: Extract Overview content into `OverviewTab` component**

Add this component above `ServerDetailPage` in the same file, moving the sparklines + meta panel into it:

```tsx
function OverviewTab({
  server,
  snapshots,
}: {
  server: ReturnType<typeof useQuery>['data'] extends { data: infer S & { snapshots: MetricsSnapshot[] } } ? S : never;
  snapshots: MetricsSnapshot[];
}) {
  type NumericMetric = 'cpu_pct' | 'mem_pct' | 'disk_pct' | 'load_avg_1m' | 'net_in_bytes' | 'net_out_bytes';
  function snap(key: NumericMetric): number[] {
    return snapshots.map(s => Number(s[key]) || 0);
  }
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <MetricCard label="CPU" value={server.cpu_pct} unit="%" snapshots={snap('cpu_pct')} color="var(--blue)" />
        <MetricCard label="Memory" value={server.mem_pct} unit="%" snapshots={snap('mem_pct')} color="var(--purple)" />
        <MetricCard label="Disk" value={server.disk_pct} unit="%" snapshots={snap('disk_pct')} color="var(--amber)" />
        <MetricCard label="Load avg (1m)" value={server.load_avg_1m} unit="" snapshots={snap('load_avg_1m')} color="var(--green)" />
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Details</div>
        {[
          ['Uptime', server.uptime_seconds !== null ? `${Math.floor(server.uptime_seconds / 86400)}d ${Math.floor((server.uptime_seconds % 86400) / 3600)}h` : '—'],
          ['IP', server.ip_address ?? '—'],
          ['Last ping', server.last_ping_at ? new Date(server.last_ping_at).toLocaleString() : 'never'],
          ['Net in (interval)', server.net_in_bytes !== null ? `${(server.net_in_bytes / 1024).toFixed(1)} KB` : '—'],
          ['Net out (interval)', server.net_out_bytes !== null ? `${(server.net_out_bytes / 1024).toFixed(1)} KB` : '—'],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{value}</span>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Add TerminalTab component**

Add above `ServerDetailPage`:

```tsx
function TerminalTab({ serverId }: { serverId: string }) {
  const getToken = useApiToken();
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState<Array<{ type: string; text: string }>>([]);
  const [running, setRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [history, setHistory] = useState<import('@vantage/types').SshCommandLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  async function fetchHistory() {
    const token = await getToken();
    const result = await getSshHistory(token, serverId);
    setHistory(result.data);
  }

  async function runCmd() {
    if (!command.trim() || running) return;
    setRunning(true);
    setOutput([]);
    setExitCode(null);
    const token = await getToken();
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? '';

    const ctrl = openSshStream(
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
          fetchHistory();
        } else if (event.type === 'error') {
          setOutput(prev => [...prev, { type: 'error', text: event.message }]);
          setRunning(false);
        }
      },
    );

    // Clean up if component unmounts
    return () => ctrl.abort();
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={command}
          onChange={e => setCommand(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void runCmd(); }}
          placeholder="Enter command…"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'monospace', background: 'var(--bg)' }}
        />
        <Button onClick={runCmd} disabled={running} variant="primary">
          {running ? 'Running…' : 'Run'}
        </Button>
      </div>

      <pre
        ref={outputRef}
        style={{ background: '#1a1814', color: '#f0ede6', borderRadius: 8, padding: 16, fontSize: 12, fontFamily: 'monospace', minHeight: 200, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}
      >
        {output.map((line, i) => (
          <span key={i} style={{ color: line.type === 'stderr' || line.type === 'error' ? '#f87171' : '#f0ede6' }}>
            {line.text}{'\n'}
          </span>
        ))}
        {exitCode !== null && (
          <span style={{ color: exitCode === 0 ? '#4ade80' : '#f87171' }}>
            {'\n'}[exit {exitCode}]
          </span>
        )}
      </pre>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={() => { setShowHistory(h => !h); if (!showHistory) fetchHistory(); }}
          style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', padding: 0 }}
        >
          {showHistory ? '▾' : '▸'} History ({history.length})
        </button>
        {showHistory && (
          <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Command', 'Exit', 'When'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text3)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map(row => (
                <tr key={row.id} onClick={() => setCommand(row.command)} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: 'var(--text)' }}>{row.command}</td>
                  <td style={{ padding: '6px 8px', color: row.exit_code === 0 ? 'var(--green)' : 'var(--red)' }}>{row.exit_code ?? '—'}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text3)' }}>{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add missing imports to the top of the page file**

Add to the import block:

```typescript
import { useState, useRef } from 'react';
import { openSshStream, getSshHistory, listFiles, readFile } from '@/lib/ssh';
```

(Note: `useState` may already be imported — deduplicate if so.)

- [ ] **Step 5: Verify TypeScript**

```bash
cd D:/Projects/Vantage && pnpm type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(dashboard)/servers/[id]/page.tsx"
git commit -m "feat: add tab bar and Terminal tab to server detail page"
```

---

## Task 12: Server Detail Page — Services, Logs, Files Tabs

**Files:**
- Modify: `apps/web/app/(dashboard)/servers/[id]/page.tsx`

- [ ] **Step 1: Add ServicesTab component**

Add above `ServerDetailPage`:

```tsx
function ServicesTab({ serverId }: { serverId: string }) {
  const getToken = useApiToken();
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionOutput, setActionOutput] = useState<{ name: string; lines: string[]; exitCode: number | null } | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  async function fetchServices() {
    setLoading(true);
    setLines([]);
    const token = await getToken();
    openSshStream(
      `/api/servers/${serverId}/ssh/services`,
      {},
      token,
      (event) => {
        if (event.type === 'stdout') setLines(prev => [...prev, event.line]);
        if (event.type === 'exit' || event.type === 'error') setLoading(false);
      },
    );
  }

  async function doAction(serviceName: string, action: 'start' | 'stop' | 'restart' | 'status') {
    setActioning(serviceName);
    setActionOutput({ name: serviceName, lines: [], exitCode: null });
    const token = await getToken();
    openSshStream(
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
  }

  // Parse systemctl list-units --no-legend output: each line is space-separated
  // UNIT LOAD ACTIVE SUB DESCRIPTION
  const services = lines.map(line => {
    const parts = line.trim().split(/\s+/);
    return {
      name: parts[0] ?? '',
      load: parts[1] ?? '',
      active: parts[2] ?? '',
      sub: parts[3] ?? '',
      description: parts.slice(4).join(' '),
    };
  }).filter(s => s.name.endsWith('.service'));

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Button onClick={fetchServices} disabled={loading}>{loading ? 'Loading…' : 'Refresh services'}</Button>
      </div>

      {actionOutput && (
        <pre style={{ background: '#1a1814', color: '#f0ede6', borderRadius: 8, padding: 12, fontSize: 12, fontFamily: 'monospace', marginBottom: 16, maxHeight: 150, overflow: 'auto' }}>
          {actionOutput.lines.join('\n')}
          {actionOutput.exitCode !== null && `\n[exit ${actionOutput.exitCode}]`}
        </pre>
      )}

      {services.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Service', 'Active', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map((svc, i) => (
                <tr key={svc.name} style={{ borderBottom: i < services.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12 }}>{svc.name}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ color: svc.active === 'active' ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>{svc.active}</span>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text3)' }}>{svc.sub}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['start', 'stop', 'restart', 'status'] as const).map(a => (
                        <button key={a} disabled={actioning === svc.name}
                          onClick={() => doAction(svc.name, a)}
                          style={{ padding: '3px 10px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', cursor: 'pointer', color: 'var(--text)' }}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add LogsTab component**

```tsx
function LogsTab({ serverId }: { serverId: string }) {
  const getToken = useApiToken();
  const [source, setSource] = useState<'journalctl' | 'file'>('journalctl');
  const [service, setService] = useState('');
  const [filePath, setFilePath] = useState('');
  const [lines, setLines] = useState(200);
  const [output, setOutput] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const ctrlRef = useRef<ReturnType<typeof openSshStream> | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchLogs() {
    ctrlRef.current?.abort();
    setLoading(true);
    setOutput([]);
    const token = await getToken();
    const body = source === 'journalctl'
      ? { source: 'journalctl', service: service || undefined, lines }
      : { source: 'file', path: filePath, lines };
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
  }

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => void fetchLogs(), 10_000);
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={source} onChange={e => setSource(e.target.value as 'journalctl' | 'file')}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)' }}>
          <option value="journalctl">journalctl</option>
          <option value="file">File path</option>
        </select>
        {source === 'journalctl' ? (
          <input value={service} onChange={e => setService(e.target.value)} placeholder="Service (optional)"
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', width: 180 }} />
        ) : (
          <input value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="/var/log/app.log"
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', width: 240 }} />
        )}
        <select value={lines} onChange={e => setLines(Number(e.target.value))}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)' }}>
          {[50, 200, 500, 1000].map(n => <option key={n} value={n}>{n} lines</option>)}
        </select>
        <Button onClick={fetchLogs} disabled={loading}>{loading ? 'Loading…' : 'Fetch'}</Button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
          Auto-refresh (10s)
        </label>
      </div>
      <pre ref={outputRef}
        style={{ background: '#1a1814', color: '#f0ede6', borderRadius: 8, padding: 16, fontSize: 12, fontFamily: 'monospace', minHeight: 200, maxHeight: 500, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
        {output.join('\n')}
      </pre>
    </div>
  );
}
```

- [ ] **Step 3: Add FilesTab component**

```tsx
function FilesTab({ serverId }: { serverId: string }) {
  const getToken = useApiToken();
  const [path, setPath] = useState('/');
  const [entries, setEntries] = useState<import('@vantage/types').SshFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileModal, setFileModal] = useState<{ path: string; content: string } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  async function navigate(newPath: string) {
    setPath(newPath);
    setLoading(true);
    try {
      const token = await getToken();
      const result = await listFiles(token, serverId, newPath);
      setEntries(result.data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  async function openFile(filePath: string) {
    setFileLoading(true);
    try {
      const token = await getToken();
      const result = await readFile(token, serverId, filePath);
      setFileModal({ path: filePath, content: result.data.content });
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setFileLoading(false);
    }
  }

  // Build breadcrumb parts from current path
  const breadcrumbs = path.split('/').filter(Boolean);

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12, fontSize: 13, fontFamily: 'monospace' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', padding: 0 }}>/</button>
        {breadcrumbs.map((part, i) => {
          const targetPath = '/' + breadcrumbs.slice(0, i + 1).join('/');
          return (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: 'var(--text3)' }}>/</span>
              <button onClick={() => navigate(targetPath)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', padding: 0 }}>{part}</button>
            </span>
          );
        })}
        <Button onClick={() => navigate(path)} style={{ marginLeft: 8 }} disabled={loading}>
          {loading ? 'Loading…' : 'Go'}
        </Button>
      </div>

      {entries.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Name', 'Size', 'Modified'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={entry.name} style={{ borderBottom: i < entries.length - 1 ? '1px solid var(--border)' : 'none', cursor: entry.type === 'dir' || entry.type === 'file' ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (entry.type === 'dir') navigate(path.replace(/\/$/, '') + '/' + entry.name);
                    else if (entry.type === 'file') openFile(path.replace(/\/$/, '') + '/' + entry.name);
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12 }}>
                    <span style={{ marginRight: 6 }}>{entry.type === 'dir' ? '📁' : '📄'}</span>
                    {entry.name}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text3)' }}>{entry.type === 'dir' ? '—' : `${(entry.size / 1024).toFixed(1)} KB`}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--text3)' }}>{entry.modified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {fileModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setFileModal(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, width: '80vw', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{fileModal.path}</span>
              <Button onClick={() => setFileModal(null)}>Close</Button>
            </div>
            <pre style={{ padding: 16, overflow: 'auto', fontSize: 12, fontFamily: 'monospace', margin: 0, flex: 1, background: '#1a1814', color: '#f0ede6' }}>
              {fileModal.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add missing `useEffect` import** (if not already imported)

Ensure the imports at the top of the page file include `useEffect` and `useRef`:

```typescript
import { useState, useRef, useEffect, use } from 'react';
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd D:/Projects/Vantage && pnpm type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(dashboard)/servers/[id]/page.tsx"
git commit -m "feat: add Services, Logs, Files tabs to server detail page"
```

---

## Task 13: Settings SSH Page

**Files:**
- Create: `apps/web/app/(dashboard)/settings/ssh/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// apps/web/app/(dashboard)/settings/ssh/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/Button';
import { useApiToken } from '@/lib/useApiToken';
import { getSshKeypair, regenerateSshKeypair } from '@/lib/ssh';

export default function SshSettingsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['ssh-keypair'],
    queryFn: async () => getSshKeypair(await getToken()),
  });

  const regenMut = useMutation({
    mutationFn: async () => regenerateSshKeypair(await getToken()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ssh-keypair'] });
      setConfirming(false);
    },
  });

  const publicKey = data?.data?.public_key ?? '';

  function copyKey() {
    void navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Topbar />
      <div style={{ padding: 24, maxWidth: 720 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600 }}>SSH Keys</h2>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
          Vantage uses a single workspace SSH keypair to connect to your servers. Add the public key to{' '}
          <code style={{ fontFamily: 'monospace', fontSize: 12 }}>~/.ssh/authorized_keys</code> on each server you want to manage.
        </p>

        {isLoading ? (
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Public Key</span>
              <Button onClick={copyKey}>{copied ? 'Copied!' : 'Copy'}</Button>
            </div>
            <pre style={{ margin: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, fontSize: 11, fontFamily: 'monospace', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200 }}>
              {publicKey}
            </pre>
            <p style={{ margin: '16px 0 8px', fontSize: 12, color: 'var(--text3)' }}>
              Paste this into <code style={{ fontFamily: 'monospace' }}>~/.ssh/authorized_keys</code> on your server:
            </p>
            <pre style={{ margin: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, fontSize: 12, fontFamily: 'monospace' }}>
              echo '{`<paste-key-here>`}' &gt;&gt; ~/.ssh/authorized_keys
            </pre>
          </div>
        )}

        <div style={{ marginTop: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Regenerate keypair</div>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 12px' }}>
            This will invalidate the current keypair. You will need to update <code style={{ fontFamily: 'monospace', fontSize: 12 }}>authorized_keys</code> on every server before SSH access works again.
          </p>
          {!confirming ? (
            <Button variant="danger" onClick={() => setConfirming(true)}>Regenerate keypair</Button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--red)' }}>This cannot be undone. Continue?</span>
              <Button variant="danger" onClick={() => regenMut.mutate()} disabled={regenMut.isPending}>
                {regenMut.isPending ? 'Regenerating…' : 'Yes, regenerate'}
              </Button>
              <Button onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Add SSH link to settings navigation**

Find the settings navigation sidebar (check `apps/web/app/(dashboard)/settings/` — likely in `layout.tsx` or profile page). Add a link to `/settings/ssh`. If settings uses a sidebar nav, add:

```tsx
{ href: '/settings/ssh', label: 'SSH Keys' }
```

alongside the existing Profile / Team / Pipelines entries.

- [ ] **Step 3: Verify TypeScript**

```bash
cd D:/Projects/Vantage && pnpm type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/settings/ssh/page.tsx"
git commit -m "feat: add SSH keypair settings page"
```

---

## Task 14: Final Wiring + Manual Smoke Test

- [ ] **Step 1: Run full type check**

```bash
cd D:/Projects/Vantage && pnpm type-check
```

Expected: zero errors across all packages.

- [ ] **Step 2: Start the dev stack**

```bash
cd D:/Projects/Vantage && pnpm dev
```

- [ ] **Step 3: Smoke test — keypair generation**

1. Open `http://localhost:3000/settings/ssh`
2. Public key should appear (RSA-4096 PEM format)
3. Click "Copy" — key copies to clipboard
4. Click "Regenerate" — confirm dialog appears, confirm — new key appears

- [ ] **Step 4: Add test server IP and test Terminal tab**

1. Go to a server detail page
2. Make sure the server has `ip_address` set (edit if not)
3. Paste your public key into that server's `authorized_keys`
4. Click "Terminal" tab
5. Type `whoami` and press Run
6. Should stream `root` and `[exit 0]`

- [ ] **Step 5: Test Services tab**

1. Click "Services" tab, click "Refresh services"
2. systemd service list should appear
3. Click "status" on any service — output streams in

- [ ] **Step 6: Test Logs tab**

1. Click "Logs" tab
2. Select journalctl, click Fetch — last 200 lines stream in
3. Switch to File mode, type `/var/log/syslog`, Fetch

- [ ] **Step 7: Test Files tab**

1. Click "Files" tab
2. Navigate to `/etc` — directory listing appears
3. Click a file (e.g., `hostname`) — modal opens with content

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: server SSH management — terminal, services, logs, files"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by task |
|---|---|
| workspace RSA-4096 keypair | Task 7 |
| AES-256-CBC private key encryption | Task 5 |
| SSH_ENCRYPTION_KEY env var | Task 4 |
| GET/DELETE /api/ssh/keypair | Task 7 |
| POST /api/servers/:id/ssh/exec (SSE) | Task 8 |
| POST /api/servers/:id/ssh/services | Task 8 |
| POST /api/servers/:id/ssh/service/:name | Task 8 |
| POST /api/servers/:id/ssh/logs | Task 8 |
| POST /api/servers/:id/ssh/files | Task 8 |
| GET /api/servers/:id/ssh/files/read (1 MB limit) | Task 8 |
| GET /api/servers/:id/ssh/history | Task 8 |
| SSH connect timeout 30s, session max 5min | Task 6 |
| Command log to ssh_command_log | Task 8 |
| Service name sanitisation | Task 8 |
| Path sanitisation | Task 8 |
| Terminal tab with streaming output + history | Task 11 |
| Services tab with start/stop/restart | Task 12 |
| Logs tab with journalctl + file + auto-refresh | Task 12 |
| Files tab with breadcrumb + file modal | Task 12 |
| Settings SSH page with public key + regenerate | Task 13 |
| SSE-over-POST using fetch + ReadableStream | Task 10 |
| DB migration — workspace_ssh_keypairs + ssh_command_log | Task 1 |
| DB schema types | Task 2 |
| Shared types | Task 3 |
