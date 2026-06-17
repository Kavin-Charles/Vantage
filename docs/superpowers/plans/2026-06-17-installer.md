# Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old Docker-based installer image with a shell script that pulls pre-built GHCR images, while simplifying the setup wizard to only collect branding, features, SMTP, and admin config.

**Architecture:** `install.sh` handles all infrastructure (creates dir, writes docker-compose + .env, pulls images, starts containers). The existing Next.js setup wizard at `/setup` handles app configuration after containers are running. GitHub Actions builds and pushes Docker images to GHCR on every push to `main`.

**Tech Stack:** Bash, Docker Compose v2, GHCR (`ghcr.io/vencorehq/`), GitHub Actions, Next.js rewrites (proxy pattern)

---

## File Map

### Created
- `install.sh` — curl-installable shell script
- `docker-compose.prod.yml` — reference compose file (same content as embedded in install.sh)
- `.github/workflows/docker-publish.yml` — builds + pushes 3 images to GHCR on push to main

### Modified
- `apps/web/app/setup/types.ts` — remove infra/domain steps, simplify state shape
- `apps/web/app/setup/Sidebar.tsx` — update STEP_LABELS to match new StepId
- `apps/web/app/setup/SetupWizard.tsx` — remove deleted step imports/entries
- `apps/web/app/setup/steps/StepReview.tsx` — simplify: single-column, relative fetch, no deploy log
- `apps/api/src/index.ts` — remove installer import + route mount

### Deleted
- `apps/web/app/setup/steps/StepInfrastructure.tsx`
- `apps/web/app/setup/steps/StepDatabase.tsx`
- `apps/web/app/setup/steps/StepRedis.tsx`
- `apps/web/app/setup/steps/StepDomainSsl.tsx`
- `apps/api/src/routes/installer.ts`
- `apps/api/src/lib/installer/` (entire directory)
- `Dockerfile.installer`
- `scripts/installer-entrypoint.sh`

---

## Task 1: Simplify wizard types

**Files:**
- Modify: `apps/web/app/setup/types.ts`

- [ ] **Step 1: Replace types.ts entirely**

```ts
// apps/web/app/setup/types.ts

export type StepId =
  | 'branding'
  | 'smtp'
  | 'features'
  | 'admin'
  | 'review'
  | 'complete';

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

export type SetupState = {
  currentStep: StepId;
  skipped: StepId[];
  branding: {
    name: string;
    logoUrl: string;
    faviconUrl: string;
    primaryColor: string;
    tagline: string;
  };
  smtp: SmtpConfig | null;
  features: { crm: boolean; infra: boolean; alerts: boolean; analytics: boolean };
  admin: { name: string; email: string; password: string };
};

export type WizardAction =
  | { type: 'GO_TO'; step: StepId }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SKIP'; step: StepId }
  | { type: 'SET_BRANDING'; value: SetupState['branding'] }
  | { type: 'SET_SMTP'; value: SmtpConfig | null }
  | { type: 'SET_FEATURES'; value: SetupState['features'] }
  | { type: 'SET_ADMIN'; value: SetupState['admin'] };

export const OPTIONAL_STEPS: StepId[] = ['smtp'];

export const INITIAL_STATE: SetupState = {
  currentStep: 'branding',
  skipped: [],
  branding: { name: '', logoUrl: '/logo.png', faviconUrl: '', primaryColor: '#0b1330', tagline: '' },
  smtp: null,
  features: { crm: true, infra: true, alerts: true, analytics: false },
  admin: { name: '', email: '', password: '' },
};

export function getStepList(_state: SetupState): StepId[] {
  return ['branding', 'smtp', 'features', 'admin', 'review', 'complete'];
}

export function getStepStatus(
  stepId: StepId,
  currentStep: StepId,
  skipped: StepId[],
  stepList: StepId[]
): 'done' | 'current' | 'locked' | 'skipped' {
  if (skipped.includes(stepId)) return 'skipped';
  if (stepId === currentStep) return 'current';
  const currentIdx = stepList.indexOf(currentStep);
  const stepIdx = stepList.indexOf(stepId);
  if (stepIdx === -1) return 'locked';
  return stepIdx < currentIdx ? 'done' : 'locked';
}

export function wizardReducer(state: SetupState, action: WizardAction): SetupState {
  const list = getStepList(state);
  const currentIdx = list.indexOf(state.currentStep);

  switch (action.type) {
    case 'GO_TO':
      return { ...state, currentStep: action.step };

    case 'NEXT': {
      const next = list[currentIdx + 1];
      return next ? { ...state, currentStep: next } : state;
    }

    case 'BACK': {
      const prev = list[currentIdx - 1];
      return prev ? { ...state, currentStep: prev } : state;
    }

    case 'SKIP': {
      const newSkipped = [...state.skipped.filter(s => s !== action.step), action.step];
      const skipIdx = list.indexOf(action.step);
      const next = list[skipIdx + 1];
      return { ...state, skipped: newSkipped, currentStep: next ?? state.currentStep };
    }

    case 'SET_BRANDING': return { ...state, branding: action.value };
    case 'SET_SMTP': return { ...state, smtp: action.value };
    case 'SET_FEATURES': return { ...state, features: action.value };
    case 'SET_ADMIN': return { ...state, admin: action.value };

    default: return state;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/setup/types.ts
git commit -m "refactor(setup): simplify wizard to branding/smtp/features/admin flow"
```

