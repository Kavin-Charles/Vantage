'use client';

import type { SetupState, WizardAction } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };
type Features = SetupState['features'];

const FEATURE_LABELS: { key: keyof Features; label: string; desc: string }[] = [
  { key: 'crm',       label: 'CRM',            desc: 'Contacts, companies, deals, tasks, activity' },
  { key: 'infra',     label: 'Infrastructure', desc: 'Server monitoring, databases, websites' },
  { key: 'alerts',    label: 'Alerts',         desc: 'Threshold alerts and notifications' },
  { key: 'analytics', label: 'Analytics',      desc: 'Revenue charts, pipeline stats, rep leaderboard' },
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

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
