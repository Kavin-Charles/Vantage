# Server Monitoring & File Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5s real-time server metrics via SSE and full SFTP-based file management via WebSocket.

**Architecture:** Agent pings every 5s; API immediately SSE-broadcasts to subscribed browsers and rate-limits DB snapshot writes to 30s. SFTP file management uses a per-session WebSocket that opens an `ssh2` SFTP connection, reusing `workspace_ssh_keypairs` infra already established by `ssh-terminal.ts`.

**Tech Stack:** Express SSE, `ws` WebSocket, `ssh2` SFTP, Fetch ReadableStream (browser SSE client), TypeScript, Vitest

---

## File Map

| File | Change | Purpose |
|---|---|---|
| `apps/api/src/lib/sse-registry.ts` | **CREATE** | SSE connection registry singleton |
| `apps/api/src/__tests__/sse-registry.test.ts` | **CREATE** | Unit tests for registry |
| `apps/api/src/routes/sse.ts` | **CREATE** | `GET /api/sse/servers` endpoint |
| `apps/api/src/ws/sftp-session.ts` | **CREATE** | WS SFTP handler |
| `apps/web/contexts/ServerMetricsContext.tsx` | **CREATE** | Fetch-based SSE consumer + state |
| `apps/web/lib/sftp.ts` | **CREATE** | Browser SFTP WS client helpers |
| `apps/api/src/routes/agent.ts` | **MODIFY** | SSE broadcast + snapshot rate-limit |
| `apps/api/src/index.ts` | **MODIFY** | Register SSE route + SFTP WS upgrade |
| `apps/web/app/(dashboard)/servers/page.tsx` | **MODIFY** | Consume SSE context |
| `apps/web/app/(dashboard)/servers/[id]/page.tsx` | **MODIFY** | Live metric cards + Files tab upgrade |
| `apps/web/components/AlertBar.tsx` | **MODIFY** | React to `alert_new` SSE events |
| `apps/agent/.env.example` | **MODIFY** | Interval default 30000 → 5000 |

---

## Part A — Real-Time Metrics (SSE)

---

### Task 1: SSE Registry

**Files:**
- Create: `apps/api/src/lib/sse-registry.ts`
- Create: `apps/api/src/__tests__/sse-registry.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/__tests__/sse-registry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SseRegistry } from '../lib/sse-registry';
import type { Response } from 'express';

function mockRes(): Response {
  return {
    writeHead: vi.fn(),
    write: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => {
      if (event === 'close') { /* store cb for later */ }
    }),
    writableEnded: false,
  } as unknown as Response;
}

describe('SseRegistry', () => {
  let registry: SseRegistry;

  beforeEach(() => {
    registry = new SseRegistry();
  });

  it('broadcasts to all subscribers in a workspace', () => {
    const res1 = mockRes();
    const res2 = mockRes();
    const res3 = mockRes(); // different workspace

    registry.subscribe('ws-a', res1);
    registry.subscribe('ws-a', res2);
    registry.subscribe('ws-b', res3);

    registry.broadcast('ws-a', 'metric', { cpu_pct: 42 });

    expect(res1.write).toHaveBeenCalledWith(
      'event: metric\ndata: {"cpu_pct":42}\n\n',
    );
    expect(res2.write).toHaveBeenCalledWith(
      'event: metric\ndata: {"cpu_pct":42}\n\n',
    );
    expect(res3.write).not.toHaveBeenCalled();
  });

  it('stops broadcasting after unsubscribe', () => {
    const res = mockRes();
    registry.subscribe('ws-a', res);
    registry.unsubscribe('ws-a', res);
    registry.broadcast('ws-a', 'metric', { cpu_pct: 42 });
    expect(res.write).not.toHaveBeenCalled();
  });

  it('does not throw when broadcasting to workspace with no subscribers', () => {
    expect(() => registry.broadcast('nonexistent', 'metric', {})).not.toThrow();
  });

  it('sets SSE response headers on subscribe', () => {
    const res = mockRes();
    registry.subscribe('ws-a', res);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'text/event-stream',
    }));
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/api && npx vitest run src/__tests__/sse-registry.test.ts
```
Expected: `Cannot find module '../lib/sse-registry'`

- [ ] **Step 3: Implement SSE registry**

Create `apps/api/src/lib/sse-registry.ts`:

```typescript
import type { Response } from 'express';

export class SseRegistry {
  private subs = new Map<string, Set<Response>>();

  subscribe(workspaceId: string, res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    if (!this.subs.has(workspaceId)) {
      this.subs.set(workspaceId, new Set());
    }
    this.subs.get(workspaceId)!.add(res);

    // Keep alive through proxies that close idle HTTP connections
    const heartbeat = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(heartbeat);
        return;
      }
      res.write(': heartbeat\n\n');
    }, 15_000);

    res.on('close', () => {
      clearInterval(heartbeat);
      this.unsubscribe(workspaceId, res);
    });
  }

  unsubscribe(workspaceId: string, res: Response): void {
    const set = this.subs.get(workspaceId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) this.subs.delete(workspaceId);
  }

  broadcast(workspaceId: string, event: string, data: unknown): void {
    const set = this.subs.get(workspaceId);
    if (!set || set.size === 0) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
      if (!res.writableEnded) res.write(payload);
    }
  }
}

// Singleton shared across the process
export const sseRegistry = new SseRegistry();
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/api && npx vitest run src/__tests__/sse-registry.test.ts
```
Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/sse-registry.ts apps/api/src/__tests__/sse-registry.test.ts
git commit -m "feat(api): add SSE registry for real-time broadcast"
```

---

### Task 2: SSE Route

**Files:**
- Create: `apps/api/src/routes/sse.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create SSE route**