---

## Task 2: Delete removed step files

**Files:**
- Delete: `apps/web/app/setup/steps/StepInfrastructure.tsx`
- Delete: `apps/web/app/setup/steps/StepDatabase.tsx`
- Delete: `apps/web/app/setup/steps/StepRedis.tsx`
- Delete: `apps/web/app/setup/steps/StepDomainSsl.tsx`

- [ ] **Step 1: Delete the four removed step files**

```bash
rm apps/web/app/setup/steps/StepInfrastructure.tsx
rm apps/web/app/setup/steps/StepDatabase.tsx
rm apps/web/app/setup/steps/StepRedis.tsx
rm apps/web/app/setup/steps/StepDomainSsl.tsx
```

- [ ] **Step 2: Commit**

```bash
git add -u apps/web/app/setup/steps/
git commit -m "refactor(setup): remove infrastructure/domain wizard steps"
```

---

## Task 3: Update Sidebar.tsx

**Files:**
- Modify: `apps/web/app/setup/Sidebar.tsx`

The `STEP_LABELS` is typed as `Record<StepId, string>` — TypeScript will error after Task 1 removes infra/db/redis/domain from `StepId`. Fix it.

- [ ] **Step 1: Update STEP_LABELS in Sidebar.tsx**

Replace the `STEP_LABELS` constant (lines 6-17 in the current file):

```ts
const STEP_LABELS: Record<StepId, string> = {
  branding: 'Branding',
  smtp: 'SMTP',
  features: 'Features',
  admin: 'Admin Account',
  review: 'Review & Complete',
  complete: 'Complete',
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/setup/Sidebar.tsx
git commit -m "refactor(setup): update sidebar step labels for simplified wizard"
```

---

## Task 4: Update SetupWizard.tsx

**Files:**
- Modify: `apps/web/app/setup/SetupWizard.tsx`

- [ ] **Step 1: Remove deleted step imports and stepContent entries**

Replace the import block and `stepContent` object. The full updated file:

