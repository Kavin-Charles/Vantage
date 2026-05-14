# Vantage Agent Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the monitoring agent as a publishable npm package with a complete install story: fix a silent db-check bug, prep the package for npm publish, write install docs with systemd support, and update the server create modal to show the full stepped install sequence.

**Architecture:** Three changes to `apps/agent/` (bug fix + package prep + docs), one new shared React component, and one UI update in `apps/web/`. No new API endpoints. The `[id]/page.tsx` token regen modal is in the unmerged `feat/servers-management` PR — update it after that PR merges to avoid conflicts.

**Tech Stack:** Node.js 18+, TypeScript, pnpm monorepo, Next.js 14 App Router, React.

---

## File Map

| File | Action |
|------|--------|
| `apps/agent/src/db-checks.ts` | Modify — report all db checks, not just `ok: true` |
| `apps/agent/package.json` | Modify — add `license`, `files`, `publishConfig` |
| `apps/agent/.env.example` | Create |
| `apps/agent/README.md` | Create — full install docs with systemd |
| `apps/web/components/ui/AgentInstallInstructions.tsx` | Create — stepped install UI component |
| `apps/web/app/(dashboard)/servers/page.tsx` | Modify — replace one-liner with `AgentInstallInstructions` |

---

### Task 1: Fix db-checks bug — report all checks, not just successful ones

**Files:**
- Modify: `apps/agent/src/db-checks.ts`

Context: `checkDatabases()` currently wraps the push in `if (result.ok)`, silently dropping failed DB connections. The API ping endpoint accepts `ok: boolean` already — no API change needed. The fix is removing the `if` guard.

- [ ] **Step 1: Read the current file**

Read `apps/agent/src/db-checks.ts`. Confirm line 47 is `if (result.ok) {`.

- [ ] **Step 2: Apply the fix**

Find:
```typescript
  for (const [portStr, type] of Object.entries(KNOWN_PORTS)) {
    const port = parseInt(portStr, 10);
    const result = await checkPort(port);
    if (result.ok) {
      results.push({ type, port, ...result });
    }
  }
```

Replace with:
```typescript
  for (const [portStr, type] of Object.entries(KNOWN_PORTS)) {
    const port = parseInt(portStr, 10);
    const result = await checkPort(port);
    results.push({ type, port, ...result });
  }
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:\Projects\Vantage
pnpm --filter vantage-agent exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/db-checks.ts
git commit -m "fix: report failed db checks in agent ping (not just ok: true)"
```

---

### Task 2: Prep package.json for npm publish

**Files:**
- Modify: `apps/agent/package.json`

Context: The package already has `name`, `version`, `description`, `bin`, `scripts`, `engines`. It needs `license`, `files` (so only `dist/` and `README.md` are published, not source), and `publishConfig` (sets npm access to public for scoped or new packages).

- [ ] **Step 1: Read the current file**