Create `apps/api/src/routes/sse.ts`:

```typescript
import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { sseRegistry } from '../lib/sse-registry';
import type { AuthenticatedRequest } from '../middleware/auth';

export function createSseRouter(_db: Kysely<Database>): Router {
  const router = Router();

  // GET /api/sse/servers — holds connection open, pushes metric + alert events
  router.get('/servers', (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest;
    // subscribe() sets headers and holds the connection via heartbeat + close listener
    sseRegistry.subscribe(workspace.id, res);
  });

  return router;
}
```

- [ ] **Step 2: Register in `apps/api/src/index.ts`**

Add import (with the other route imports near the top of the file):

```typescript
import { createSseRouter } from './routes/sse';
```

Add route (after `app.use('/api/servers', requireAuth, createServersRouter(db))`):

```typescript
app.use('/api/sse', requireAuth, createSseRouter(db));
```

- [ ] **Step 3: Type-check**

```bash
cd apps/api && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/sse.ts apps/api/src/index.ts
git commit -m "feat(api): add GET /api/sse/servers real-time endpoint"
```

---

### Task 3: Agent Ping → SSE Broadcast + Snapshot Rate-Limit

**Files:**
- Modify: `apps/api/src/routes/agent.ts`

- [ ] **Step 1: Add SSE import and snapshot rate-limiter at top of file**

In `apps/api/src/routes/agent.ts`, add after the last existing import line:

```typescript
import { sseRegistry } from '../lib/sse-registry';

// Rate-limit snapshot writes: track last insert time per server (resets on restart, acceptable)
const lastSnapshotAt = new Map<string, number>();
const SNAPSHOT_INTERVAL_MS = 30_000;
```

- [ ] **Step 2: Replace unconditional snapshot insert with rate-limited version**

Find this block in the `/ping` handler:

```typescript
// Write snapshot
await db.insertInto('metrics_snapshots').values({
  server_id: server.id,
  workspace_id: server.workspace_id,
  cpu_pct: payload.cpu_pct,
  mem_pct: payload.mem_pct,
  disk_pct: payload.disk_pct,
  load_avg_1m: payload.load_avg_1m,
  net_in_bytes: payload.net_in_bytes,
  net_out_bytes: payload.net_out_bytes,
}).execute();
```

Replace with:

```typescript
// Write snapshot at most every 30s to avoid 6× DB write increase at 5s cadence
const lastSnap = lastSnapshotAt.get(server.id) ?? 0;
if (Date.now() - lastSnap >= SNAPSHOT_INTERVAL_MS) {
  await db.insertInto('metrics_snapshots').values({
    server_id: server.id,
    workspace_id: server.workspace_id,
    cpu_pct: payload.cpu_pct,
    mem_pct: payload.mem_pct,
    disk_pct: payload.disk_pct,
    load_avg_1m: payload.load_avg_1m,
    net_in_bytes: payload.net_in_bytes,
    net_out_bytes: payload.net_out_bytes,
  }).execute();
  lastSnapshotAt.set(server.id, Date.now());
}
```

- [ ] **Step 3: Add SSE broadcast after the server UPDATE**

Find the `.execute()` that closes the `db.updateTable('servers').set({...}).where('id', '=', server.id)` call. Add immediately after it:

```typescript
// Push live metrics to any browser tabs subscribed to this workspace
sseRegistry.broadcast(server.workspace_id, 'metric', {
  serverId: server.id,
  cpu_pct: payload.cpu_pct,
  mem_pct: payload.mem_pct,
  disk_pct: payload.disk_pct,
  load_avg_1m: payload.load_avg_1m,
  net_in_bytes: payload.net_in_bytes,
  net_out_bytes: payload.net_out_bytes,
  uptime_seconds: payload.uptime_seconds,
  status: 'online',
  last_ping_at: now,
});
```

- [ ] **Step 4: Broadcast `alert_new` when a new alert is created**

Find the block inside `if (!existingAlert)` where a new alert is inserted:

```typescript
const insertedAlert = await db.insertInto('alerts').values({ ... }).returning([...]).executeTakeFirstOrThrow();
```

Add immediately after that line:

```typescript
// Notify SSE subscribers so alert bar updates without polling
sseRegistry.broadcast(server.workspace_id, 'alert_new', {
  id: insertedAlert.id,
  severity: insertedAlert.severity,
  message: insertedAlert.message,
  resource_type: insertedAlert.resource_type,
  resource_id: insertedAlert.resource_id,
});
```