```tsx
// apps/web/app/setup/SetupWizard.tsx
'use client';

import { useReducer, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { wizardReducer, INITIAL_STATE, getStepList, OPTIONAL_STEPS } from './types';
import type { StepId } from './types';
import { StepBranding } from './steps/StepBranding';
import { StepSmtp } from './steps/StepSmtp';
import { StepFeatures } from './steps/StepFeatures';
import { StepAdminAccount } from './steps/StepAdminAccount';
import { StepReview } from './steps/StepReview';
import { StepComplete } from './steps/StepComplete';

export function SetupWizard() {
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_STATE);
  const stepValidateRef = useRef<() => boolean>(() => true);
  const stepList = getStepList(state);
  const currentIdx = stepList.indexOf(state.currentStep);
  const isOptional = OPTIONAL_STEPS.includes(state.currentStep);

  const handleContinue = () => {
    if (stepValidateRef.current()) {
      dispatch({ type: 'NEXT' });
    }
  };

  const stepContent: Record<StepId, React.ReactNode> = {
    branding: <StepBranding state={state} dispatch={dispatch} validateRef={stepValidateRef} />,
    smtp:     <StepSmtp state={state} dispatch={dispatch} />,
    features: <StepFeatures state={state} dispatch={dispatch} />,
    admin:    <StepAdminAccount state={state} dispatch={dispatch} validateRef={stepValidateRef} />,
    review:   <StepReview state={state} dispatch={dispatch} />,
    complete: <StepComplete state={state} />,
  };

  const showFooter = state.currentStep !== 'complete' && state.currentStep !== 'review';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{
        height: 56,
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
          Vencore Setup
        </span>
        {state.currentStep !== 'complete' && (
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            Step {currentIdx + 1} of {stepList.length - 1}
          </span>
        )}
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar state={state} onGoTo={step => dispatch({ type: 'GO_TO', step })} />

        <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, padding: '40px 48px', maxWidth: 640 }}>
            {stepContent[state.currentStep]}
          </div>

          {showFooter && (
            <footer style={{
              borderTop: '1px solid var(--border)',
              padding: '16px 48px',
              display: 'flex',
              justifyContent: 'space-between',
              background: 'var(--surface)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', gap: 12 }}>
                {currentIdx > 0 && (
                  <button onClick={() => dispatch({ type: 'BACK' })} style={btnSecondary}>
                    ← Back
                  </button>
                )}
                {isOptional && (
                  <button
                    onClick={() => dispatch({ type: 'SKIP', step: state.currentStep })}
                    style={{ ...btnSecondary, color: 'var(--text3)' }}
                  >
                    Skip for now
                  </button>
                )}
              </div>
              <button id="wizard-continue" onClick={handleContinue} style={btnPrimary}>
                Continue →
              </button>
            </footer>
          )}
        </main>
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: '9px 20px',
  background: 'var(--text)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'IBM Plex Sans, sans-serif',
};

const btnSecondary: React.CSSProperties = {
  padding: '9px 20px',
  background: 'var(--surface2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'IBM Plex Sans, sans-serif',
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/setup/SetupWizard.tsx
git commit -m "refactor(setup): remove deleted steps from wizard"
```

---

## Task 5: Simplify StepReview.tsx

**Files:**
- Modify: `apps/web/app/setup/steps/StepReview.tsx`

Remove the deploy-log panel, `isOwnCreds` branching, and `logLines` state. Use a relative path fetch so the Next.js rewrite proxy handles routing to Express (Dockerfile.web already sets `NEXT_PUBLIC_API_URL=http://api:3001` which the rewrite uses server-side; browser code must use relative paths so it goes through the proxy, not directly to the internal hostname).

- [ ] **Step 1: Replace StepReview.tsx**

