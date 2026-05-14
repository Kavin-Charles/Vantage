# Servers Management Perfection — Design Spec

**Goal:** Fix 3 known bugs in the server detail page and add the minimum viable features needed for SSH to work in real-world deployments (configurable SSH user/port, server editing, token regeneration).

**Architecture:** Two additive DB migrations (one column per table), new API endpoints on existing routers, bug fixes in existing React components. No new pages or major structural changes.

**Tech Stack:** PostgreSQL migration, Kysely, Zod, Express, Next.js 14 App Router, TanStack Query, TypeScript strict.

---

## 1. Schema

### Migration 1 — `ssh_user` on `workspace_ssh_keypairs`

```sql
ALTER TABLE workspace_ssh_keypairs
  ADD COLUMN ssh_user VARCHAR(64) NOT NULL DEFAULT 'root';
```

Rationale: SSH user is workspace-scoped (teams use a consistent user across their fleet — `ubuntu`, `ec2-user`, `deploy`, etc.). Stored on the keypair table because both are part of the SSH connection config.

### Migration 2 — `ssh_port` on `servers`

```sql
ALTER TABLE servers
  ADD COLUMN ssh_port INT NOT NULL DEFAULT 22;
```

Rationale: SSH port is per-server. Security-hardened boxes often run on non-standard ports (2222, etc.). Default 22 means zero friction for standard setups.

---

## 2. DB Schema Types (`packages/db/src/schema.ts`)

- `WorkspaceSshKeypairTable`: add `ssh_user: ColumnType<string, string | undefined, string>`
- `ServersTable`: add `ssh_port: ColumnType<number, number | undefined, number>`

## 3. Shared Types (`packages/types/src/index.ts`)

- `WorkspaceSshKeypair`: add `ssh_user: string`
- `Server`: add `ssh_port: number`

---

## 4. API Changes

### 4a. SSH Keypair Router (`apps/api/src/routes/ssh-keypair.ts`)

**`GET /api/ssh`**
- Add `ssh_user` to the `.select([...])` columns list.
- Return it in the response.

**`PATCH /api/ssh`** (new endpoint)
- Zod schema: `z.object({ ssh_user: z.string().min(1).max(64).regex(/^[\w.-]+$/, 'Invalid SSH username') })`
- Updates `ssh_user` on the workspace's keypair row.
- Returns updated keypair (without `encrypted_private_key`/`iv`).
- 404 if workspace has no keypair yet (user must visit SSH settings page to generate one first).

**`DELETE /api/ssh`** (regenerate)
- No change needed — insert already copies `ssh_user` from previous row if we read it first. Specifically: read existing keypair's `ssh_user` before deleting, use it in the new insert. Default `'root'` if no prior keypair exists.

### 4b. Servers Router (`apps/api/src/routes/servers.ts`)

**`PATCH /api/servers/:id`**
- Add `ssh_port: z.number().int().min(1).max(65535).optional()` to `updateServerSchema`.
- No other change needed — existing update logic passes body through to DB.

**`POST /api/servers/:id/token-regen`** (new endpoint)
- Workspace-scoped: verify server belongs to workspace.
- Generate new `rawToken = randomBytes(32).toString('hex')` and `tokenHash = sha256(rawToken)`.
- `UPDATE servers SET agent_token_hash = tokenHash WHERE id = :id AND workspace_id = :wid`.
- Return `{ data: { agent_token: rawToken }, error: null }` — one-time reveal, same pattern as `POST /api/servers`.

### 4c. SSH Actions Router (`apps/api/src/routes/ssh-actions.ts`)

**`resolvePrivateKey()`** helper:
- Currently selects `encrypted_private_key`, `iv` from keypair.
- Add `ssh_user` to the select list.
- Return `{ privateKey, ssh_user }` from the helper.
- Pass `username: ssh_user` to `withSshSession()` config (replacing hardcoded `'root'`).

**`resolveServer()`** helper:
- Currently selects `id`, `workspace_id`, `ip_address` from servers.
- Add `ssh_port` to the select list.
- Return `{ server, ssh_port }` from the helper.
- Pass `port: ssh_port` to `withSshSession()` config (replacing hardcoded `22` if currently hardcoded, otherwise adding it).

---

## 5. Frontend Changes

### 5a. SSH Settings Page (`apps/web/app/(dashboard)/settings/ssh/page.tsx`)

Add below the public key display:

- **SSH Username** section: labeled text input, default value from `data.ssh_user`.
- **Save** button: calls `PATCH /api/ssh` with `{ ssh_user }`.
- Client-side validation: non-empty, max 64 chars, `/^[\w.-]+$/` (valid Unix username characters).
- TanStack Query mutation; on success, `queryClient.invalidateQueries(['ssh-keypair'])`.
- Error display: show API error message inline below the input.

