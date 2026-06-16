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
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
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
                onClick={handleContinue}
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