```tsx
'use client';

import { useState } from 'react';
import type { SetupState, WizardAction, StepId } from '../types';
import { getStepList, OPTIONAL_STEPS } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

type Status = 'idle' | 'deploying' | 'error';

const STEP_LABELS: Partial<Record<StepId, string>> = {
  branding: 'Branding',
  smtp: 'SMTP',
  features: 'Features',
  admin: 'Admin Account',
};

const SKIP_WARNINGS: Partial<Record<StepId, string>> = {
  smtp: 'Email features (invites, alerts, password reset) will not work.',
};

export function StepReview({ state, dispatch }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const stepList = getStepList(state);
  const reviewSteps = stepList.filter(s => s !== 'review' && s !== 'complete');

  const complete = async () => {
    setStatus('deploying');
    setError('');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          branding: { name: state.branding.name, logoUrl: state.branding.logoUrl },
          features: state.features,
          smtp: state.smtp,
          admin: state.admin,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message ?? json.error.code ?? 'Setup failed');
      window.location.href = '/api/setup/activate?from=/login';
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <div>
      <h2 style={heading}>Review & Complete</h2>
      <p style={subtext}>Confirm your configuration before completing setup.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
        {reviewSteps.map(stepId => {
          const isSkipped = state.skipped.includes(stepId);
          const warning = isSkipped ? SKIP_WARNINGS[stepId] : undefined;
          return (
            <div key={stepId} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 14px', borderRadius: 8,
              background: isSkipped ? 'color-mix(in srgb, var(--text3) 10%, transparent)' : 'var(--surface2)',
              border: `1px solid ${isSkipped ? 'var(--text3)' : 'var(--border)'}`,
            }}>
              <span style={{ fontSize: 13, color: isSkipped ? 'var(--text3)' : 'var(--green)', fontWeight: 700, marginTop: 1 }}>
                {isSkipped ? '⊘' : '✓'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                  {STEP_LABELS[stepId]}
                  {isSkipped && <span style={{ color: 'var(--text3)', fontWeight: 400 }}> — skipped</span>}
                </div>
                {warning && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>⚠ {warning}</div>}
                {!isSkipped && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{summarize(state, stepId)}</div>}
              </div>
              <button onClick={() => dispatch({ type: 'GO_TO', step: stepId })} style={editBtn}>Edit</button>
            </div>
          );
        })}
      </div>

      {status === 'error' && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: 'var(--red-bg)', border: '1px solid var(--red)',
          color: 'var(--red)', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <button
        onClick={status !== 'deploying' ? complete : undefined}
        disabled={status === 'deploying'}
        style={{
          padding: '12px 24px',
          background: status === 'error' ? 'var(--red)' : 'var(--text)',
          color: '#fff', border: 'none', borderRadius: 8,
          fontSize: 15, fontWeight: 600,
          cursor: status === 'deploying' ? 'wait' : 'pointer',
          fontFamily: 'var(--font-display)',
        }}
      >
        {status === 'idle' && 'Complete Setup →'}
        {status === 'deploying' && 'Creating workspace…'}
        {status === 'error' && '↺ Retry'}
      </button>
    </div>
  );
}

function summarize(state: SetupState, stepId: StepId): string {
  switch (stepId) {
    case 'branding': return state.branding.name || '—';
    case 'smtp': return state.smtp?.host ?? '—';
    case 'features': return Object.entries(state.features).filter(([, v]) => v).map(([k]) => k).join(', ');
    case 'admin': return state.admin.email || '—';
    default: return '';
  }
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' };
const subtext: React.CSSProperties = { margin: '0 0 20px', color: 'var(--text2)', fontSize: 14 };
const editBtn: React.CSSProperties = { padding: '3px 10px', fontSize: 12, background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text2)', fontFamily: 'IBM Plex Sans, sans-serif' };
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/setup/steps/StepReview.tsx
git commit -m "refactor(setup): simplify review step — single column, relative fetch, no deploy log"
```

---

## Task 6: Check remaining step files for infra state references

**Files:**
- Read: `apps/web/app/setup/steps/StepBranding.tsx`
- Read: `apps/web/app/setup/steps/StepSmtp.tsx`
- Read: `apps/web/app/setup/steps/StepFeatures.tsx`
- Read: `apps/web/app/setup/steps/StepAdminAccount.tsx`
- Read: `apps/web/app/setup/steps/StepComplete.tsx`

- [ ] **Step 1: Check for any references to removed state fields**

```bash
grep -n "infra\|domain\|redis\." \
  apps/web/app/setup/steps/StepBranding.tsx \
  apps/web/app/setup/steps/StepSmtp.tsx \
  apps/web/app/setup/steps/StepFeatures.tsx \
  apps/web/app/setup/steps/StepAdminAccount.tsx \
  apps/web/app/setup/steps/StepComplete.tsx 2>/dev/null || echo "No references found"
```

Expected: no matches (these steps only use their own state slice). If matches are found, remove those references.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -40
```

Expected: no errors related to setup wizard files. Fix any that appear before continuing.

---

## Task 7: Remove installer from API

**Files:**
- Modify: `apps/api/src/index.ts` (remove 2 lines)
- Delete: `apps/api/src/routes/installer.ts`
- Delete: `apps/api/src/lib/installer/` (directory)

- [ ] **Step 1: Remove installer import and route from index.ts**

In `apps/api/src/index.ts`, remove these two lines:
- Line 22: `import { createInstallerRouter } from './routes/installer';`
- Line 226: `app.use('/api/installer', createInstallerRouter());`

- [ ] **Step 2: Delete installer files**

```bash
rm apps/api/src/routes/installer.ts
rm -rf apps/api/src/lib/installer/
```

- [ ] **Step 3: Verify API TypeScript compiles**

```bash
cd apps/api && pnpm tsc --noEmit 2>&1 | head -40
```

Expected: no errors. Fix any that appear.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.ts
git add -u apps/api/src/routes/installer.ts apps/api/src/lib/installer/
git commit -m "refactor(api): remove installer routes and lib"
```