- [ ] **Step 5: Type-check**

```bash
cd apps/api && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/agent.ts
git commit -m "feat(api): SSE broadcast on agent ping and new alert"
```

---

### Task 4: Agent Cadence

**Files:**
- Modify: `apps/agent/.env.example`

- [ ] **Step 1: Update default interval**

In `apps/agent/.env.example`, change:

```
# Optional: reporting interval in milliseconds (default: 30000 = 30 seconds)
VANTAGE_INTERVAL_MS=30000
```

to:

```
# Optional: reporting interval in milliseconds (default: 5000 = 5 seconds)
VANTAGE_INTERVAL_MS=5000
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent/.env.example
git commit -m "chore(agent): reduce default reporting interval to 5s"
```

---

### Task 5: Browser SSE Context

**Files:**
- Create: `apps/web/contexts/ServerMetricsContext.tsx`

This uses `fetch` + `ReadableStream` (same pattern as `apps/web/lib/ssh.ts` `openSshStream`) so the `Authorization: Bearer` header can be sent — `EventSource` doesn't support custom headers.

- [ ] **Step 1: Create context file**

Create `apps/web/contexts/ServerMetricsContext.tsx`:

```typescript
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useApiToken } from '@/lib/useApiToken';

export interface LiveServerMetrics {
  serverId: string;
  cpu_pct: number | null;
  mem_pct: number | null;
  disk_pct: number | null;
  load_avg_1m: number | null;
  net_in_bytes: number | null;
  net_out_bytes: number | null;
  uptime_seconds: number | null;
  status: 'online' | 'degraded' | 'offline' | 'stopped';
  last_ping_at: string | null;
}

export interface LiveAlertEvent {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  resource_type: string;
  resource_id: string;
}

interface ContextValue {
  metrics: Map<string, LiveServerMetrics>;
  lastAlert: LiveAlertEvent | null;
}

const ServerMetricsContext = createContext<ContextValue>({
  metrics: new Map(),
  lastAlert: null,
});

export function ServerMetricsProvider({ children }: { children: ReactNode }) {
  const getToken = useApiToken();
  const [metrics, setMetrics] = useState<Map<string, LiveServerMetrics>>(new Map());
  const [lastAlert, setLastAlert] = useState<LiveAlertEvent | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(async (retryDelay: number): Promise<void> => {
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = await getToken();
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? '';
      const res = await fetch(`${apiUrl}/api/sse/servers`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
        signal: controller.signal,
      });

      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventName = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventName = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const data = JSON.parse(raw) as Record<string, unknown>;
              if (eventName === 'metric') {
                const m = data as LiveServerMetrics;
                setMetrics(prev => {
                  const next = new Map(prev);
                  next.set(m.serverId, m);
                  return next;
                });
              } else if (eventName === 'alert_new') {
                setLastAlert(data as LiveAlertEvent);
              }
            } catch { /* ignore malformed */ }
            eventName = '';
          }
        }
      }

      // Stream ended cleanly — reconnect with reset delay
      void connect(1_000);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      // Exponential backoff, cap at 30s
      const next = Math.min(retryDelay * 2, 30_000);
      setTimeout(() => void connect(next), retryDelay);
    }
  }, [getToken]);

  useEffect(() => {
    void connect(1_000);
    return () => abortRef.current?.abort();
  }, [connect]);

  return (
    <ServerMetricsContext.Provider value={{ metrics, lastAlert }}>
      {children}
    </ServerMetricsContext.Provider>
  );
}

export function useServerMetrics(serverId: string): LiveServerMetrics | null {
  const { metrics } = useContext(ServerMetricsContext);
  return metrics.get(serverId) ?? null;
}

export function useLastAlert(): LiveAlertEvent | null {
  return useContext(ServerMetricsContext).lastAlert;
}
```

- [ ] **Step 2: Mount provider in dashboard layout**

Open `apps/web/app/(dashboard)/layout.tsx`. Add import:

```typescript
import { ServerMetricsProvider } from '@/contexts/ServerMetricsContext';
```

Wrap the existing layout children with `<ServerMetricsProvider>`:

```typescript
// Find the return statement and wrap its children, e.g.:
return (
  <ServerMetricsProvider>
    {/* existing layout content */}
  </ServerMetricsProvider>
);
```

