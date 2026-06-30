'use client';

import { useState } from 'react';
import type { StepId, SetupState } from './types';
import { getStepList, getStepStatus, OPTIONAL_STEPS } from './types';

const STEP_LABELS: Record<StepId, string> = {
  branding: 'Branding',
  smtp: 'SMTP',
  features: 'Features',
  admin: 'Admin Account',
  review: 'Review & Complete',
};

type Props = {
  state: SetupState;
  onGoTo: (step: StepId) => void;
};

export function Sidebar({ state, onGoTo }: Props) {
  const stepList = getStepList(state);

  return (
    <aside className="setup-sidebar" style={{
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
          <SidebarRow
            key={stepId}
            stepId={stepId}
            status={status}
            isOptional={isOptional}
            isClickable={isClickable}
            onGoTo={onGoTo}
          />
        );
      })}
    </aside>
  );
}

type RowStatus = 'done' | 'current' | 'locked' | 'skipped';

function SidebarRow({
  stepId, status, isOptional, isClickable, onGoTo,
}: {
  stepId: StepId;
  status: RowStatus;
  isOptional: boolean;
  isClickable: boolean;
  onGoTo: (step: StepId) => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <button
      onClick={() => isClickable && onGoTo(stepId)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={!isClickable}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 20px',
        background: status === 'current' ? 'var(--surface2)' : (hover && isClickable ? 'var(--surface2)' : 'transparent'),
        border: 'none',
        borderLeft: status === 'current' ? '2px solid var(--text)' : '2px solid transparent',
        cursor: isClickable ? 'pointer' : 'default',
        textAlign: 'left',
        width: '100%',
        transition: 'background var(--motion-fast) var(--motion-ease)',
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
}

function StatusIcon({ status }: { status: RowStatus }) {
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
    transition: 'background var(--motion-fast) var(--motion-ease)',
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