Read `apps/agent/package.json`. Current content:
```json
{
  "name": "vantage-agent",
  "version": "1.0.0",
  "description": "Vantage infrastructure monitoring agent",
  "main": "dist/index.js",
  "bin": {
    "vantage-agent": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "pnpm build"
  },
  "devDependencies": {
    "@types/node": "^25.6.2",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: Add the three fields**

Replace the file with:
```json
{
  "name": "vantage-agent",
  "version": "1.0.0",
  "description": "Vantage infrastructure monitoring agent",
  "license": "MIT",
  "main": "dist/index.js",
  "bin": {
    "vantage-agent": "dist/index.js"
  },
  "files": [
    "dist/",
    "README.md"
  ],
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "pnpm build"
  },
  "devDependencies": {
    "@types/node": "^25.6.2",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 3: Verify build produces dist/**

```bash
cd D:\Projects\Vantage\apps\agent
pnpm build
```

Expected: `dist/index.js` exists after the command. No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/package.json
git commit -m "chore: prep vantage-agent package.json for npm publish"
```

---

### Task 3: Create .env.example

**Files:**
- Create: `apps/agent/.env.example`

Context: Users need a reference for all supported environment variables. This file is not used by the code — it's documentation only.

- [ ] **Step 1: Create the file**

```
# apps/agent/.env.example

# Required: your agent token from the Vantage dashboard (Settings > Servers > Add Server)
VANTAGE_TOKEN=your_agent_token_here

# Optional: override the API endpoint (default: https://api.vantage.app)
VANTAGE_API_URL=https://api.vantage.app

# Optional: reporting interval in milliseconds (default: 30000 = 30 seconds)
VANTAGE_INTERVAL_MS=30000
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent/.env.example
git commit -m "docs: add .env.example for vantage-agent"
```

---

### Task 4: Write README.md with systemd install docs

**Files:**
- Create: `apps/agent/README.md`

Context: This is the primary install reference for users. It lives in `apps/agent/` and gets published to npm with the package (included in `files`). It must cover: what the agent does, install, configure, quick test, production systemd setup, platform limitations.

- [ ] **Step 1: Create the file**

```markdown
# vantage-agent

Lightweight monitoring agent for [Vantage](https://vantage.app). Runs on your servers and reports CPU, memory, disk, load average, network I/O, and database connectivity to your Vantage workspace every 30 seconds.

## Prerequisites

- Node.js 18 or later
- A Vantage account with at least one server registered (to get your agent token)

## Install

```bash
npm install -g vantage-agent
```

## Quick test (foreground)

```bash
VANTAGE_TOKEN=your_token_here vantage-agent
```

The agent will log each tick to stdout. Press Ctrl+C to stop.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VANTAGE_TOKEN` | ✅ | — | Agent token from the Vantage dashboard |
| `VANTAGE_API_URL` | ❌ | `https://api.vantage.app` | API endpoint (self-hosted only) |
| `VANTAGE_INTERVAL_MS` | ❌ | `30000` | Reporting interval in milliseconds |

Get your token from the Vantage dashboard: **Servers → Add Server** (or **Servers → [server name] → Regenerate token**).

## Production setup (systemd)

Create the service file:

```bash
sudo tee /etc/systemd/system/vantage-agent.service > /dev/null << 'EOF'
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
EOF
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vantage-agent
sudo systemctl status vantage-agent
```

To view logs:

```bash
journalctl -u vantage-agent -f
```

## Platform notes

| Metric | Linux | macOS | Windows |
|---|---|---|---|
| CPU % | ✅ | ✅ | ✅ |
| Memory % | ✅ | ✅ | ✅ |
| Uptime | ✅ | ✅ | ✅ |
| Load avg (1m) | ✅ | ✅ | ✅ |
| Disk % | ✅ | ❌ (0) | ❌ (0) |
| Network I/O | ✅ | ❌ (0) | ❌ (0) |

Disk and network metrics use Linux-specific interfaces (`df`, `/proc/net/dev`). All other metrics work on any platform.

## Database connectivity checks

The agent automatically checks for databases running on well-known local ports:

| Database | Port |
|---|---|
| PostgreSQL | 5432 |
| MySQL | 3306 |
| Redis | 6379 |
| ClickHouse | 9000 |
| MongoDB | 27017 |

Results (including failures) are included in each ping payload so Vantage can alert when a local database goes down.

## License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent/README.md
git commit -m "docs: add README with systemd install instructions for vantage-agent"
```

---

### Task 5: AgentInstallInstructions component + update servers create modal

**Files:**
- Create: `apps/web/components/ui/AgentInstallInstructions.tsx`
- Modify: `apps/web/app/(dashboard)/servers/page.tsx`

Context: The server create modal currently shows a basic one-liner (`VANTAGE_TOKEN=... vantage-agent`) after creating a server. Replace with a stepped install sequence (npm install → systemd service file → enable). Extract into a reusable component so the token regen modal (in the `feat/servers-management` PR) can use it too.

The component takes a single `token: string` prop and renders three numbered steps with copyable `pre` blocks.

- [ ] **Step 1: Create `AgentInstallInstructions.tsx`**

```typescript
// apps/web/components/ui/AgentInstallInstructions.tsx

interface AgentInstallInstructionsProps {
  token: string;
}

export function AgentInstallInstructions({ token }: AgentInstallInstructionsProps) {
  const serviceFile = `[Unit]
Description=Vantage Monitoring Agent
After=network.target

[Service]
ExecStart=/usr/bin/vantage-agent
Restart=always
RestartSec=10
Environment=VANTAGE_TOKEN=${token}
Environment=VANTAGE_API_URL=https://api.vantage.app

[Install]
WantedBy=multi-user.target`;

  const createServiceCmd = `sudo tee /etc/systemd/system/vantage-agent.service > /dev/null << 'EOF'\n${serviceFile}\nEOF`;

  const steps: { label: string; code: string }[] = [
    {
      label: 'Install the agent',
      code: 'npm install -g vantage-agent',
    },
    {
      label: 'Create the systemd service',
      code: createServiceCmd,
    },
    {
      label: 'Enable and start',
      code: 'sudo systemctl daemon-reload && sudo systemctl enable --now vantage-agent',
    },
  ];

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        Install the agent on your server:
      </p>
      {steps.map((step, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
            {i + 1}. {step.label}
          </div>
          <pre style={{
            margin: 0,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 11,
            fontFamily: 'monospace',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {step.code}
          </pre>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update the token reveal modal in `servers/page.tsx`**

Read `apps/web/app/(dashboard)/servers/page.tsx`. Add the import at the top of the file (after existing imports):

```typescript
import { AgentInstallInstructions } from '@/components/ui/AgentInstallInstructions';
```

Find the token reveal modal (the `{modal && typeof modal === 'object' && (` block). Replace the existing `<p>Install the agent...</p><pre>...</pre>` block with the component:

Current content to replace:
```typescript
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Install the agent on your server:</p>
          <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 12, overflow: 'auto' }}>
{`npm install -g vantage-agent
VANTAGE_TOKEN=${modal.token} \\
VANTAGE_API_URL=${process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.vantage.app'} \\
vantage-agent`}
          </pre>
```

Replace with:
```typescript
          <AgentInstallInstructions token={modal.token} />
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:\Projects\Vantage
pnpm --filter web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ui/AgentInstallInstructions.tsx
git add 'apps/web/app/(dashboard)/servers/page.tsx'
git commit -m "feat: add AgentInstallInstructions component with systemd steps to server create modal"
```

---

## Post-merge note

After `feat/servers-management` is merged into `main` and this branch is rebased/merged, update the token regen modal in `apps/web/app/(dashboard)/servers/[id]/page.tsx` to use `<AgentInstallInstructions token={newToken} />` in place of the inline install command block. This is a one-line change identical to Step 2 of Task 5 above.