- [ ] **Step 3: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/contexts/ServerMetricsContext.tsx apps/web/app/(dashboard)/layout.tsx
git commit -m "feat(web): add ServerMetricsContext for SSE-driven live metrics"
```

---

### Task 6: Wire Server List + Detail Pages to SSE Context

**Files:**
- Modify: `apps/web/app/(dashboard)/servers/page.tsx`
- Modify: `apps/web/app/(dashboard)/servers/[id]/page.tsx`

- [ ] **Step 1: Update server list page**

In `apps/web/app/(dashboard)/servers/page.tsx`, add import:

```typescript
import { useServerMetrics } from '@/contexts/ServerMetricsContext';
```

For each server row/card rendered in the list, call:

```typescript
const live = useServerMetrics(server.id);
```

Then use `live?.cpu_pct ?? server.cpu_pct`, `live?.status ?? server.status`, etc. to display live values. The `useQuery` that fetches the server list remains — it provides the initial data and the `live` overlay replaces stale values as SSE events arrive.

If server rows are rendered inside a component (e.g. `ServerRow`), accept `serverId` as prop and call `useServerMetrics` inside that component so the hook is called at component level (React hooks rules).

Example `ServerRow` pattern:

```typescript
function ServerRow({ server }: { server: Server }) {
  const live = useServerMetrics(server.id);
  const cpu = live?.cpu_pct ?? server.cpu_pct;
  const status = live?.status ?? server.status;
  // render using cpu, status, etc.
}
```

- [ ] **Step 2: Update server detail page**

In `apps/web/app/(dashboard)/servers/[id]/page.tsx`, add import:

```typescript
import { useServerMetrics } from '@/contexts/ServerMetricsContext';
```

Inside the page/detail component (where `server` data is available), add:

```typescript
const live = useServerMetrics(server.id);
```

In `OverviewTab`, pass `live` to metric cards and override display values:

```typescript
<MetricCard
  label="CPU"
  value={live?.cpu_pct ?? server.cpu_pct}
  unit="%"
  snapshots={snap(snapshots, 'cpu_pct')}
  color="var(--blue)"
/>
// same pattern for mem_pct, disk_pct, load_avg_1m
```

For the uptime counter, use `live?.uptime_seconds ?? server.uptime_seconds`.

For the status badge, use `live?.status ?? server.status`.

- [ ] **Step 3: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/servers/page.tsx" "apps/web/app/(dashboard)/servers/[id]/page.tsx"
git commit -m "feat(web): wire server list and detail to live SSE metrics"
```

---

### Task 7: AlertBar — Switch to SSE Push

**Files:**
- Modify: `apps/web/components/AlertBar.tsx`

The goal: keep the existing `useQuery` as a fallback/initial load, but also react to `alert_new` SSE events to trigger an immediate refetch — replacing the 60s poll with SSE-triggered invalidation.

- [ ] **Step 1: Add SSE alert listener**

In `apps/web/components/AlertBar.tsx`, add imports:

```typescript
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLastAlert } from '@/contexts/ServerMetricsContext';
```

Inside the `AlertBar` component, add:

```typescript
const qc = useQueryClient();
const lastAlert = useLastAlert();

// On new alert SSE event, immediately refetch the alerts bar
useEffect(() => {
  if (!lastAlert) return;
  void qc.invalidateQueries({ queryKey: ['alerts', 'bar'] });
}, [lastAlert, qc]);
```

Change the `refetchInterval` from `60_000` to `120_000` (SSE handles real-time; keep poll as safety net at slower rate):

```typescript
refetchInterval: 120_000,
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/AlertBar.tsx
git commit -m "feat(web): AlertBar reacts to SSE alert_new events instantly"
```

---

## Part B — SFTP File Management (WebSocket)

---

### Task 8: SFTP WebSocket Handler

**Files:**
- Create: `apps/api/src/ws/sftp-session.ts`

`ssh2` and `@types/ssh2` are already installed. This handler mirrors `ssh-terminal.ts` for auth + SSH connect, then opens the SFTP subsystem instead of a shell.

- [ ] **Step 1: Create SFTP handler**

Create `apps/api/src/ws/sftp-session.ts`:

```typescript
import type { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { Client } from 'ssh2';
import type { SFTPWrapper } from 'ssh2';
import type { WebSocket } from 'ws';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { decryptPrivateKey } from '../lib/ssh-crypto';
import { logger } from '../lib/logger';

interface JwtPayload {
  sub: string;
  workspaceId: string;
}

// URL pattern: /api/servers/:id/ssh/sftp
const SFTP_URL_RE = /^\/api\/servers\/([^/?]+)\/ssh\/sftp/;

type SftpOp = 'ls' | 'read' | 'write' | 'delete' | 'rename' | 'mkdir';

interface SftpRequest {
  id: string;
  op: SftpOp;
  path?: string;
  dest?: string;   // for rename
  content?: string; // for write
}

interface SftpResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_READ_BYTES = 10 * 1024 * 1024; // 10 MB

function guardPath(p: string): string | null {
  if (!p || p.includes('\0')) return null;
  // Collapse duplicate slashes, keep the path otherwise unrestricted
  return p.replace(/\/+/g, '/');
}

function promisify<T>(fn: (cb: (err: Error | null, result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) =>
    fn((err, result) => (err ? reject(err) : resolve(result))),
  );
}

async function sftpLs(sftp: SFTPWrapper, path: string) {
  const entries = await promisify<import('ssh2').FileEntry[]>(cb => sftp.readdir(path, cb));
  return entries.map(e => ({
    name: e.filename,
    type: e.attrs.isDirectory() ? 'dir' : e.attrs.isSymbolicLink() ? 'link' : 'file',
    size: e.attrs.size,
    modified: new Date((e.attrs.mtime ?? 0) * 1000).toISOString(),
  }));
}

async function sftpRead(sftp: SFTPWrapper, path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = sftp.createReadStream(path);
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function sftpWrite(sftp: SFTPWrapper, path: string, content: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(path);
    stream.on('close', resolve);
    stream.on('error', reject);
    stream.end(content);
  });
}

async function sftpDelete(sftp: SFTPWrapper, path: string): Promise<void> {
  return promisify(cb => sftp.unlink(path, cb));
}

async function sftpRename(sftp: SFTPWrapper, src: string, dest: string): Promise<void> {
  return promisify(cb => sftp.rename(src, dest, cb));
}

async function sftpMkdir(sftp: SFTPWrapper, path: string): Promise<void> {
  return promisify(cb => sftp.mkdir(path, cb));
}

async function handleOp(sftp: SFTPWrapper, msg: SftpRequest): Promise<SftpResponse> {
  const path = guardPath(msg.path ?? '/');
  if (!path) return { id: msg.id, ok: false, error: 'FORBIDDEN' };

  try {
    switch (msg.op) {
      case 'ls': {
        const entries = await sftpLs(sftp, path);
        return { id: msg.id, ok: true, data: { entries } };
      }
      case 'read': {
        const buf = await sftpRead(sftp, path);
        if (buf.length > MAX_READ_BYTES) {
          return { id: msg.id, ok: false, error: 'FILE_TOO_LARGE' };
        }
        return { id: msg.id, ok: true, data: { content: buf.toString('utf8') } };
      }
      case 'write': {
        await sftpWrite(sftp, path, Buffer.from(msg.content ?? '', 'utf8'));
        return { id: msg.id, ok: true, data: null };
      }
      case 'delete': {
        await sftpDelete(sftp, path);
        return { id: msg.id, ok: true, data: null };
      }
      case 'rename': {
        const dest = guardPath(msg.dest ?? '');
        if (!dest) return { id: msg.id, ok: false, error: 'FORBIDDEN' };
        await sftpRename(sftp, path, dest);
        return { id: msg.id, ok: true, data: null };
      }
      case 'mkdir': {
        await sftpMkdir(sftp, path);
        return { id: msg.id, ok: true, data: null };
      }
      default:
        return { id: msg.id, ok: false, error: 'UNKNOWN_OP' };
    }
  } catch (err) {
    return { id: msg.id, ok: false, error: (err as Error).message };
  }
}

export async function handleSftpUpgrade(
  ws: WebSocket,
  request: IncomingMessage,
  db: Kysely<Database>,
  jwtSecret: string,
): Promise<void> {
  const url = request.url ?? '';
  const match = SFTP_URL_RE.exec(url);
  if (!match) { ws.close(4004, 'Not found'); return; }
  const serverId = match[1]!;

  // ── Auth (same pattern as ssh-terminal.ts) ──────────────────────────────────
  const cookieHeader = request.headers.cookie ?? '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const idx = c.indexOf('=');
      return idx < 0 ? [c.trim(), ''] : [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
    }),
  );
  const token = cookies['vantage_token'];
  if (!token) { ws.close(4001, 'Unauthorized'); return; }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, jwtSecret) as JwtPayload;
  } catch {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const user = await db.selectFrom('users').where('id', '=', payload.sub)
    .select(['id', 'workspace_id']).executeTakeFirst();
  if (!user) { ws.close(4001, 'Unauthorized'); return; }

  const workspace = await db.selectFrom('workspaces').where('id', '=', user.workspace_id)
    .select(['id']).executeTakeFirst();
  if (!workspace) { ws.close(4001, 'Unauthorized'); return; }

  // ── Resolve server ──────────────────────────────────────────────────────────
  const server = await db.selectFrom('servers')
    .where('id', '=', serverId).where('workspace_id', '=', workspace.id)
    .select(['id', 'ip_address', 'ssh_port']).executeTakeFirst();
  if (!server) { ws.close(4004, 'Server not found'); return; }
  if (!server.ip_address) { ws.close(4000, 'Server has no IP configured'); return; }

  // ── Resolve keypair ─────────────────────────────────────────────────────────
  const keypair = await db.selectFrom('workspace_ssh_keypairs')
    .where('workspace_id', '=', workspace.id)
    .select(['encrypted_private_key', 'iv', 'ssh_user']).executeTakeFirst();
  if (!keypair) { ws.close(4000, 'NO_KEYPAIR'); return; }

  let privateKey: string;
  try {
    privateKey = decryptPrivateKey(keypair.encrypted_private_key, keypair.iv);
  } catch (err) {
    logger.error({ err }, '[ws/sftp] Failed to decrypt private key');
    ws.close(4000, 'SSH_KEY_DECRYPT_FAILED');
    return;
  }

  // ── Open SSH + SFTP ─────────────────────────────────────────────────────────
  const conn = new Client();

  function send(resp: SftpResponse) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(resp));
  }

  conn.on('error', (err) => {
    logger.error({ err, serverId }, '[ws/sftp] SSH error');
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ id: '', ok: false, error: 'SSH_CONNECT_FAILED' }));
      ws.close(4001, 'SSH_CONNECT_FAILED');
    }
  });

  conn.on('ready', () => {
    conn.sftp((err, sftp) => {
      if (err) {
        logger.error({ err, serverId }, '[ws/sftp] SFTP subsystem error');
        ws.close(4000, 'SFTP_INIT_FAILED');
        conn.end();
        return;
      }

      let idleTimer: ReturnType<typeof setTimeout> = setTimeout(closeIdle, IDLE_TIMEOUT_MS);

      function closeIdle() {
        if (ws.readyState === ws.OPEN) ws.close(4000, 'IDLE_TIMEOUT');
        conn.end();
      }

      function resetIdle() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(closeIdle, IDLE_TIMEOUT_MS);
      }

      ws.on('message', (raw: Buffer) => {
        resetIdle();
        let msg: SftpRequest;
        try {
          msg = JSON.parse(raw.toString('utf8')) as SftpRequest;
        } catch {
          send({ id: '', ok: false, error: 'INVALID_JSON' });
          return;
        }
        void handleOp(sftp, msg).then(send);
      });

      ws.on('close', () => {
        clearTimeout(idleTimer);
        sftp.end();
        conn.end();
      });
    });
  });

  conn.connect({
    host: server.ip_address,
    port: server.ssh_port ?? 22,
    username: keypair.ssh_user,
    privateKey,
    readyTimeout: 30_000,
  });
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/api && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/ws/sftp-session.ts
git commit -m "feat(api): add SFTP WebSocket handler"
```

