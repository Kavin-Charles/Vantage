# Server Monitoring & File Management — Design Spec

**Date:** 2026-05-23  
**Status:** Approved  
**Scope:** Real-time server metrics (5s freshness) + SSH/SFTP-based server file management

---

## Problem

1. Server metrics refresh every 30s — too stale for operational monitoring.
2. No in-app file management for servers — users must SSH in separately.

---

## Architecture Overview

Two independent systems sharing existing SSH keypair infrastructure.

```
REAL-TIME METRICS
─────────────────
Agent ──5s HTTP ping──► API /agent/ping
                            │
                            ├─► UPDATE servers (current metrics)
                            ├─► INSERT metrics_snapshots (rate-limited, every 30s)
                            ├─► evaluate alert thresholds
                            └─► SSE broadcast ──► Browser EventSource

FILE MANAGEMENT
───────────────
Browser ──WebSocket──► API /ws/sftp/:serverId
                           │
                           ├─► load workspace_ssh_keypairs (decrypt private key)
                           ├─► ssh2 SFTP session to server.ip_address:server.ssh_port
                           └─► JSON command/response framing over WS
```

---

## Section 1: Real-Time Metrics

### Agent

- Change `VANTAGE_INTERVAL_MS` default: `30000` → `5000` in `.env.example`
- No code changes to agent — interval is already configurable

### API — `/agent/ping` changes

- After updating `servers` record, call `sseRegistry.broadcast(workspaceId, serverId, metrics)`
- Rate-limit `metrics_snapshots` inserts: in-memory `Map<serverId, lastSnapshotAt>`, insert only if >30s elapsed since last snapshot
- Alert evaluation runs every ping (O(1) threshold math, safe at 5s cadence)
- Alert bar events: when a new alert is inserted, broadcast `alert:new` SSE event to workspace subscribers

### SSE Registry

New singleton: `apps/api/src/lib/sse-registry.ts`

```ts
// Internal structure
Map<workspaceId, Set<Response>>

// API
subscribe(workspaceId: string, res: Response): void
unsubscribe(workspaceId: string, res: Response): void
broadcast(workspaceId: string, event: string, data: unknown): void
```

- `subscribe`: set SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`), send 15s heartbeat comments to keep alive through proxies
- `unsubscribe`: called on `res.on('close')`
- `broadcast`: write `event: <name>\ndata: <json>\n\n` to all subscribers in workspace

### New API Route

`GET /api/sse/servers`
- Auth: existing `requireWorkspace` middleware
- Registers response in SSE registry, holds connection open
- No timeout (SSE connections are long-lived)
- On `res.on('close')`: unsubscribe

### SSE Event Schema

```ts
// Emitted on every agent ping
event: `server:${serverId}`
data: {
  id: string
  cpu_pct: number
  mem_pct: number
  disk_pct: number
  load_avg_1m: number
  net_in_bytes: number
  net_out_bytes: number
  uptime_seconds: number
  status: 'online' | 'degraded' | 'offline'
  last_ping_at: string
}

// Emitted when a new alert is created
event: 'alert:new'
data: {
  id: string
  resource_type: string
  resource_id: string
  severity: 'critical' | 'warning' | 'info'
  message: string
}
```

### Browser

- `EventSource('/api/sse/servers')` in a shared React context (`ServerMetricsContext`)
- On `server:<id>` event: update that server's metrics in context state
- On `alert:new` event: trigger alert bar refresh
- On disconnect: `EventSource` auto-reconnects (native browser behaviour)
- Components subscribe to context — no per-component polling

---

## Section 2: File Management

### WebSocket Endpoint

`GET /ws/sftp/:serverId`

- Auth: Clerk session cookie (same pattern as `apps/api/src/ws/ssh-terminal.ts`)
- Load server record, verify `workspace_id` matches authenticated user's workspace
- Load `workspace_ssh_keypairs`, decrypt private key
- Open `ssh2` SFTP session to `server.ip_address:server.ssh_port`
- All file operations flow as JSON frames over the WebSocket

### Message Protocol

```ts
// Client → Server (requests)
{ id: string, op: 'ls',       path: string }
{ id: string, op: 'read',     path: string }
{ id: string, op: 'write',    path: string, content: string }
{ id: string, op: 'delete',   path: string }
{ id: string, op: 'rename',   src: string, dest: string }
{ id: string, op: 'mkdir',    path: string }
{ id: string, op: 'download', path: string }
{ id: string, op: 'upload',   path: string, size: number }  // binary frames follow

// Server → Client (responses)
{ id: string, ok: true,  data: unknown }
{ id: string, ok: false, error: string }

