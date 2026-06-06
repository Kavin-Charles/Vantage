# Setup Wizard UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing 5-step linear installer with a full-screen sidebar-nav wizard (8 steps: Branding, Infrastructure, Database, Redis, Domain/SSL, SMTP, Features, Admin, Review, Complete).

**Architecture:** New `types.ts` defines expanded `SetupState` + step list logic. `SetupWizard.tsx` uses `useReducer`. `Sidebar.tsx` renders step status from computed step list. Each step is a self-contained component receiving `state` + `dispatch`. `layout.tsx` provides full-screen layout (no app chrome). `middleware.ts` redirects all non-setup routes when `INSTALLER_MODE=true`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, inline CSS vars (`--bg`, `--surface`, `--border`, `--text`, `--text2`, `--text3`, `--red`, `--green`, `--surface2`), fonts: `Bricolage Grotesque` (display) + `IBM Plex Sans` (body). Vitest for unit tests.

---

## File Structure

### New Files
- `apps/web/app/setup/layout.tsx` — full-screen layout, replaces page-level centering
- `apps/web/app/setup/types.ts` — all wizard types, `getStepList`, `getStepStatus`
- `apps/web/app/setup/Sidebar.tsx` — step list with ✓/→/○/⊘ icons
- `apps/web/app/setup/steps/StepInfrastructure.tsx` — mode picker (own-creds vs docker-deploy)
- `apps/web/app/setup/steps/StepDatabase.tsx` — DB connection form (own-creds sub-step)
- `apps/web/app/setup/steps/StepRedis.tsx` — Redis form (own-creds, optional)
- `apps/web/app/setup/steps/StepDomainSsl.tsx` — domain + SSL + proxy config (optional)
- `apps/web/app/setup/steps/StepComplete.tsx` — post-setup checklist
- `apps/web/middleware.ts` — INSTALLER_MODE redirect guard
- `apps/web/app/setup/__tests__/types.test.ts` — unit tests for getStepList/getStepStatus

### Modified Files
- `packages/config/src/read-config.ts` — make file optional, fix path `vantage` → `vencore`
- `apps/web/app/setup/SetupWizard.tsx` — rewrite: useReducer + sidebar layout
- `apps/web/app/setup/page.tsx` — remove inline centering (layout.tsx takes over)
- `apps/web/app/setup/steps/StepBranding.tsx` — rewrite: add logo upload, favicon, color picker, tagline
- `apps/web/app/setup/steps/StepSmtp.tsx` — add "Send test email" button (calls stub, wired in Plan 2)
- `apps/web/app/setup/steps/StepFeatures.tsx` — update props to use dispatch pattern
- `apps/web/app/setup/steps/StepAdminAccount.tsx` — update props to use dispatch pattern
- `apps/web/app/setup/steps/StepReview.tsx` — rewrite: split panel + deploy log area (stub)

### Deleted Files
- `apps/web/app/setup/ProgressBar.tsx` — replaced by Sidebar

### Test Files
- `packages/config/src/__tests__/read-config.test.ts`
- `apps/web/app/setup/__tests__/types.test.ts`

---

## Task 1: Make `vencore.config.json` optional

**Files:**
- Modify: `packages/config/src/read-config.ts`
- Create: `packages/config/src/__tests__/read-config.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/config/src/__tests__/read-config.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readConfig, _resetConfig } from '../read-config';

describe('readConfig', () => {
  beforeEach(() => _resetConfig());

  it('returns safe defaults when file not found', () => {
    process.env['CONFIG_PATH'] = '/nonexistent/vencore.config.json';
    const config = readConfig();
    expect(config.app.name).toBe('Vencore');
    expect(config.features.crm).toBe(true);
    expect(config.smtp).toBeNull();
    delete process.env['CONFIG_PATH'];
  });

  it('does not throw when file is missing', () => {
    process.env['CONFIG_PATH'] = '/nonexistent/vencore.config.json';
    expect(() => readConfig()).not.toThrow();
    delete process.env['CONFIG_PATH'];
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```
cd Vencore/packages/config && npx vitest run src/__tests__/read-config.test.ts
```

Expected: FAIL — "Cannot read config file"

- [ ] **Step 3: Update `read-config.ts`**

```typescript
// packages/config/src/read-config.ts
import * as fs from 'fs';
import * as path from 'path';
import { configSchema, type VantageConfig } from './config-schema';

let cached: VantageConfig | null = null;

const SAFE_DEFAULTS: VantageConfig = {
  app: { name: 'Vencore', logoUrl: '/logo.png', domain: undefined },
  features: { crm: true, infra: true, alerts: true, analytics: false, files: false },
  smtp: null,
  databases: [],
};

export function readConfig(): VantageConfig {
  if (cached) return cached;

  const configPath =
    process.env['CONFIG_PATH'] ??
    path.resolve(process.cwd(), 'vencore.config.json');

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    console.warn(
      `[Vencore] Config file not found at ${configPath}. Using defaults. Run setup wizard or set CONFIG_PATH.`
    );
    cached = SAFE_DEFAULTS;
    return cached;
  }

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`[Vencore] Invalid vencore.config.json: ${result.error.message}`);
  }

  cached = result.data;
  return cached;
}