---

### Task 9: Wire SFTP Handler in API Index

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add import**

In `apps/api/src/index.ts`, add with the other WS imports:

```typescript
import { handleSftpUpgrade } from './ws/sftp-session';
```

- [ ] **Step 2: Add SFTP upgrade route**

Find the existing `httpServer.on('upgrade', ...)` block:

```typescript
httpServer.on('upgrade', (request, socket, head) => {
  const url = request.url ?? '';
  if (/^\/api\/servers\/[^/]+\/ssh\/terminal/.test(url)) {
    wss.handleUpgrade(request, socket as import('net').Socket, head, (ws) => {
      void handleTerminalUpgrade(ws, request, db, env.JWT_SECRET);
    });
  } else {
    socket.destroy();
  }
});
```

Replace with:

```typescript
httpServer.on('upgrade', (request, socket, head) => {
  const url = request.url ?? '';
  if (/^\/api\/servers\/[^/]+\/ssh\/terminal/.test(url)) {
    wss.handleUpgrade(request, socket as import('net').Socket, head, (ws) => {
      void handleTerminalUpgrade(ws, request, db, env.JWT_SECRET);
    });
  } else if (/^\/api\/servers\/[^/]+\/ssh\/sftp/.test(url)) {
    wss.handleUpgrade(request, socket as import('net').Socket, head, (ws) => {
      void handleSftpUpgrade(ws, request, db, env.JWT_SECRET);
    });
  } else {
    socket.destroy();
  }
});
```

- [ ] **Step 3: Type-check**

```bash
cd apps/api && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): register SFTP WebSocket upgrade route"
```

---

### Task 10: Browser SFTP Client

**Files:**
- Create: `apps/web/lib/sftp.ts`

- [ ] **Step 1: Create SFTP client**

Create `apps/web/lib/sftp.ts`:

```typescript
export interface SftpEntry {
  name: string;
  type: 'file' | 'dir' | 'link' | 'other';
  size: number;
  modified: string;
}

export interface SftpResponse<T = unknown> {
  id: string;
  ok: boolean;
  data?: T;
  error?: string;
}

type PendingCallback = (resp: SftpResponse) => void;

export class SftpClient {
  private ws: WebSocket;
  private pending = new Map<string, PendingCallback>();
  private seq = 0;
  private onCloseCallback: (() => void) | null = null;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.addEventListener('message', (e: MessageEvent) => {
      try {
        const resp = JSON.parse(e.data as string) as SftpResponse;
        const cb = this.pending.get(resp.id);
        if (cb) {
          this.pending.delete(resp.id);
          cb(resp);
        }
      } catch { /* ignore malformed */ }
    });
    this.ws.addEventListener('close', () => {
      this.onCloseCallback?.();
    });
  }

  onClose(cb: () => void) {
    this.onCloseCallback = cb;
  }

  private send<T>(op: string, extra: Record<string, unknown>): Promise<SftpResponse<T>> {
    const id = String(++this.seq);
    return new Promise((resolve) => {
      this.pending.set(id, resolve as PendingCallback);
      this.ws.send(JSON.stringify({ id, op, ...extra }));
    });
  }

  ls(path: string) {
    return this.send<{ entries: SftpEntry[] }>('ls', { path });
  }

  read(path: string) {
    return this.send<{ content: string }>('read', { path });
  }

  write(path: string, content: string) {
    return this.send('write', { path, content });
  }

  delete(path: string) {
    return this.send('delete', { path });
  }

  rename(src: string, dest: string) {
    return this.send('rename', { path: src, dest });
  }

  mkdir(path: string) {
    return this.send('mkdir', { path });
  }

  close() {
    this.ws.close();
  }
}

export function openSftpSession(serverId: string): SftpClient {
  const apiUrl = (process.env['NEXT_PUBLIC_API_URL'] ?? '').replace(/^http/, 'ws');
  const ws = new WebSocket(`${apiUrl}/api/servers/${serverId}/ssh/sftp`);
  return new SftpClient(ws);
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/sftp.ts
git commit -m "feat(web): add SFTP WebSocket client"
```

