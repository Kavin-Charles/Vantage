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
