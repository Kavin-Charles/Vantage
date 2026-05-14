# Vantage Agent Completion — Design Spec

**Goal:** Ship the monitoring agent as a publishable npm package (`vantage-agent`) with a complete install story: fix the db-checks bug, add build config, write install docs with systemd support, and update the UI token reveal modals to show the full install sequence.

**Architecture:** Four targeted changes to `apps/agent/` (bug fix + build + docs) and one UI change across two pages. No new API endpoints — the ping endpoint already accepts `ok: false` db check entries.

**Tech Stack:** Node.js 18+, TypeScript, systemd, npm publish, Next.js 14 App Router.

---

## 1. Bug Fix — `apps/agent/src/db-checks.ts`

Currently `checkDatabases()` filters results to only `ok: true` entries before returning. This silently drops failed database checks — the API never learns a monitored DB is down.

**Fix:** Remove the `.filter(r => r.ok)` before returning. Return all results (both `ok: true` and `ok: false`).

The API ping endpoint's Zod schema (`apps/api/src/routes/agent.ts`) already accepts `ok: boolean` — no API changes needed.

---

## 2. Build & Package Setup — `apps/agent/`

### `apps/agent/tsconfig.json` (Create)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### `apps/agent/package.json` additions

Add to existing `package.json`:
- `"description": "Vantage monitoring agent — reports server metrics to your Vantage workspace"`
- `"license": "MIT"`
- `"files": ["dist/", "README.md"]`
- `"publishConfig": { "access": "public" }`

### `apps/agent/.env.example` (Create)

```
VANTAGE_TOKEN=your_agent_token_here
VANTAGE_API_URL=https://api.vantage.app
VANTAGE_INTERVAL_MS=30000
```

### Build verification

Run `pnpm build` in `apps/agent/` — must produce `dist/index.js` with no TypeScript errors. The `bin` entry in `package.json` already points to `dist/index.js`.

---

## 3. Documentation — `apps/agent/README.md` (Create)

Full install guide covering:

1. **What it is** — lightweight Node.js daemon that reports CPU, memory, disk, load average, network I/O, and database connectivity to your Vantage workspace every 30 seconds.

2. **Prerequisites** — Node.js 18+, a Vantage account with a server registered (to get the agent token).

3. **Install:**
   ```bash
   npm install -g vantage-agent
   ```

4. **Quick test (foreground):**
   ```bash
   VANTAGE_TOKEN=your_token vantage-agent
   ```

5. **Environment variables:**
   | Variable | Required | Default | Description |
   |---|---|---|---|
   | `VANTAGE_TOKEN` | ✅ | — | Agent token from Vantage dashboard |
   | `VANTAGE_API_URL` | ❌ | `https://api.vantage.app` | API endpoint |
   | `VANTAGE_INTERVAL_MS` | ❌ | `30000` | Reporting interval in ms |

6. **Production — systemd service:**

   Create `/etc/systemd/system/vantage-agent.service`:
   ```ini
   [Unit]
   Description=Vantage Monitoring Agent
   After=network.target

   [Service]
   ExecStart=/usr/bin/vantage-agent
   Restart=always
   RestartSec=10
   Environment=VANTAGE_TOKEN=your_token_here
   Environment=VANTAGE_API_URL=https://api.vantage.app

   [Install]
   WantedBy=multi-user.target
   ```

   Then enable and start:
   ```bash
   systemctl daemon-reload
   systemctl enable --now vantage-agent
   systemctl status vantage-agent
   ```

7. **Platform notes** — disk and network metrics only collected on Linux. macOS/Windows report 0 for those fields; CPU, memory, uptime, and load average work on all platforms.

---

## 4. UI Update — Token Reveal Modals

Both token reveal modals (server create + token regen) currently show just the raw token and a single-line agent command. Replace with a stepped install sequence.

### New token reveal content (shared pattern, both modals)

```
Copy this token now — it won't be shown again.
[monospace token box]

Install the agent on your server:

Step 1 — Install
  npm install -g vantage-agent

Step 2 — Create systemd service
  sudo tee /etc/systemd/system/vantage-agent.service > /dev/null << 'EOF'
  [Unit]
  Description=Vantage Monitoring Agent
  After=network.target

  [Service]
  ExecStart=/usr/bin/vantage-agent
  Restart=always
  RestartSec=10
  Environment=VANTAGE_TOKEN=<TOKEN>
  Environment=VANTAGE_API_URL=https://api.vantage.app

  [Install]
  WantedBy=multi-user.target
  EOF

Step 3 — Start
  sudo systemctl daemon-reload && sudo systemctl enable --now vantage-agent

[Done button]
```

`<TOKEN>` in the systemd block is replaced with the actual token value.

### Files changed

- `apps/web/app/(dashboard)/servers/page.tsx` — create server modal token reveal
- `apps/web/app/(dashboard)/servers/[id]/page.tsx` — token regen reveal modal (added in feat/servers-management)

Both modals get identical stepped content. Extract a shared `AgentInstallInstructions` component in `apps/web/components/ui/AgentInstallInstructions.tsx` to avoid duplication.

---

## 5. File Map

| File | Action |
|------|--------|
| `apps/agent/src/db-checks.ts` | Modify — remove `.filter(r => r.ok)` |
| `apps/agent/tsconfig.json` | Create — TypeScript build config |
| `apps/agent/package.json` | Modify — add description, license, files, publishConfig |
| `apps/agent/.env.example` | Create |
| `apps/agent/README.md` | Create — full install docs |
| `apps/web/components/ui/AgentInstallInstructions.tsx` | Create — shared stepped install UI component |
| `apps/web/app/(dashboard)/servers/page.tsx` | Modify — use AgentInstallInstructions in create modal |
| `apps/web/app/(dashboard)/servers/[id]/page.tsx` | Modify — use AgentInstallInstructions in regen modal |
