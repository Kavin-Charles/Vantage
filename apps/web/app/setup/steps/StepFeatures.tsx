'use client';

import type { SetupState, WizardAction } from '../types';
import { Icon } from '@/modules/shared/components/ui/Icon';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };
type Features = SetupState['features'];

const FEATURE_CARDS: { key: keyof Features; label: string; desc: string; icon: string }[] = [
  { key: 'crm',       label: 'CRM',            desc: 'Contacts, companies, deals, tasks, activity', icon: 'pipeline' },
  { key: 'infra',     label: 'Infrastructure', desc: 'Server monitoring, databases, websites',       icon: 'servers' },
  { key: 'alerts',    label: 'Alerts',         desc: 'Threshold alerts and notifications',           icon: 'alerts' },
  { key: 'analytics', label: 'Analytics',      desc: 'Revenue charts, pipeline stats, rep leaderboard', icon: 'analytics' },
];

export function StepFeatures({ state, dispatch }: Props) {
  const { features } = state;

  const toggle = (key: keyof Features) =>
    dispatch({ type: 'SET_FEATURES', value: { ...features, [key]: !features[key] } });

  return (
    <div>
      <h2 style={heading}>Features</h2>
      <p style={subtext}>Enable the modules you need. You can change these after setup.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {FEATURE_CARDS.map(({ key, label, desc, icon }) => {
          const selected = features[key];
          return (
            <label
              key={key}
              style={{
                position: 'relative',
                display: 'flex', flexDirection: 'column', gap: 10,
                padding: '16px', borderRadius: 12, cursor: 'pointer',
                border: `1.5px solid ${selected ? 'var(--text)' : 'var(--border)'}`,
                background: selected ? 'var(--surface2)' : 'var(--surface)',
                transition: 'border-color var(--motion-fast) var(--motion-ease), background var(--motion-fast) var(--motion-ease), transform var(--motion-fast) var(--motion-ease)',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggle(key)}
                aria-label={label}
                style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: selected ? 'var(--text)' : 'var(--surface2)',
                  color: selected ? 'var(--bg)' : 'var(--text2)',
                  transition: 'background var(--motion-fast) var(--motion-ease), color var(--motion-fast) var(--motion-ease)',
                }}>
                  <Icon name={icon} size={18} />
                </div>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: selected ? 'var(--green)' : 'transparent',
                  border: selected ? 'none' : '1.5px solid var(--border)',
                  color: '#fff', fontSize: 11, fontWeight: 700,
                  transition: 'background var(--motion-fast) var(--motion-ease)',
                }}>
                  {selected && '✓'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{desc}</div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