---

## Task 8: Delete old Docker installer files

**Files:**
- Delete: `Dockerfile.installer`
- Delete: `scripts/installer-entrypoint.sh`

- [ ] **Step 1: Delete files**

```bash
rm Dockerfile.installer
rm scripts/installer-entrypoint.sh
```

Check if `scripts/` is now empty:
```bash
ls scripts/ 2>/dev/null && echo "scripts dir has remaining files" || echo "scripts dir now empty — rmdir scripts/"
```

If empty: `rmdir scripts/`

- [ ] **Step 2: Commit**

```bash
git add -u Dockerfile.installer scripts/
git commit -m "chore: remove old installer Dockerfile and entrypoint"
```

---

## Task 9: Write install.sh

**Files:**
- Create: `install.sh`

- [ ] **Step 1: Create install.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()  { echo -e "${BLUE}[vencore]${NC} $*"; }
ok()   { echo -e "${GREEN}[vencore]${NC} $*"; }
warn() { echo -e "${YELLOW}[vencore]${NC} $*"; }
err()  { echo -e "${RED}[vencore]${NC} ERROR: $*" >&2; exit 1; }

INSTALL_DIR="${VENCORE_DIR:-$HOME/vencore}"

check_deps() {
  command -v docker >/dev/null 2>&1 || err "Docker not found. Install from https://docs.docker.com/get-docker/"
  docker compose version >/dev/null 2>&1 || err "Docker Compose v2 plugin not found. Update Docker Desktop or run: apt-get install docker-compose-plugin"
  command -v openssl >/dev/null 2>&1 || err "openssl not found. Install it: apt-get install openssl"
}

gen_secret() { openssl rand -hex 32; }

detect_ip() {
  hostname -I 2>/dev/null | awk '{print $1}' || \
  ip route get 1 2>/dev/null | awk '{print $NF;exit}' || \
  echo "localhost"
}

write_compose() {
  cat > "$INSTALL_DIR/docker-compose.yml" <<'COMPOSE'
services:
  web:
    image: ghcr.io/vencorehq/vencore-web:latest
    ports:
      - "80:3000"
    env_file: .env
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped

  api:
    image: ghcr.io/vencorehq/vencore-api:latest
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3001/api/setup/status || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 20
    restart: unless-stopped

  worker:
    image: ghcr.io/vencorehq/vencore-worker:latest
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: vencore
      POSTGRES_PASSWORD: vencore
      POSTGRES_DB: vencore
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vencore"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

volumes:
  db_data:
  redis_data:
COMPOSE
}

write_env() {
  cat > "$INSTALL_DIR/.env" << EOF
# Database (internal Docker network — do not change hostnames)
DATABASE_URL=postgresql://vencore:vencore@db:5432/vencore
REDIS_URL=redis://redis:6379

# Secrets (auto-generated — keep private)
JWT_SECRET=$(gen_secret)
CRON_SECRET=$(gen_secret)
AGENT_SIGNING_SECRET=$(gen_secret)

# App
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://api:3001
COOKIE_SECURE=false
EOF
}

wait_for_api() {
  log "Waiting for API to be ready..."
  local attempts=0
  while [ $attempts -lt 30 ]; do
    if docker compose -f "$INSTALL_DIR/docker-compose.yml" exec -T api \
        wget -qO- http://localhost:3001/api/setup/status >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 3
  done
  warn "API health check timed out. Check logs: cd $INSTALL_DIR && docker compose logs api"
}

main() {
  echo ""
  echo "  Vencore Installer"
  echo "  ─────────────────"
  echo ""

  log "Checking dependencies..."
  check_deps
  ok "Dependencies OK."

  log "Creating install directory: $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"

  log "Writing docker-compose.yml..."
  write_compose

  if [ -f "$INSTALL_DIR/.env" ]; then
    warn ".env already exists — skipping secret generation."
    warn "To regenerate secrets: rm $INSTALL_DIR/.env && bash $0"
  else
    log "Generating secrets and writing .env..."
    write_env
    ok ".env written."
  fi

  log "Pulling images (first run may take a few minutes)..."
  docker compose -f "$INSTALL_DIR/docker-compose.yml" pull

  log "Starting Vencore..."
  docker compose -f "$INSTALL_DIR/docker-compose.yml" up -d

  wait_for_api

  SERVER_IP=$(detect_ip)

  echo ""
  ok "Vencore is running!"
  echo ""
  echo "  → Open http://$SERVER_IP in your browser to complete setup."
  echo ""
  echo "  Useful commands:"
  echo "    cd $INSTALL_DIR"
  echo "    docker compose logs -f         # View logs"
  echo "    docker compose down            # Stop"
  echo "    docker compose pull && docker compose up -d  # Update"
  echo ""
}