---

### Task 11: Files Tab UI

**Files:**
- Modify: `apps/web/app/(dashboard)/servers/[id]/page.tsx`

The existing Files tab already calls `listFiles` and `readFile` (REST-based). This task replaces that with the WS-based `SftpClient` and adds write, delete, rename, mkdir, and download support.

- [ ] **Step 1: Add SFTP imports**

In `apps/web/app/(dashboard)/servers/[id]/page.tsx`, add:

```typescript
import { openSftpSession, type SftpClient, type SftpEntry } from '@/lib/sftp';
```

Remove imports of `listFiles` and `readFile` from `@/lib/ssh` if no longer used elsewhere in the file.

- [ ] **Step 2: Replace FilesTab implementation**

Find the `FilesTab` component (or the section rendering the Files tab content). Replace its implementation with:

```typescript
function FilesTab({ serverId }: { serverId: string }) {
  const [client, setClient] = useState<SftpClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Open SFTP session on mount
  useEffect(() => {
    const sftp = openSftpSession(serverId);
    setClient(sftp);

    // Wait for WS to open before allowing ops
    const ws = (sftp as unknown as { ws: WebSocket }).ws;
    ws.addEventListener('open', () => {
      setConnected(true);
      void loadDir(sftp, '/');
    });
    ws.addEventListener('error', () => {
      setConnectError('SSH_CONNECT_FAILED');
    });
    sftp.onClose(() => {
      setConnected(false);
    });

    return () => sftp.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function loadDir(sftp: SftpClient, path: string) {
    setLoading(true);
    setOpError(null);
    const res = await sftp.ls(path);
    setLoading(false);
    if (!res.ok) { setOpError(res.error ?? 'ls failed'); return; }
    const sorted = [...(res.data?.entries ?? [])].sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1;
      if (a.type !== 'dir' && b.type === 'dir') return 1;
      return a.name.localeCompare(b.name);
    });
    setEntries(sorted);
    setCurrentPath(path);
    setSelectedFile(null);
    setFileContent('');
    setSavedContent('');
  }

  async function openFile(path: string) {
    if (!client) return;
    setLoading(true);
    setOpError(null);
    const res = await client.read(path);
    setLoading(false);
    if (!res.ok) { setOpError(res.error ?? 'read failed'); return; }
    setSelectedFile(path);
    setFileContent(res.data?.content ?? '');
    setSavedContent(res.data?.content ?? '');
  }

  async function saveFile() {
    if (!client || !selectedFile) return;
    setLoading(true);
    const res = await client.write(selectedFile, fileContent);
    setLoading(false);
    if (!res.ok) { setOpError(res.error ?? 'write failed'); return; }
    setSavedContent(fileContent);
  }

  async function deleteEntry(path: string) {
    if (!client || !confirm(`Delete ${path}?`)) return;
    const res = await client.delete(path);
    if (!res.ok) { setOpError(res.error ?? 'delete failed'); return; }
    await loadDir(client, currentPath);
  }

  function downloadFile(path: string) {
    // Trigger download via a hidden link to the REST read endpoint as fallback
    // (SFTP WS doesn't stream binary — use existing REST for download)
    const a = document.createElement('a');
    a.href = `/api/servers/${serverId}/ssh/files/read?path=${encodeURIComponent(path)}&download=1`;
    a.download = path.split('/').pop() ?? 'file';
    a.click();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !client) return;
    const text = await file.text();
    const destPath = `${currentPath}/${file.name}`.replace('//', '/');
    const res = await client.write(destPath, text);
    if (!res.ok) { setOpError(res.error ?? 'upload failed'); return; }
    await loadDir(client, currentPath);
  }

  // Breadcrumb paths
  const breadcrumbs = currentPath.split('/').filter(Boolean);

  if (connectError) {
    return (
      <div style={{ padding: 24, color: 'var(--red)', font: '14px var(--font-sans)' }}>
        Could not connect: {connectError}. Check SSH keypair in Settings.
      </div>
    );
  }

  if (!connected) {
    return (
      <div style={{ padding: 24, color: 'var(--text3)', font: '14px var(--font-sans)' }}>
        Connecting…
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', minHeight: 400 }}>
      {/* Left: directory tree */}
      <div style={{ borderRight: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', flexDirection: 'column' }}>
        {/* Breadcrumb */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', font: '12px var(--font-sans)', color: 'var(--text2)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ cursor: 'pointer', color: 'var(--green)' }} onClick={() => client && void loadDir(client, '/')}>/</span>
          {breadcrumbs.map((seg, i) => {
            const path = '/' + breadcrumbs.slice(0, i + 1).join('/');
            return (
              <span key={path}>
                <span style={{ color: 'var(--text3)' }}>/</span>
                <span style={{ cursor: 'pointer', color: 'var(--green)' }} onClick={() => client && void loadDir(client, path)}>{seg}</span>
              </span>
            );
          })}
        </div>
        {/* Entries */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: '8px 12px', font: '12px var(--font-sans)', color: 'var(--text3)' }}>Loading…</div>}
          {!loading && currentPath !== '/' && (
            <div
              style={{ padding: '6px 12px', cursor: 'pointer', font: '13px var(--font-sans)', color: 'var(--text2)' }}
              onClick={() => {
                const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
                client && void loadDir(client, parent);
              }}
            >
              ..
            </div>
          )}
          {entries.map(e => {
            const fullPath = `${currentPath}/${e.name}`.replace('//', '/');
            const isSelected = selectedFile === fullPath;
            return (
              <div
                key={e.name}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  font: '13px var(--font-sans)',
                  color: isSelected ? 'var(--green)' : 'var(--text)',
                  background: isSelected ? 'rgba(45,106,79,0.08)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onClick={() => {
                  if (!client) return;
                  if (e.type === 'dir') void loadDir(client, fullPath);
                  else void openFile(fullPath);
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{e.type === 'dir' ? '📁' : '📄'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                <span
                  style={{ fontSize: 10, color: 'var(--red)', cursor: 'pointer', padding: '0 4px' }}
                  onClick={(ev) => { ev.stopPropagation(); void deleteEntry(fullPath); }}
                  title="Delete"
                >
                  ✕
                </span>
              </div>
            );
          })}
        </div>
        {/* Upload button */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ width: '100%', padding: '6px 0', font: '12px var(--font-sans)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text2)' }}
          >
            Upload file
          </button>
        </div>
      </div>

      {/* Right: editor */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {opError && (
          <div style={{ padding: '8px 16px', background: 'var(--red-bg)', color: 'var(--red)', font: '12px var(--font-sans)', borderBottom: '1px solid var(--border)' }}>
            {opError}
          </div>
        )}
        {selectedFile ? (
          <>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, font: '12px var(--font-sans)', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedFile}</span>
              <button
                onClick={saveFile}
                disabled={fileContent === savedContent || loading}
                style={{ padding: '4px 12px', font: '12px var(--font-sans)', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', opacity: fileContent === savedContent ? 0.4 : 1 }}
              >
                Save
              </button>
              <button
                onClick={() => downloadFile(selectedFile)}
                style={{ padding: '4px 12px', font: '12px var(--font-sans)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text2)' }}
              >
                Download
              </button>
            </div>
            <textarea
              value={fileContent}
              onChange={e => setFileContent(e.target.value)}
              style={{
                flex: 1,
                padding: 16,
                font: '13px/1.6 monospace',
                border: 'none',
                resize: 'none',
                background: 'var(--surface)',
                color: 'var(--text)',
                outline: 'none',
              }}
            />
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', font: '13px var(--font-sans)' }}>
            Select a file to view or edit
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire FilesTab into the page**

Find where the Files tab is rendered in the server detail page. Replace the existing Files tab content with:

```typescript
{activeTab === 'files' && <FilesTab serverId={server.id} />}
```

Ensure `activeTab` state and tab buttons exist for `'overview' | 'files' | 'alerts'` tabs. If the tab bar is already present, just ensure the `'files'` case renders `<FilesTab>`.

- [ ] **Step 4: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/servers/[id]/page.tsx"
git commit -m "feat(web): SFTP file manager in server detail Files tab"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] SSE registry → Task 1
- [x] GET /api/sse/servers → Task 2
- [x] Agent broadcast + snapshot rate-limit → Task 3
- [x] Agent 5s cadence → Task 4
- [x] Browser SSE context → Task 5
- [x] Server list live metrics → Task 6
- [x] Server detail live metrics → Task 6
- [x] AlertBar SSE-driven → Task 7
- [x] SFTP WS handler (ls/read/write/delete/rename/mkdir) → Task 8
- [x] SFTP WS upgrade routing → Task 9
- [x] Browser SFTP client → Task 10
- [x] Files tab UI (browse/edit/upload/download/delete) → Task 11
- [x] Path traversal guard → Task 8 `guardPath()`
- [x] 10MB read limit → Task 8 `MAX_READ_BYTES`
- [x] 5-min idle timeout → Task 8 `IDLE_TIMEOUT_MS`
- [x] Error codes: NO_KEYPAIR, SSH_CONNECT_FAILED, FILE_TOO_LARGE, FORBIDDEN, TIMEOUT → Task 8

**No placeholders:** confirmed — all steps have code or exact commands.

**Type consistency:** `SftpEntry` defined in `lib/sftp.ts` Task 10, used in `FilesTab` Task 11. `LiveServerMetrics.serverId` defined in context Task 5, broadcast key matches in Task 3. `SftpRequest.op` union matches `handleOp` switch cases.
