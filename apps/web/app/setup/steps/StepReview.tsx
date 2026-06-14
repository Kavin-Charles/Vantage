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
          onClick={deployStatus === 'error' || deployStatus === 'idle' ? deploy : undefined}
          disabled={deployStatus === 'deploying' || deployStatus === 'done'}
          style={{
            marginTop: 16, padding: '12px', width: '100%',
            background: deployStatus === 'error' ? 'var(--red)' : 'var(--text)',
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 15, fontWeight: 600, cursor: deployStatus === 'deploying' ? 'wait' : 'pointer',
            fontFamily: 'var(--font-display)',
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

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' };
const subtext: React.CSSProperties = { margin: '0 0 20px', color: 'var(--text2)', fontSize: 14 };
const editBtn: React.CSSProperties = { padding: '3px 10px', fontSize: 12, background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text2)', fontFamily: 'IBM Plex Sans, sans-serif' };