main "$@"
```

After writing the file:
```bash
chmod +x install.sh
```

- [ ] **Step 2: Commit**

```bash
git add install.sh
git commit -m "feat(installer): add shell script installer"
```

---

## Task 10: Write docker-compose.prod.yml

**Files:**
- Create: `docker-compose.prod.yml`

This is the reference compose file — same content as embedded in `install.sh`. Kept in the repo so users who clone the repo can run it directly without `install.sh`.

- [ ] **Step 1: Create docker-compose.prod.yml**

```yaml
# docker-compose.prod.yml
# Reference production compose file.
# Usage: cp .env.example .env && docker compose -f docker-compose.prod.yml up -d
services:
  web:
    image: ghcr.io/vencorehq/vencore-web:latest
    ports:
      - "80:3000"
    env_file: .env
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped

  api:
    image: ghcr.io/vencorehq/vencore-api:latest
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3001/api/setup/status || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 20
    restart: unless-stopped

  worker:
    image: ghcr.io/vencorehq/vencore-worker:latest
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: vencore
      POSTGRES_PASSWORD: vencore
      POSTGRES_DB: vencore
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vencore"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

volumes:
  db_data:
  redis_data:
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "feat(installer): add reference production docker-compose"
```

---

## Task 11: Write GitHub Actions workflow

**Files:**
- Create: `.github/workflows/docker-publish.yml`

Builds all three images and pushes to `ghcr.io/vencorehq/` on every push to `main` and on version tags.

**Pre-requisite:** The `vencorehq` GitHub org must have the `vencore-web`, `vencore-api`, `vencore-worker` packages set to public (or the org must allow `GITHUB_TOKEN` to write packages). Do this after first push: GitHub → vencorehq org → Packages → each package → Package Settings → Change visibility to Public.

- [ ] **Step 1: Create the workflow directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create .github/workflows/docker-publish.yml**

```yaml
name: Publish Docker Images

on:
  push:
    branches: [main]
    tags: ["v*"]

env:
  REGISTRY: ghcr.io
  ORG: vencorehq

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    strategy:
      matrix:
        include:
          - image: vencore-web
            dockerfile: Dockerfile.web
          - image: vencore-api
            dockerfile: Dockerfile.api
          - image: vencore-worker
            dockerfile: Dockerfile.worker

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.ORG }}/${{ matrix.image }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push ${{ matrix.image }}
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ${{ matrix.dockerfile }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=${{ matrix.image }}
          cache-to: type=gha,mode=max,scope=${{ matrix.image }}
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "ci: add GitHub Actions workflow to publish Docker images to GHCR"
```

- [ ] **Step 4: Push branch and verify Actions run**

```bash
git push origin fix/setup-wizard-first-boot
```

Open GitHub → vencorehq/Vencore → Actions tab → confirm the `Publish Docker Images` workflow runs (it won't push yet because it's not on `main`; it will on merge).

---

## Task 12: End-to-end verify

- [ ] **Step 1: Verify the wizard flow in dev**

Start the dev server:
```bash
pnpm dev
```

Navigate to `http://localhost:3000`. With a fresh DB (no workspace), it should redirect to `/setup`.

Confirm the sidebar shows: Branding → SMTP → Features → Admin Account → Review & Complete → Complete

Walk through each step and confirm the "Complete Setup →" button on Review calls `POST /api/setup` (check Network tab — it should hit `/api/setup`, not `http://localhost:3001/api/setup` directly from the browser).

After completing, confirm redirect to `/login` then `/dashboard`.

- [ ] **Step 2: Verify TypeScript passes**

```bash
pnpm --filter "@vencore/web..." tsc --noEmit
pnpm --filter "@vencore/api..." tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add <files>
git commit -m "fix(setup): <description of any remaining fixes>"
```