// ls data shape
{ entries: Array<{ name: string, type: 'file' | 'dir', size: number, modified: string }> }
```

### Connection Lifecycle

- WS open → SFTP connect (one SSH handshake per session)
- All ops reuse single SFTP connection — no per-op handshake overhead
- 5-minute idle timeout → server closes WS gracefully
- Browser tab close / WS close → immediate SFTP + SSH disconnect

### Security

- Path traversal guard: resolve all paths server-side, reject any path escaping the allowed root
- Max file size for `read`/`write`: 10MB (configurable). `download` streams without size limit.
- SFTP subsystem only — shell never opened on this connection
- No keypair configured for workspace → reject with `NO_KEYPAIR` before attempting SSH

---

## Section 3: UI Components

### Server List Page (`/servers`)

- Status badges update live via SSE — no page reload needed
- Metric sparklines (cpu/mem/disk) refresh on each SSE event (~5s)
- `Last ping` timestamp updates in real-time from SSE data

### Server Detail Page (`/servers/[id]`)

Tabs: **Overview** | **Files** | **Alerts**

**Overview tab:**
- Live metric gauges: CPU, memory, disk, load avg
- 24h history charts — append new SSE point, drop oldest (no full re-fetch)
- Uptime counter ticking from `uptime_seconds`

**Files tab:**
```
┌──────────────────┬────────────────────────────────┐
│ /var/www         │  nginx.conf                    │
│ ├── html/        │                                │
│ │   └── index..  │  server {                      │
│ ├── nginx.conf ◄─┤    listen 80;                  │
│ └── logs/        │    ...                         │
│                  │                                │
│ [Upload]         │  [Save]  [Download]  [Delete]  │
└──────────────────┴────────────────────────────────┘
```
- Left panel: directory tree, click folder to expand (lazy load), click file to open
- Right panel: text editor for text files, hex/binary indicator + download for binary
- Drag file onto left panel → upload to current directory
- Path breadcrumb at top, clickable to navigate
- Default root: `/` (configurable per session)

**Alerts tab:**
- Existing alerts list for this server
- Alert bar: switches from 60s poll → SSE `alert:new` event (instant banner)

---

## Section 4: Error Handling

### SSE (Metrics)

| Condition | Handling |
|---|---|
| Client disconnect | `res.on('close')` removes from registry — no leak |
| API restart | Browser `EventSource` auto-reconnects (native) |
| Server offline | SSE still delivers `status: offline` on next ping |
| Proxy drops idle connection | 15s heartbeat comment keeps alive |

### SFTP WebSocket (File Management)

| Condition | Response |
|---|---|
| SSH connect fail | `{ ok: false, error: 'SSH_CONNECT_FAILED' }` → WS close 4001 |
| No keypair | `{ ok: false, error: 'NO_KEYPAIR' }` before SSH attempt |
| Op timeout (10s) | `{ ok: false, error: 'TIMEOUT' }` — connection stays open |
| Path traversal | `{ ok: false, error: 'FORBIDDEN' }` — log attempt |
| File >10MB read | `{ ok: false, error: 'FILE_TOO_LARGE' }` — download still allowed |
| Idle 5min | Server closes WS gracefully |
| Tab close | `ws.on('close')` → immediate SFTP/SSH disconnect |

### File Editor (Browser)

- Unsaved changes + navigate away → `beforeunload` warning
- Save conflict (file changed on server since open) → show diff, prompt overwrite

---

## Files to Create / Modify

### New files
- `apps/api/src/lib/sse-registry.ts` — SSE registry singleton
- `apps/api/src/routes/sse.ts` — `GET /api/sse/servers` route
- `apps/api/src/ws/sftp-session.ts` — SFTP WS handler
- `apps/web/app/(dashboard)/servers/[id]/files/page.tsx` — file manager UI
- `apps/web/contexts/ServerMetricsContext.tsx` — SSE consumer context

### Modified files
- `apps/api/src/routes/agent.ts` — add SSE broadcast + snapshot rate-limiting
- `apps/api/src/index.ts` — register SSE route + SFTP WS handler
- `apps/web/app/(dashboard)/servers/page.tsx` — consume SSE context
- `apps/web/app/(dashboard)/servers/[id]/page.tsx` — add Files tab, live metrics
- `apps/web/components/AlertBar.tsx` — switch to SSE-pushed alerts
- `apps/agent/.env.example` — update `VANTAGE_INTERVAL_MS` default to `5000`

---

## Out of Scope

- Shell/terminal execution (already covered by `ssh-terminal.ts`)
- VM start/stop/provision
- File diff/merge UI beyond overwrite prompt
- Agent WebSocket upgrade (not needed for 5s freshness target)
