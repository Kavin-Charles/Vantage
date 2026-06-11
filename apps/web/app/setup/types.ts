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
  features: { crm: boolean; infra: boolean; alerts: boolean; analytics: boolean };
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
  features: { crm: true, infra: true, alerts: true, analytics: false },
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

    case 'SET_INFRA': {
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
