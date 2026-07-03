'use client';

import { useEffect, useRef, useState } from 'react';
import type { SetupState, WizardAction, StepId } from '../types';
import { getStepList } from '../types';
import { Button } from '@/modules/shared/components/ui/Button';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

type Status = 'idle' | 'deploying' | 'finishing' | 'error';

const FINISHING_MESSAGES = ['Setting up your workspace…', 'Almost ready…'];
const MIN_FINISHING_MS = 1600;

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
  const [messageIdx, setMessageIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stepList = getStepList(state);
  const reviewSteps = stepList.filter(s => s !== 'review');

  useEffect(() => {
    if (status !== 'finishing') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setMessageIdx(i => (i + 1) % FINISHING_MESSAGES.length);
    }, 1200);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [status]);

  const complete = async () => {
    setStatus('deploying');
    setError('');
    const startedAt = Date.now();
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

      setStatus('finishing');
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(MIN_FINISHING_MS - elapsed, 400);
      setTimeout(() => {
        window.location.href = '/api/setup/activate?from=/login';
      }, wait);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  if (status === 'finishing') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', minHeight: 360, textAlign: 'center',
      }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              width: 10, height: 10, borderRadius: '50%', background: 'var(--text)',
              animation: `pulseDot 1.2s ease-in-out ${i * 0.15}s infinite`,
            }} />
          ))}
        </div>
        <p key={messageIdx} className="fade-in" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
          {FINISHING_MESSAGES[messageIdx]}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={heading}>Review & Complete</h2>
      <p style={subtext}>Confirm your configuration before completing setup.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 32 }}>
        {reviewSteps.map(stepId => {
          const isSkipped = state.skipped.includes(stepId);
          const warning = isSkipped ? SKIP_WARNINGS[stepId] : undefined;
          return (
            <div key={stepId} style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: '14px 16px', borderRadius: 10,
              background: isSkipped ? 'color-mix(in srgb, var(--text3) 8%, transparent)' : 'var(--surface)',
              border: `1px solid ${isSkipped ? 'var(--text3)' : 'var(--border)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isSkipped ? 'var(--border)' : 'var(--green)', color: isSkipped ? 'var(--text3)' : '#fff',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>
                  {isSkipped ? '⊘' : '✓'}
                </span>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  {STEP_LABELS[stepId]}
                  {isSkipped && <span style={{ color: 'var(--text3)', fontWeight: 400 }}> — skipped</span>}
                </div>
                <Button
                  variant="ghost"
                  style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 12 }}
                  onClick={() => dispatch({ type: 'GO_TO', step: stepId })}
                >
                  Edit
                </Button>
              </div>
              {warning && <div style={{ fontSize: 12, color: 'var(--text3)' }}>⚠ {warning}</div>}
              {!isSkipped && <SummaryDetails state={state} stepId={stepId} />}
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

      <Button
        variant={status === 'error' ? 'danger' : 'primary'}
        disabled={status === 'deploying'}
        onClick={status !== 'deploying' ? complete : undefined}
        style={{ padding: '12px 24px', fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-display)' }}
      >
        {status === 'idle' && 'Complete Setup →'}
        {status === 'deploying' && 'Creating workspace…'}
        {status === 'error' && '↺ Retry'}
      </Button>
    </div>
  );
}

function SummaryDetails({ state, stepId }: { state: SetupState; stepId: StepId }) {
  switch (stepId) {
    case 'branding':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: state.branding.primaryColor, flexShrink: 0, border: '1px solid var(--border)' }} />
          {state.branding.name || '—'}
        </div>
      );
    case 'smtp':
      return <div style={{ fontSize: 12, color: 'var(--text2)' }}>{state.smtp?.host ?? '—'}</div>;
    case 'features': {
      const enabled = Object.entries(state.features).filter(([, v]) => v).map(([k]) => k);
      return (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {enabled.map(k => (
            <span key={k} style={{
              fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999,
              background: 'var(--surface2)', color: 'var(--text2)', textTransform: 'capitalize',
            }}>
              {k}
            </span>
          ))}
        </div>
      );
    }
    case 'admin':
      return <div style={{ fontSize: 12, color: 'var(--text2)' }}>{state.admin.email || '—'}</div>;
    default:
      return null;
  }
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' };
const subtext: React.CSSProperties = { margin: '0 0 20px', color: 'var(--text2)', fontSize: 14 };
