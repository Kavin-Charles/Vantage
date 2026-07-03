// apps/web/app/setup/SetupWizard.tsx
'use client';

import { useReducer, useRef, useState } from 'react';
import { Sidebar } from './Sidebar';
import { wizardReducer, INITIAL_STATE, getStepList, OPTIONAL_STEPS } from './types';
import type { StepId } from './types';
import { StepBranding } from './steps/StepBranding';
import { StepSmtp } from './steps/StepSmtp';
import { StepFeatures } from './steps/StepFeatures';
import { StepAdminAccount } from './steps/StepAdminAccount';
import { StepReview } from './steps/StepReview';
import { Button } from '@/modules/shared/components/ui/Button';
import { ToastProvider } from '@/modules/shared/components/ui/Toast';

export function SetupWizard() {
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_STATE);
  const stepValidateRef = useRef<() => boolean>(() => true);
  const [isStepValid, setIsStepValid] = useState(true);
  const stepList = getStepList(state);
  const currentIdx = stepList.indexOf(state.currentStep);
  const isOptional = OPTIONAL_STEPS.includes(state.currentStep);
  const progressPct = ((currentIdx + 1) / stepList.length) * 100;

  const handleContinue = () => {
    if (stepValidateRef.current()) {
      dispatch({ type: 'NEXT' });
    }
  };

  const stepContent: Record<StepId, React.ReactNode> = {
    branding: <StepBranding state={state} dispatch={dispatch} validateRef={stepValidateRef} onValidChange={setIsStepValid} />,
    smtp:     <StepSmtp state={state} dispatch={dispatch} />,
    features: <StepFeatures state={state} dispatch={dispatch} />,
    admin:    <StepAdminAccount state={state} dispatch={dispatch} validateRef={stepValidateRef} onValidChange={setIsStepValid} />,
    review:   <StepReview state={state} dispatch={dispatch} />,
  };

  const showFooter = state.currentStep !== 'review';

  return (
    <ToastProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Header */}
        <header style={{
          height: 56,
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 28px',
          flexShrink: 0,
          gap: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
              Vencore Setup
            </span>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>
              Step {currentIdx + 1} of {stepList.length}
            </span>
          </div>
          <div style={{ height: 3, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progressPct}%`, background: 'var(--text)',
              borderRadius: 999, transition: 'width var(--motion-fast) var(--motion-ease)',
            }} />
          </div>
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
            <div key={state.currentStep} className="fade-in setup-main-content" style={{ flex: 1, padding: '48px 56px', maxWidth: 760, width: '100%', margin: '0 auto' }}>
              {stepContent[state.currentStep]}
            </div>

            {showFooter && (
              <footer className="setup-footer-inner" style={{
                borderTop: '1px solid var(--border)',
                padding: '16px 56px',
                display: 'flex',
                justifyContent: 'space-between',
                background: 'var(--surface)',
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', gap: 12, maxWidth: 760, width: '100%', margin: '0 auto', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {currentIdx > 0 && (
                      <Button variant="secondary" onClick={() => dispatch({ type: 'BACK' })}>
                        ← Back
                      </Button>
                    )}
                    {isOptional && (
                      <Button variant="ghost" onClick={() => dispatch({ type: 'SKIP', step: state.currentStep })}>
                        Skip for now
                      </Button>
                    )}
                  </div>
                  <Button id="wizard-continue" variant="primary" onClick={handleContinue} disabled={!isStepValid}>
                    Continue →
                  </Button>
                </div>
              </footer>
            )}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