Web SSH library (`apps/web/lib/ssh.ts`): no change needed — `ssh_user` is resolved server-side.

### 5b. Server Detail Page (`apps/web/app/(dashboard)/servers/[id]/page.tsx`)

**Edit server modal:**
- "Edit" button added to `<Topbar />` action slot (alongside existing back nav).
- Modal fields: Name (`string`, required), Region (`string`, optional), IP Address (`string`, optional), SSH Port (`number`, 1–65535, default 22).
- On submit: `PATCH /api/servers/:id` with changed fields.
- On success: `queryClient.invalidateQueries(['server', id])`, close modal.

**Regenerate agent token:**
- "Regenerate token" button in the Overview tab's Details section (below the existing fields list).
- On click: show confirmation: *"This disconnects the current agent until you update its token. Regenerate?"* with Cancel / Regenerate buttons.
- On confirm: call `POST /api/servers/:id/token-regen`.
- On success: show an inline token reveal modal (implemented directly in the detail page, not shared with the list page). UI: monospace token display + agent install command `pre` block (same visual pattern as the create modal in `servers/page.tsx`, but local state in the detail page).

**`/api/servers` web client (`apps/web/lib/servers.ts`):**
- Add `regenToken(token: string, id: string): Promise<...>` — `POST /api/servers/:id/token-regen`.

---

## 6. Bug Fixes

### Bug 1 — Hardcoded `root` in SSH actions (`apps/api/src/routes/ssh-actions.ts`)

**Root cause:** `withSshSession()` called with `username: 'root'` (or equivalent constant).
**Fix:** `resolvePrivateKey()` returns `ssh_user`; all 7 action handlers pass it as `username`.

### Bug 2 — LogsTab auto-refresh fires on keystrokes (`apps/web/app/(dashboard)/servers/[id]/page.tsx`)

**Root cause:** `useEffect` that sets up `setInterval` has `serviceInput` and `lines` in its dependency array. Any keystroke in the service input rebuilds the interval.

**Fix:**
- Use `useRef` to hold current `serviceInput` and `lines` values (updated on every render, not in effect deps).
- Effect depends only on `[autoRefresh]` (and a stable fetch fn identifier).
- Interval callback reads values from refs, not from closure.

```ts
const serviceRef = useRef(serviceInput);
const linesRef = useRef(lines);
useEffect(() => { serviceRef.current = serviceInput; }, [serviceInput]);
useEffect(() => { linesRef.current = lines; }, [lines]);

useEffect(() => {
  if (!autoRefresh) return;
  const id = setInterval(() => fetchLogs(serviceRef.current, linesRef.current), 10_000);
  return () => clearInterval(id);
}, [autoRefresh]); // stable — never recreated on keystrokes
```

### Bug 3 — SSE streams not cancelled on tab-switch (`apps/web/app/(dashboard)/servers/[id]/page.tsx`)

**Root cause:** `TerminalTab` and `ServicesTab` call `openSshStream()` (returns `AbortController`) but don't clean up when the component unmounts (tab-switch triggers unmount).

**Fix:** Wherever `openSshStream` is called inside a `useEffect`, store the returned `AbortController` and abort it in the effect cleanup:

```ts
useEffect(() => {
  if (!running) return;
  const ctrl = openSshStream(url, body, token, onEvent);
  return () => ctrl.abort();
}, [running]);
```

For fire-and-forget calls triggered by button clicks (not effects), store `ctrl` in a `useRef` and call `ctrlRef.current?.abort()` on unmount via a dedicated cleanup effect.

---

## 7. File Map

| File | Action |
|------|--------|
| `packages/db/migrations/20240106_001_ssh_user.ts` | Create — adds `ssh_user` to `workspace_ssh_keypairs` |
| `packages/db/migrations/20240106_002_server_ssh_port.ts` | Create — adds `ssh_port` to `servers` |
| `packages/db/src/schema.ts` | Modify — add columns to both table interfaces |
| `packages/types/src/index.ts` | Modify — add fields to `WorkspaceSshKeypair` and `Server` |
| `apps/api/src/routes/ssh-keypair.ts` | Modify — add `ssh_user` to GET select, add PATCH endpoint, fix DELETE to preserve `ssh_user` |
| `apps/api/src/routes/servers.ts` | Modify — add `ssh_port` to update schema, add token-regen endpoint |
| `apps/api/src/routes/ssh-actions.ts` | Modify — `resolvePrivateKey` returns `ssh_user`, `resolveServer` returns `ssh_port`, pass both to `withSshSession` |
| `apps/web/lib/servers.ts` | Modify — add `regenToken` fn |
| `apps/web/app/(dashboard)/settings/ssh/page.tsx` | Modify — add ssh_user input + save |
| `apps/web/app/(dashboard)/servers/[id]/page.tsx` | Modify — edit modal, token regen, bug fixes 2 & 3 |
