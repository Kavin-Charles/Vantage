'use client';

import { useState } from 'react';
import { ProgressBar } from './ProgressBar';
import { StepBranding } from './steps/StepBranding';
import { StepFeatures } from './steps/StepFeatures';
import { StepSmtp } from './steps/StepSmtp';
import { StepAdminAccount } from './steps/StepAdminAccount';
import { StepReview } from './steps/StepReview';

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

export type SetupState = {
  step: 1 | 2 | 3 | 4 | 5;
  branding: { name: string; logoUrl: string; domain: string };
  features: { crm: boolean; infra: boolean; alerts: boolean; analytics: boolean; files: boolean };
  smtp: SmtpConfig | null;
  admin: { name: string; email: string; password: string };
};

const INITIAL: SetupState = {
  step: 1,
  branding: { name: '', logoUrl: '/logo.png', domain: '' },
  features: { crm: true, infra: true, alerts: true, analytics: false, files: false },
  smtp: null,
  admin: { name: '', email: '', password: '' },
};

export function SetupWizard() {
  const [state, setState] = useState<SetupState>(INITIAL);

  const update = (partial: Partial<SetupState>) =>
    setState(s => ({ ...s, ...partial }));

  const next = () => update({ step: (state.step + 1) as SetupState['step'] });
  const back = () => update({ step: (state.step - 1) as SetupState['step'] });

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 32,
    }}>
      <ProgressBar current={state.step} />
      {state.step === 1 && (
        <StepBranding
          value={state.branding}
          onChange={branding => update({ branding })}
          onNext={next}
        />
      )}
      {state.step === 2 && (
        <StepFeatures
          value={state.features}
          onChange={features => update({ features })}
          onNext={next}
          onBack={back}
        />
      )}
      {state.step === 3 && (
        <StepSmtp
          value={state.smtp}
          onChange={smtp => update({ smtp })}
          onNext={next}
          onBack={back}
        />
      )}
      {state.step === 4 && (
        <StepAdminAccount
          value={state.admin}
          onChange={admin => update({ admin })}
          onNext={next}
          onBack={back}
        />
      )}
      {state.step === 5 && (
        <StepReview
          state={state}
          onBack={back}
        />
      )}
    </div>
  );
}
