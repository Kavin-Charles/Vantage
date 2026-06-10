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