export function _resetConfig(): void {
  cached = null;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```
cd Vencore/packages/config && npx vitest run src/__tests__/read-config.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd Vencore && git add packages/config/src/read-config.ts packages/config/src/__tests__/read-config.test.ts
git commit -m "fix(config): make vencore.config.json optional, return safe defaults if missing"
```

---

## Task 2: Create wizard types

**Files:**
- Create: `apps/web/app/setup/types.ts`
- Create: `apps/web/app/setup/__tests__/types.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/web/app/setup/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import { getStepList, getStepStatus, INITIAL_STATE } from '../types';
import type { SetupState } from '../types';

const dockerState: SetupState = { ...INITIAL_STATE, infra: { ...INITIAL_STATE.infra, mode: 'docker-deploy' } };
const ownCredsState: SetupState = { ...INITIAL_STATE, infra: { ...INITIAL_STATE.infra, mode: 'own-creds' } };

describe('getStepList', () => {
  it('docker-deploy: does not include db or redis', () => {
    const list = getStepList(dockerState);
    expect(list).not.toContain('db');
    expect(list).not.toContain('redis');
  });

  it('own-creds: includes db and redis after infra', () => {
    const list = getStepList(ownCredsState);
    const infraIdx = list.indexOf('infra');
    expect(list[infraIdx + 1]).toBe('db');
    expect(list[infraIdx + 2]).toBe('redis');
  });

  it('always ends with review then complete', () => {
    const list = getStepList(dockerState);
    expect(list.at(-1)).toBe('complete');
    expect(list.at(-2)).toBe('review');
  });
});

describe('getStepStatus', () => {
  it('returns current for active step', () => {
    const list = getStepList(dockerState);
    expect(getStepStatus('branding', 'branding', [], list)).toBe('current');
  });

  it('returns done for past step', () => {
    const list = getStepList(dockerState);
    expect(getStepStatus('branding', 'infra', [], list)).toBe('done');
  });

  it('returns locked for future step', () => {
    const list = getStepList(dockerState);
    expect(getStepStatus('domain', 'branding', [], list)).toBe('locked');
  });

  it('returns skipped when step in skipped array', () => {
    const list = getStepList(dockerState);
    expect(getStepStatus('smtp', 'features', ['smtp'], list)).toBe('skipped');
  });
});
```

- [ ] **Step 2: Create `types.ts`**

```typescript
// apps/web/app/setup/types.ts

export type StepId =
  | 'branding'
  | 'infra'
  | 'db'
  | 'redis'
  | 'domain'
  | 'smtp'
  | 'features'
  | 'admin'
  | 'review'
  | 'complete';

export type InfraMode = 'own-creds' | 'docker-deploy';
export type ProxyType = 'caddy' | 'nginx';

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
  infra: {
    mode: InfraMode;
    db: { host: string; port: string; name: string; user: string; password: string; ssl: boolean };
    redis: { host: string; port: string; password: string };
    dataDir: string;
    postgresVersion: string;
    redisVersion: string;
  };
  domain: {
    domain: string;
    sslEnabled: boolean;
    sslEmail: string;
    proxyType: ProxyType;
  };
  smtp: SmtpConfig | null;
  features: { crm: boolean; infra: boolean; alerts: boolean; analytics: boolean; files: boolean };
  admin: { name: string; email: string; password: string };
};

export type WizardAction =
  | { type: 'GO_TO'; step: StepId }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SKIP'; step: StepId }
  | { type: 'SET_BRANDING'; value: SetupState['branding'] }
  | { type: 'SET_INFRA'; value: SetupState['infra'] }
  | { type: 'SET_DOMAIN'; value: SetupState['domain'] }
  | { type: 'SET_SMTP'; value: SmtpConfig | null }
  | { type: 'SET_FEATURES'; value: SetupState['features'] }
  | { type: 'SET_ADMIN'; value: SetupState['admin'] };

export const OPTIONAL_STEPS: StepId[] = ['redis', 'domain', 'smtp'];

export const INITIAL_STATE: SetupState = {
  currentStep: 'branding',
  skipped: [],
  branding: { name: '', logoUrl: '/logo.png', faviconUrl: '', primaryColor: '#0b1330', tagline: '' },
  infra: {
    mode: 'docker-deploy',
    db: { host: 'localhost', port: '5432', name: 'vencore', user: 'vencore', password: '', ssl: false },
    redis: { host: 'localhost', port: '6379', password: '' },
    dataDir: '/opt/vencore/data',
    postgresVersion: '16',
    redisVersion: '7',
  },
  domain: { domain: '', sslEnabled: true, sslEmail: '', proxyType: 'caddy' },
  smtp: null,
  features: { crm: true, infra: true, alerts: true, analytics: false, files: false },
  admin: { name: '', email: '', password: '' },
};

export function getStepList(state: SetupState): StepId[] {
  const steps: StepId[] = ['branding', 'infra'];
  if (state.infra.mode === 'own-creds') {
    steps.push('db', 'redis');
  }
  steps.push('domain', 'smtp', 'features', 'admin', 'review', 'complete');
  return steps;
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

    case 'SET_INFRA': {
      // switching mode → remove db/redis from skipped (they'll be re-evaluated)
      const newSkipped = state.skipped.filter(s => s !== 'db' && s !== 'redis');
      return { ...state, infra: action.value, skipped: newSkipped };
    }

    case 'SET_DOMAIN': return { ...state, domain: action.value };
    case 'SET_SMTP': return { ...state, smtp: action.value };
    case 'SET_FEATURES': return { ...state, features: action.value };
    case 'SET_ADMIN': return { ...state, admin: action.value };

    default: return state;
  }
}
```

- [ ] **Step 3: Run tests — expect PASS**

```
cd Vencore/apps/web && npx vitest run app/setup/__tests__/types.test.ts
```

Note: vitest not yet in web package.json — add it first:
```bash
cd Vencore/apps/web && npm add -D vitest
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd Vencore && git add apps/web/app/setup/types.ts apps/web/app/setup/__tests__/types.test.ts apps/web/package.json
git commit -m "feat(setup): add wizard types, step list logic, reducer"
```

---

## Task 3: Full-screen layout

**Files:**
- Create: `apps/web/app/setup/layout.tsx`
- Modify: `apps/web/app/setup/page.tsx`

- [ ] **Step 1: Create `layout.tsx`**

```tsx
// apps/web/app/setup/layout.tsx
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'IBM Plex Sans, system-ui, sans-serif',
    }}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Strip centering wrapper from `page.tsx`**

Replace the entire `return` block in `apps/web/app/setup/page.tsx`:

```tsx
// apps/web/app/setup/page.tsx
import { redirect } from 'next/navigation';
import { SetupWizard } from './SetupWizard';

export const metadata = { title: 'Setup — Vencore' };

async function getSetupStatus(): Promise<boolean> {
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  try {
    const res = await fetch(`${apiUrl}/api/setup/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    const json = await res.json();
    return json.data?.configured === true;
  } catch {
    return false;
  }
}

interface PageProps {
  searchParams: Promise<{ from?: string }>;
}

export default async function SetupPage({ searchParams }: PageProps) {
  const configured = await getSetupStatus();
  if (configured) {
    const params = await searchParams;
    const from = params.from ?? '/';
    redirect(`/api/setup/activate?from=${encodeURIComponent(from)}`);
  }
  return <SetupWizard />;
}
```

- [ ] **Step 3: Commit**

```bash
cd Vencore && git add apps/web/app/setup/layout.tsx apps/web/app/setup/page.tsx
git commit -m "feat(setup): add full-screen layout, simplify page.tsx"
```

---

## Task 4: Sidebar component

**Files:**
- Create: `apps/web/app/setup/Sidebar.tsx`

- [ ] **Step 1: Create `Sidebar.tsx`**

```tsx
// apps/web/app/setup/Sidebar.tsx
'use client';

import type { StepId, SetupState } from './types';
import { getStepList, getStepStatus, OPTIONAL_STEPS } from './types';

const STEP_LABELS: Record<StepId, string> = {
  branding: 'Branding',
  infra: 'Infrastructure',
  db: 'Database',
  redis: 'Redis',
  domain: 'Domain & SSL',
  smtp: 'SMTP',
  features: 'Features',
  admin: 'Admin Account',
  review: 'Review & Deploy',
  complete: 'Complete',
};

type Props = {
  state: SetupState;
  onGoTo: (step: StepId) => void;
};

export function Sidebar({ state, onGoTo }: Props) {
  const stepList = getStepList(state);

  return (
    <aside style={{
      width: 240,
      flexShrink: 0,
      borderRight: '1px solid var(--border)',
      padding: '24px 0',
      background: 'var(--surface)',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}>
      {stepList.map(stepId => {
        const status = getStepStatus(stepId, state.currentStep, state.skipped, stepList);
        const isOptional = OPTIONAL_STEPS.includes(stepId);
        const isClickable = status === 'done' || status === 'skipped' || status === 'current';

        return (
          <button
            key={stepId}
            onClick={() => isClickable && onGoTo(stepId)}
            disabled={!isClickable}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 20px',
              background: status === 'current' ? 'var(--surface2)' : 'transparent',
              border: 'none',
              borderLeft: status === 'current' ? '2px solid var(--text)' : '2px solid transparent',
              cursor: isClickable ? 'pointer' : 'default',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <StatusIcon status={status} />
            <span style={{
              fontSize: 13,
              fontWeight: status === 'current' ? 600 : 400,
              color: status === 'locked' ? 'var(--text3)' : 'var(--text)',
            }}>
              {STEP_LABELS[stepId]}
              {isOptional && status === 'skipped' && (
                <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 4 }}>skipped</span>
              )}
            </span>
          </button>
        );
      })}
    </aside>
  );
}

function StatusIcon({ status }: { status: 'done' | 'current' | 'locked' | 'skipped' }) {
  const base: React.CSSProperties = {
    width: 18,
    height: 18,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 700,
  };

  if (status === 'done') return (
    <span style={{ ...base, background: 'var(--green)', color: '#fff' }}>✓</span>
  );
  if (status === 'current') return (
    <span style={{ ...base, background: 'var(--text)', color: '#fff' }}>→</span>
  );
  if (status === 'skipped') return (
    <span style={{ ...base, background: 'var(--border)', color: 'var(--text3)' }}>⊘</span>
  );
  return (
    <span style={{ ...base, border: '1.5px solid var(--border)', background: 'transparent' }} />
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd Vencore && git add apps/web/app/setup/Sidebar.tsx
git commit -m "feat(setup): add Sidebar component with step status icons"
```

---

## Task 5: Rewrite `SetupWizard.tsx`

**Files:**
- Modify: `apps/web/app/setup/SetupWizard.tsx`

- [ ] **Step 1: Rewrite `SetupWizard.tsx`**

```tsx
// apps/web/app/setup/SetupWizard.tsx
'use client';

import { useReducer } from 'react';
import { Sidebar } from './Sidebar';
import { wizardReducer, INITIAL_STATE, getStepList, OPTIONAL_STEPS } from './types';
import type { StepId } from './types';
import { StepBranding } from './steps/StepBranding';
import { StepInfrastructure } from './steps/StepInfrastructure';
import { StepDatabase } from './steps/StepDatabase';
import { StepRedis } from './steps/StepRedis';
import { StepDomainSsl } from './steps/StepDomainSsl';
import { StepSmtp } from './steps/StepSmtp';
import { StepFeatures } from './steps/StepFeatures';
import { StepAdminAccount } from './steps/StepAdminAccount';
import { StepReview } from './steps/StepReview';
import { StepComplete } from './steps/StepComplete';

export function SetupWizard() {
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_STATE);
  const stepList = getStepList(state);
  const currentIdx = stepList.indexOf(state.currentStep);
  const isOptional = OPTIONAL_STEPS.includes(state.currentStep);

  const stepContent: Record<StepId, React.ReactNode> = {
    branding: <StepBranding state={state} dispatch={dispatch} />,
    infra:    <StepInfrastructure state={state} dispatch={dispatch} />,
    db:       <StepDatabase state={state} dispatch={dispatch} />,
    redis:    <StepRedis state={state} dispatch={dispatch} />,
    domain:   <StepDomainSsl state={state} dispatch={dispatch} />,
    smtp:     <StepSmtp state={state} dispatch={dispatch} />,
    features: <StepFeatures state={state} dispatch={dispatch} />,
    admin:    <StepAdminAccount state={state} dispatch={dispatch} />,
    review:   <StepReview state={state} dispatch={dispatch} />,
    complete: <StepComplete state={state} />,
  };

  const showFooter = state.currentStep !== 'complete' && state.currentStep !== 'review';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
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
        <span style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
          Vencore Setup
        </span>
        {state.currentStep !== 'complete' && (
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            Step {currentIdx + 1} of {stepList.length - 1}
          </span>
        )}
      </header>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar state={state} onGoTo={step => dispatch({ type: 'GO_TO', step })} />

        <main style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
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
              <button
                id="wizard-continue"
                onClick={() => dispatch({ type: 'NEXT' })}
                style={btnPrimary}
              >
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
cd Vencore && git add apps/web/app/setup/SetupWizard.tsx
git commit -m "feat(setup): rewrite SetupWizard with useReducer and sidebar-nav layout"
```

---

## Task 6: Rewrite `StepBranding.tsx`

**Files:**
- Modify: `apps/web/app/setup/steps/StepBranding.tsx`

- [ ] **Step 1: Rewrite `StepBranding.tsx`**

```tsx
// apps/web/app/setup/steps/StepBranding.tsx
'use client';

import { useState } from 'react';
import type { SetupState, WizardAction } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

export function StepBranding({ state, dispatch }: Props) {
  const { branding } = state;
  const [error, setError] = useState('');

  const set = (partial: Partial<SetupState['branding']>) =>
    dispatch({ type: 'SET_BRANDING', value: { ...branding, ...partial } });

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set({ logoUrl: ev.target?.result as string });
    reader.readAsDataURL(file);
  };

  const handleFaviconFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set({ faviconUrl: ev.target?.result as string });
    reader.readAsDataURL(file);
  };

  // Continue button in the wizard footer calls dispatch NEXT,
  // but we validate here on a hidden trigger via form submit.
  const validate = () => {
    if (!branding.name.trim()) { setError('App name is required.'); return false; }
    setError('');
    return true;
  };

  // Expose validate so wizard footer can call it before advancing.
  // We use a data attribute on the step root for the wizard to find.
  return (
    <div data-step-id="branding" data-validate="true">
      <h2 style={heading}>Branding</h2>
      <p style={subtext}>Customize how your Vencore instance looks.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Field label="App name *">
          <input style={input} value={branding.name} onChange={e => set({ name: e.target.value })} placeholder="Acme CRM" />
        </Field>

        <Field label="Logo" hint="Upload an image or paste a URL">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {branding.logoUrl && (
              <img src={branding.logoUrl} alt="logo preview" style={{ height: 40, borderRadius: 4, border: '1px solid var(--border)' }} />
            )}
            <input type="file" accept="image/*" onChange={handleLogoFile} style={{ fontSize: 13 }} />
          </div>
          <input style={{ ...input, marginTop: 8 }} value={branding.logoUrl.startsWith('data:') ? '' : branding.logoUrl} onChange={e => set({ logoUrl: e.target.value })} placeholder="/logo.png or https://..." />
        </Field>

        <Field label="Favicon" hint="Optional — 32×32 or 64×64 PNG/ICO">
          <input type="file" accept="image/*,.ico" onChange={handleFaviconFile} style={{ fontSize: 13 }} />
        </Field>

        <Field label="Primary brand color">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="color" value={branding.primaryColor} onChange={e => set({ primaryColor: e.target.value })} style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', borderRadius: 4 }} />
            <input style={{ ...input, width: 110 }} value={branding.primaryColor} onChange={e => set({ primaryColor: e.target.value })} placeholder="#0b1330" />
          </div>
        </Field>

        <Field label="Tagline" hint="Optional — shown on login page">
          <input style={input} value={branding.tagline} onChange={e => set({ tagline: e.target.value })} placeholder="One platform to run your business." />
        </Field>
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>}

      {/* Hidden submit to allow Enter key */}
      <button
        style={{ display: 'none' }}
        onClick={() => { if (validate()) dispatch({ type: 'NEXT' }); }}
      />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: hint ? 2 : 6 }}>
        {label}
      </label>
      {hint && <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 6px' }}>{hint}</p>}
      {children}
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'Bricolage Grotesque, sans-serif' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'IBM Plex Sans, sans-serif',
  boxSizing: 'border-box',
};
```

- [ ] **Step 2: Commit**

```bash
cd Vencore && git add apps/web/app/setup/steps/StepBranding.tsx
git commit -m "feat(setup): rewrite StepBranding with logo upload, color picker, tagline"
```

---

## Task 7: `StepInfrastructure.tsx`

**Files:**
- Create: `apps/web/app/setup/steps/StepInfrastructure.tsx`

- [ ] **Step 1: Create `StepInfrastructure.tsx`**

```tsx
// apps/web/app/setup/steps/StepInfrastructure.tsx
'use client';

import type { SetupState, WizardAction, InfraMode } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

const MODES: { id: InfraMode; icon: string; title: string; desc: string }[] = [
  {
    id: 'docker-deploy',
    icon: '🐳',
    title: 'Docker Deploy',
    desc: 'Vencore spins up Postgres and Redis containers for you. Recommended for new installs.',
  },
  {
    id: 'own-creds',
    icon: '🗄',
    title: 'Own Credentials',
    desc: 'I already have Postgres and Redis running. I will provide connection details.',
  },
];

export function StepInfrastructure({ state, dispatch }: Props) {
  const { infra } = state;
  const setMode = (mode: InfraMode) =>
    dispatch({ type: 'SET_INFRA', value: { ...infra, mode } });

  return (
    <div>
      <h2 style={heading}>Infrastructure</h2>
      <p style={subtext}>How do you want to set up the database?</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              padding: '20px 24px',
              border: `2px solid ${infra.mode === m.id ? 'var(--text)' : 'var(--border)'}`,
              borderRadius: 10,
              background: infra.mode === m.id ? 'var(--surface2)' : 'var(--surface)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <span style={{ fontSize: 28, lineHeight: 1 }}>{m.icon}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{m.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{m.desc}</div>
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%', display: 'inline-block',
                border: `2px solid ${infra.mode === m.id ? 'var(--text)' : 'var(--border)'}`,
                background: infra.mode === m.id ? 'var(--text)' : 'transparent',
              }} />
            </div>
          </button>
        ))}
      </div>

      {infra.mode === 'docker-deploy' && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Docker options</h3>
          <Field label="Data directory">
            <input style={input} value={infra.dataDir}
              onChange={e => dispatch({ type: 'SET_INFRA', value: { ...infra, dataDir: e.target.value } })}
              placeholder="/opt/vencore/data" />
          </Field>
          <div style={{ display: 'flex', gap: 16 }}>
            <Field label="Postgres version">
              <select style={input} value={infra.postgresVersion}
                onChange={e => dispatch({ type: 'SET_INFRA', value: { ...infra, postgresVersion: e.target.value } })}>
                {['16', '15', '14'].map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Redis version">
              <select style={input} value={infra.redisVersion}
                onChange={e => dispatch({ type: 'SET_INFRA', value: { ...infra, redisVersion: e.target.value } })}>
                {['7', '6'].map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'Bricolage Grotesque, sans-serif' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const input: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Sans, sans-serif', boxSizing: 'border-box',
};
```

- [ ] **Step 2: Commit**

```bash
cd Vencore && git add apps/web/app/setup/steps/StepInfrastructure.tsx
git commit -m "feat(setup): add StepInfrastructure mode picker (docker-deploy vs own-creds)"
```

---

## Task 8: `StepDatabase.tsx`

**Files:**
- Create: `apps/web/app/setup/steps/StepDatabase.tsx`

- [ ] **Step 1: Create `StepDatabase.tsx`**

```tsx
// apps/web/app/setup/steps/StepDatabase.tsx
'use client';

import { useState } from 'react';
import type { SetupState, WizardAction } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

export function StepDatabase({ state, dispatch }: Props) {
  const { db } = state.infra;
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  const set = (partial: Partial<typeof db>) =>
    dispatch({ type: 'SET_INFRA', value: { ...state.infra, db: { ...db, ...partial } } });

  const testConnection = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const res = await fetch('/api/installer/test-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: db.host, port: parseInt(db.port), name: db.name,
          user: db.user, password: db.password, ssl: db.ssl,
        }),
      });
      const json = await res.json();
      if (json.data?.ok) { setTestStatus('ok'); }
      else { setTestStatus('error'); setTestError(json.error?.message ?? 'Connection failed'); }
    } catch {
      setTestStatus('error');
      setTestError('Network error — is the API running?');
    }
  };

  return (
    <div>
      <h2 style={heading}>Database</h2>
      <p style={subtext}>Enter your Postgres connection details.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Host" style={{ flex: 3 }}>
            <input style={input} value={db.host} onChange={e => set({ host: e.target.value })} placeholder="localhost" />
          </Field>
          <Field label="Port" style={{ flex: 1 }}>
            <input style={input} value={db.port} onChange={e => set({ port: e.target.value })} placeholder="5432" />
          </Field>
        </div>
        <Field label="Database name">
          <input style={input} value={db.name} onChange={e => set({ name: e.target.value })} placeholder="vencore" />
        </Field>
        <Field label="Username">
          <input style={input} value={db.user} onChange={e => set({ user: e.target.value })} placeholder="vencore" />
        </Field>
        <Field label="Password">
          <input style={input} type="password" value={db.password} onChange={e => set({ password: e.target.value })} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={db.ssl} onChange={e => set({ ssl: e.target.checked })} />
          <span style={{ color: 'var(--text)' }}>Use SSL</span>
        </label>
      </div>

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={testConnection} disabled={testStatus === 'testing'} style={btnTest}>
          {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
        </button>
        {testStatus === 'ok' && <span style={{ fontSize: 13, color: 'var(--green)' }}>✓ Connected</span>}
        {testStatus === 'error' && <span style={{ fontSize: 13, color: 'var(--red)' }}>✗ {testError}</span>}
      </div>
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'Bricolage Grotesque, sans-serif' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const input: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Sans, sans-serif', boxSizing: 'border-box' };
const btnTest: React.CSSProperties = { padding: '8px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif', color: 'var(--text)' };
```

- [ ] **Step 2: Commit**

```bash
cd Vencore && git add apps/web/app/setup/steps/StepDatabase.tsx
git commit -m "feat(setup): add StepDatabase with test-connection button"
```

---

## Task 9: `StepRedis.tsx`

**Files:**
- Create: `apps/web/app/setup/steps/StepRedis.tsx`

- [ ] **Step 1: Create `StepRedis.tsx`**

```tsx
// apps/web/app/setup/steps/StepRedis.tsx
'use client';

import type { SetupState, WizardAction } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

export function StepRedis({ state, dispatch }: Props) {
  const { redis } = state.infra;

  const set = (partial: Partial<typeof redis>) =>
    dispatch({ type: 'SET_INFRA', value: { ...state.infra, redis: { ...redis, ...partial } } });

  return (
    <div>
      <h2 style={heading}>Redis <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 400 }}>optional</span></h2>
      <p style={subtext}>Redis is used for sessions and job queues. Skip if you don't have one — some features will be unavailable.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 3 }}>
            <label style={label}>Host</label>
            <input style={input} value={redis.host} onChange={e => set({ host: e.target.value })} placeholder="localhost" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Port</label>
            <input style={input} value={redis.port} onChange={e => set({ port: e.target.value })} placeholder="6379" />
          </div>
        </div>
        <div>
          <label style={label}>Password</label>
          <input style={input} type="password" value={redis.password} onChange={e => set({ password: e.target.value })} placeholder="Leave blank if none" />
        </div>
      </div>
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'Bricolage Grotesque, sans-serif' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 };
const input: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Sans, sans-serif', boxSizing: 'border-box' };
```

- [ ] **Step 2: Commit**

```bash
cd Vencore && git add apps/web/app/setup/steps/StepRedis.tsx
git commit -m "feat(setup): add StepRedis (optional own-creds sub-step)"
```

---

## Task 10: `StepDomainSsl.tsx`

**Files:**
- Create: `apps/web/app/setup/steps/StepDomainSsl.tsx`

- [ ] **Step 1: Create `StepDomainSsl.tsx`**

```tsx
// apps/web/app/setup/steps/StepDomainSsl.tsx
'use client';

import { useState, useEffect } from 'react';
import type { SetupState, WizardAction } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

export function StepDomainSsl({ state, dispatch }: Props) {
  const { domain } = state;
  const [serverIp, setServerIp] = useState('');

  useEffect(() => {
    fetch('/api/installer/server-ip')
      .then(r => r.json())
      .then(j => setServerIp(j.data?.ip ?? ''))
      .catch(() => {});
  }, []);

  const set = (partial: Partial<typeof domain>) =>
    dispatch({ type: 'SET_DOMAIN', value: { ...domain, ...partial } });

  return (
    <div>
      <h2 style={heading}>Domain & SSL <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 400 }}>optional</span></h2>
      <p style={subtext}>Configure a custom domain and automatic SSL. Skip to use the server IP directly.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Domain */}
        <section>
          <div style={sectionHeading}>Domain</div>
          <label style={label}>Custom domain</label>
          <input style={input} value={domain.domain} onChange={e => set({ domain: e.target.value })} placeholder="app.acme.com" />
          {serverIp && domain.domain && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 6, fontSize: 13, color: 'var(--text2)' }}>
              Add a DNS A record: <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>{domain.domain}</code> → <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>{serverIp}</code>
            </div>
          )}
        </section>

        {/* SSL */}
        <section>
          <div style={sectionHeading}>SSL</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={domain.sslEnabled} disabled={!domain.domain} onChange={e => set({ sslEnabled: e.target.checked })} />
            <span style={{ fontSize: 13, color: domain.domain ? 'var(--text)' : 'var(--text3)' }}>
              Auto SSL via Let's Encrypt {!domain.domain && '(requires domain)'}
            </span>
          </label>
          {domain.sslEnabled && domain.domain && (
            <div style={{ marginTop: 12 }}>
              <label style={label}>Email for cert renewal notices</label>
              <input style={input} type="email" value={domain.sslEmail} onChange={e => set({ sslEmail: e.target.value })} placeholder="admin@acme.com" />
            </div>
          )}
          {!domain.domain && (
            <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 8 }}>
              ⚠ No domain set — app will be accessible at http://{serverIp || 'SERVER_IP'}:3000
            </p>
          )}
        </section>

        {/* Proxy */}
        <section>
          <div style={sectionHeading}>Reverse proxy</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['caddy', 'nginx'] as const).map(pt => (
              <button key={pt} onClick={() => set({ proxyType: pt })} style={{
                padding: '8px 16px', borderRadius: 6, border: `1.5px solid ${domain.proxyType === pt ? 'var(--text)' : 'var(--border)'}`,
                background: domain.proxyType === pt ? 'var(--surface2)' : 'var(--surface)', cursor: 'pointer',
                fontSize: 13, fontWeight: domain.proxyType === pt ? 600 : 400, color: 'var(--text)', fontFamily: 'IBM Plex Sans, sans-serif',
              }}>
                {pt === 'caddy' ? 'Caddy (recommended)' : 'Nginx'}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
            {domain.proxyType === 'caddy' ? 'Caddy handles SSL automatically. Caddyfile written to /opt/vencore/Caddyfile.' : 'nginx.conf written to /opt/vencore/nginx.conf. You manage SSL via certbot or similar.'}
          </p>
        </section>
      </div>
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'Bricolage Grotesque, sans-serif' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const sectionHeading: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' };
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 };
const input: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Sans, sans-serif', boxSizing: 'border-box' };
```

- [ ] **Step 2: Commit**

```bash
cd Vencore && git add apps/web/app/setup/steps/StepDomainSsl.tsx
git commit -m "feat(setup): add StepDomainSsl with domain, SSL toggle, proxy picker"
```

---

## Task 11: Update `StepSmtp.tsx`

**Files:**
- Modify: `apps/web/app/setup/steps/StepSmtp.tsx`

- [ ] **Step 1: Read current file**

Read `apps/web/app/setup/steps/StepSmtp.tsx` to understand current shape.

- [ ] **Step 2: Rewrite to new dispatch pattern + add test button stub**

```tsx
// apps/web/app/setup/steps/StepSmtp.tsx
'use client';

import { useState } from 'react';
import type { SetupState, WizardAction, SmtpConfig } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

const EMPTY: SmtpConfig = { host: '', port: 587, secure: false, user: '', password: '', from: '' };

export function StepSmtp({ state, dispatch }: Props) {
  const smtp = state.smtp ?? EMPTY;
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  const set = (partial: Partial<SmtpConfig>) =>
    dispatch({ type: 'SET_SMTP', value: { ...smtp, ...partial } });

  const sendTest = async () => {
    if (!state.admin.email && !smtp.from) return;
    setTestStatus('sending');
    setTestError('');
    try {
      const res = await fetch('/api/installer/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtp, to: state.admin.email || smtp.from }),
      });
      const json = await res.json();
      if (json.data?.ok) { setTestStatus('ok'); }
      else { setTestStatus('error'); setTestError(json.error?.message ?? 'Send failed'); }
    } catch {
      setTestStatus('error');
      setTestError('Network error — is the API running?');
    }
  };

  return (
    <div>
      <h2 style={heading}>SMTP <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 400 }}>optional</span></h2>
      <p style={subtext}>Configure outbound email (invites, alerts, password reset). Skip to set up later.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Host" style={{ flex: 3 }}>
            <input style={input} value={smtp.host} onChange={e => set({ host: e.target.value })} placeholder="smtp.example.com" />
          </Field>
          <Field label="Port" style={{ flex: 1 }}>
            <input style={input} type="number" value={smtp.port} onChange={e => set({ port: parseInt(e.target.value) || 587 })} />
          </Field>
        </div>
        <Field label="Username">
          <input style={input} value={smtp.user} onChange={e => set({ user: e.target.value })} />
        </Field>
        <Field label="Password">
          <input style={input} type="password" value={smtp.password} onChange={e => set({ password: e.target.value })} />
        </Field>
        <Field label="From address">
          <input style={input} type="email" value={smtp.from} onChange={e => set({ from: e.target.value })} placeholder="noreply@acme.com" />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={smtp.secure} onChange={e => set({ secure: e.target.checked })} />
          <span style={{ color: 'var(--text)' }}>Use TLS/SSL</span>
        </label>
      </div>

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={sendTest} disabled={testStatus === 'sending' || !smtp.host} style={btnTest}>
          {testStatus === 'sending' ? 'Sending…' : 'Send test email'}
        </button>
        {testStatus === 'ok' && <span style={{ fontSize: 13, color: 'var(--green)' }}>✓ Email sent</span>}
        {testStatus === 'error' && <span style={{ fontSize: 13, color: 'var(--red)' }}>✗ {testError}</span>}
      </div>
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={style}><label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>{label}</label>{children}</div>;
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'Bricolage Grotesque, sans-serif' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const input: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Sans, sans-serif', boxSizing: 'border-box' };
const btnTest: React.CSSProperties = { padding: '8px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif', color: 'var(--text)' };
```

- [ ] **Step 3: Commit**

```bash
cd Vencore && git add apps/web/app/setup/steps/StepSmtp.tsx
git commit -m "feat(setup): update StepSmtp to dispatch pattern, add test-email button"
```

---

## Task 12: Update `StepFeatures.tsx` + `StepAdminAccount.tsx`

**Files:**
- Modify: `apps/web/app/setup/steps/StepFeatures.tsx`
- Modify: `apps/web/app/setup/steps/StepAdminAccount.tsx`

- [ ] **Step 1: Update `StepFeatures.tsx`**

Replace the Props type and function signature. The step content stays the same:

```tsx
// apps/web/app/setup/steps/StepFeatures.tsx
'use client';

import type { SetupState, WizardAction } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };
type Features = SetupState['features'];

const FEATURE_LABELS: { key: keyof Features; label: string; desc: string }[] = [
  { key: 'crm',       label: 'CRM',            desc: 'Contacts, companies, deals, tasks, activity' },
  { key: 'infra',     label: 'Infrastructure', desc: 'Server monitoring, databases, websites' },
  { key: 'alerts',    label: 'Alerts',         desc: 'Threshold alerts and notifications' },
  { key: 'analytics', label: 'Analytics',      desc: 'Revenue charts, pipeline stats, rep leaderboard' },
  { key: 'files',     label: 'Files',          desc: 'File storage and management' },
];

export function StepFeatures({ state, dispatch }: Props) {
  const { features } = state;

  const toggle = (key: keyof Features) =>
    dispatch({ type: 'SET_FEATURES', value: { ...features, [key]: !features[key] } });

  return (
    <div>
      <h2 style={heading}>Features</h2>
      <p style={subtext}>Enable the modules you need. You can change these after setup.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FEATURE_LABELS.map(({ key, label, desc }) => (
          <label key={key} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
            background: features[key] ? 'var(--surface2)' : 'var(--surface)',
          }}>
            <input type="checkbox" checked={features[key]} onChange={() => toggle(key)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'Bricolage Grotesque, sans-serif' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
```

- [ ] **Step 2: Update `StepAdminAccount.tsx`**

```tsx
// apps/web/app/setup/steps/StepAdminAccount.tsx
'use client';

import { useState } from 'react';
import type { SetupState, WizardAction } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

export function StepAdminAccount({ state, dispatch }: Props) {
  const { admin } = state;
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const set = (partial: Partial<typeof admin>) =>
    dispatch({ type: 'SET_ADMIN', value: { ...admin, ...partial } });

  return (
    <div>
      <h2 style={heading}>Admin Account</h2>
      <p style={subtext}>Create the first administrator account for your Vencore instance.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Full name *">
          <input style={input} value={admin.name} onChange={e => set({ name: e.target.value })} placeholder="Jane Smith" />
        </Field>
        <Field label="Email *">
          <input style={input} type="email" value={admin.email} onChange={e => set({ email: e.target.value })} placeholder="admin@yourcompany.com" />
        </Field>
        <Field label="Password * (min 8 characters)">
          <input style={input} type="password" value={admin.password} onChange={e => set({ password: e.target.value })} />
        </Field>
        <Field label="Confirm password *">
          <input style={input} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />
        </Field>
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>{label}</label>{children}</div>;
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'Bricolage Grotesque, sans-serif' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const input: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Sans, sans-serif', boxSizing: 'border-box' };
```

- [ ] **Step 3: Commit**

```bash
cd Vencore && git add apps/web/app/setup/steps/StepFeatures.tsx apps/web/app/setup/steps/StepAdminAccount.tsx
git commit -m "feat(setup): update StepFeatures and StepAdminAccount to dispatch pattern"
```

---

## Task 13: Rewrite `StepReview.tsx` (split panel, stub deploy)

**Files:**
- Modify: `apps/web/app/setup/steps/StepReview.tsx`

- [ ] **Step 1: Rewrite `StepReview.tsx`**

```tsx
// apps/web/app/setup/steps/StepReview.tsx
'use client';

import { useState } from 'react';
import type { SetupState, WizardAction, StepId } from '../types';
import { getStepList, OPTIONAL_STEPS } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

export type DeployStatus = 'idle' | 'deploying' | 'done' | 'error';

const STEP_LABELS: Partial<Record<StepId, string>> = {
  branding: 'Branding',
  infra: 'Infrastructure',
  db: 'Database',
  redis: 'Redis',
  domain: 'Domain & SSL',
  smtp: 'SMTP',
  features: 'Features',
  admin: 'Admin Account',
};

const SKIP_WARNINGS: Partial<Record<StepId, string>> = {
  redis: 'Sessions/queues may degrade without Redis.',
  domain: 'App accessible via IP only, no SSL.',
  smtp: 'Email features (invites, alerts, password reset) will not work.',
};

export function StepReview({ state, dispatch }: Props) {
  const [deployStatus, setDeployStatus] = useState<DeployStatus>('idle');
  const [logLines, setLogLines] = useState<string[]>([]);
  const [deployError, setDeployError] = useState('');

  const stepList = getStepList(state);
  const reviewSteps = stepList.filter(s => s !== 'review' && s !== 'complete');

  const deploy = async () => {
    setDeployStatus('deploying');
    setLogLines([]);
    setDeployError('');

    try {
      const res = await fetch('/api/installer/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      const json = await res.json();
      if (!json.data?.jobId) throw new Error(json.error?.message ?? 'Deploy failed to start');

      const { jobId } = json.data;
      const es = new EventSource(`/api/installer/deploy/${jobId}/stream`);

      es.onmessage = e => {
        const msg = JSON.parse(e.data) as { type: string; line?: string };
        if (msg.type === 'log') setLogLines(prev => [...prev, msg.line ?? '']);
        if (msg.type === 'done') {
          es.close();
          setDeployStatus('done');
          dispatch({ type: 'NEXT' });
        }
        if (msg.type === 'error') {
          es.close();
          setDeployStatus('error');
          setDeployError(msg.line ?? 'Deploy failed');
        }
      };

      es.onerror = () => {
        es.close();
        setDeployStatus('error');
        setDeployError('Lost connection to deploy stream. Check API logs.');
      };
    } catch (err) {
      setDeployStatus('error');
      setDeployError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <div style={{ display: 'flex', gap: 32, height: '100%' }}>
      {/* Left: summary */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={heading}>Review & Deploy</h2>
        <p style={subtext}>Confirm your configuration before deploying.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reviewSteps.map(stepId => {
            const isSkipped = state.skipped.includes(stepId);
            const warning = isSkipped ? SKIP_WARNINGS[stepId] : undefined;
            return (
              <div key={stepId} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 14px', borderRadius: 8,
                background: isSkipped ? 'var(--amber-bg)' : 'var(--surface2)',
                border: `1px solid ${isSkipped ? 'var(--amber)' : 'var(--border)'}`,
              }}>
                <span style={{ fontSize: 13, color: isSkipped ? 'var(--amber)' : 'var(--green)', fontWeight: 700, marginTop: 1 }}>
                  {isSkipped ? '⊘' : '✓'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                    {STEP_LABELS[stepId]}
                    {isSkipped && <span style={{ color: 'var(--text3)', fontWeight: 400 }}> — skipped</span>}
                  </div>
                  {warning && <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 2 }}>⚠ {warning}</div>}
                  {!isSkipped && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{summarize(state, stepId)}</div>}
                </div>
                <button onClick={() => dispatch({ type: 'GO_TO', step: stepId })} style={editBtn}>Edit</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: deploy log */}
      <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Deploy Log</div>
        <div style={{
          flex: 1, minHeight: 200, maxHeight: 400,
          background: '#0b1330', borderRadius: 8,
          padding: '14px 16px', overflowY: 'auto',
          fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#a8b4cc',
          lineHeight: 1.6,
        }}>
          {logLines.length === 0 && deployStatus === 'idle' && (
            <span style={{ color: '#4a5677' }}>Ready to deploy…</span>
          )}
          {logLines.map((line, i) => <div key={i}>{line}</div>)}
          {deployStatus === 'error' && (
            <div style={{ color: '#f87171', marginTop: 8 }}>✗ {deployError}</div>
          )}
        </div>

        <button
          onClick={deployStatus === 'error' ? deploy : deployStatus === 'idle' ? deploy : undefined}
          disabled={deployStatus === 'deploying' || deployStatus === 'done'}
          style={{
            marginTop: 16, padding: '12px', width: '100%',
            background: deployStatus === 'error' ? 'var(--red)' : 'var(--text)',
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 15, fontWeight: 600, cursor: deployStatus === 'deploying' ? 'wait' : 'pointer',
            fontFamily: 'Bricolage Grotesque, sans-serif',
          }}
        >
          {deployStatus === 'idle' && '🚀 Deploy Vencore'}
          {deployStatus === 'deploying' && '⟳ Deploying…'}
          {deployStatus === 'done' && '✓ Done'}
          {deployStatus === 'error' && '↺ Retry'}
        </button>
      </div>
    </div>
  );
}

function summarize(state: SetupState, stepId: StepId): string {
  switch (stepId) {
    case 'branding': return state.branding.name || '—';
    case 'infra': return state.infra.mode === 'docker-deploy' ? 'Docker Deploy' : 'Own Credentials';
    case 'db': return `${state.infra.db.host}:${state.infra.db.port}/${state.infra.db.name}`;
    case 'redis': return `${state.infra.redis.host}:${state.infra.redis.port}`;
    case 'domain': return state.domain.domain || 'No domain';
    case 'smtp': return state.smtp?.host ?? '—';
    case 'features': return Object.entries(state.features).filter(([, v]) => v).map(([k]) => k).join(', ');
    case 'admin': return state.admin.email || '—';
    default: return '';
  }
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'Bricolage Grotesque, sans-serif' };
const subtext: React.CSSProperties = { margin: '0 0 20px', color: 'var(--text2)', fontSize: 14 };
const editBtn: React.CSSProperties = { padding: '3px 10px', fontSize: 12, background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text2)', fontFamily: 'IBM Plex Sans, sans-serif' };
```

- [ ] **Step 2: Commit**

```bash
cd Vencore && git add apps/web/app/setup/steps/StepReview.tsx
git commit -m "feat(setup): rewrite StepReview with summary panel and SSE deploy log"
```

---

## Task 14: Create `StepComplete.tsx`

**Files:**
- Create: `apps/web/app/setup/steps/StepComplete.tsx`

- [ ] **Step 1: Create `StepComplete.tsx`**

```tsx
// apps/web/app/setup/steps/StepComplete.tsx
'use client';

import { useState, useEffect } from 'react';
import type { SetupState } from '../types';

type Props = { state: SetupState };

type CheckItem = {
  id: string;
  label: string;
  status: 'pending' | 'ok' | 'skip';
  action?: { label: string; onClick: () => void };
};

export function StepComplete({ state }: Props) {
  const { domain, smtp, branding } = state;
  const appUrl = domain.domain
    ? `http${domain.sslEnabled ? 's' : ''}://${domain.domain}`
    : `http://localhost:3000`;

  const [dnsOk, setDnsOk] = useState(false);
  const [sslOk, setSslOk] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [removeCopied, setRemoveCopied] = useState(false);

  useEffect(() => {
    if (!domain.domain) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch('/api/installer/check-domain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: domain.domain, ssl: domain.sslEnabled }),
        });
        const json = await res.json();
        if (json.data?.dns) setDnsOk(true);
        if (json.data?.ssl) setSslOk(true);
        if (json.data?.dns && (!domain.sslEnabled || json.data?.ssl)) clearInterval(poll);
      } catch { /* network not ready yet */ }
    }, 5000);
    return () => clearInterval(poll);
  }, [domain.domain, domain.sslEnabled]);

  const checks: CheckItem[] = [
    ...(domain.domain ? [
      { id: 'dns', label: 'DNS A record set', status: dnsOk ? 'ok' as const : 'pending' as const },
      ...(domain.sslEnabled ? [{ id: 'ssl', label: 'SSL certificate issued', status: sslOk ? 'ok' as const : 'pending' as const }] : []),
    ] : []),
    ...(smtp ? [{
      id: 'smtp', label: 'Send a test email', status: 'pending' as const,
      action: { label: 'Send test →', onClick: () => {} },
    }] : []),
    {
      id: 'invite', label: 'Invite your team', status: 'pending' as const,
      action: {
        label: inviteCopied ? 'Copied!' : 'Copy invite link',
        onClick: () => { navigator.clipboard.writeText(`${appUrl}/invite`); setInviteCopied(true); },
      },
    },
    {
      id: 'remove', label: 'Remove installer container', status: 'pending' as const,
      action: {
        label: removeCopied ? 'Copied!' : 'Copy command',
        onClick: () => { navigator.clipboard.writeText('docker rm -f vencore-installer'); setRemoveCopied(true); },
      },
    },
  ];

  return (
    <div style={{ textAlign: 'center', paddingTop: 40 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
      <h1 style={{ fontFamily: 'Bricolage Grotesque, sans-serif', fontSize: 28, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>
        {branding.name || 'Vencore'} is running
      </h1>
      {domain.domain && (
        <p style={{ fontSize: 15, color: 'var(--text2)', margin: '0 0 40px' }}>{appUrl}</p>
      )}

      <div style={{ textAlign: 'left', maxWidth: 440, margin: '0 auto 40px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Next steps
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {checks.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)',
            }}>
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>
                {c.status === 'ok' ? '✓' : c.status === 'skip' ? '—' : '○'}
              </span>
              <span style={{ flex: 1, fontSize: 14, color: c.status === 'ok' ? 'var(--text3)' : 'var(--text)' }}>
                {c.label}
                {c.status === 'pending' && !c.action && (
                  <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 6 }}>checking…</span>
                )}
              </span>
              {c.action && (
                <button onClick={c.action.onClick} style={{
                  padding: '5px 12px', fontSize: 12, fontWeight: 500,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 4, cursor: 'pointer', color: 'var(--text)', fontFamily: 'IBM Plex Sans, sans-serif',
                }}>
                  {c.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <a href={appUrl} target="_blank" rel="noreferrer" style={{
        display: 'inline-block', padding: '12px 32px',
        background: 'var(--text)', color: '#fff', borderRadius: 8,
        fontSize: 15, fontWeight: 600, textDecoration: 'none',
        fontFamily: 'Bricolage Grotesque, sans-serif',
      }}>
        Open {branding.name || 'Vencore'} →
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd Vencore && git add apps/web/app/setup/steps/StepComplete.tsx
git commit -m "feat(setup): add StepComplete post-setup checklist with DNS/SSL polling"
```

---

## Task 15: `middleware.ts` — INSTALLER_MODE redirect

**Files:**
- Create: `apps/web/middleware.ts`

- [ ] **Step 1: Create `middleware.ts`**

```typescript
// apps/web/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (process.env['INSTALLER_MODE'] !== 'true') return NextResponse.next();

  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/setup') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/logo') ||
    pathname === '/'
  ) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/setup', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: Commit**

```bash
cd Vencore && git add apps/web/middleware.ts
git commit -m "feat(setup): add INSTALLER_MODE middleware to redirect non-setup routes"
```

---

## Task 16: Delete `ProgressBar.tsx`, type-check

**Files:**
- Delete: `apps/web/app/setup/ProgressBar.tsx`

- [ ] **Step 1: Delete ProgressBar**

```bash
cd Vencore && rm apps/web/app/setup/ProgressBar.tsx
```

- [ ] **Step 2: Run type-check**

```bash
cd Vencore/apps/web && npx tsc --noEmit
```

Expected: 0 errors. Fix any import errors found.

- [ ] **Step 3: Commit**

```bash
cd Vencore && git add -A apps/web/app/setup/
git commit -m "chore(setup): remove ProgressBar.tsx, replaced by Sidebar"
```

---

## Task 17: Final type-check and run

- [ ] **Step 1: Full type-check**

```bash
cd Vencore/apps/web && npx tsc --noEmit
cd Vencore/packages/config && npx tsc --noEmit
```

Both: 0 errors.

- [ ] **Step 2: Run vitest**

```bash
cd Vencore/packages/config && npx vitest run
cd Vencore/apps/web && npx vitest run
```

All tests pass.

- [ ] **Step 3: Start dev server, verify wizard loads**

```bash
cd Vencore/apps/web && npm run dev
```

Open `http://localhost:3000/setup` — should see full-screen sidebar-nav wizard with Branding as first step.

- [ ] **Step 4: Final commit**

```bash
cd Vencore && git add -A
git commit -m "feat(setup): white-label setup wizard UI complete (Plan 1)"
```
