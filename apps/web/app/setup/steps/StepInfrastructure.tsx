'use client';

import type { SetupState, WizardAction, InfraMode } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

const MODES: { id: InfraMode; icon: string; title: string; desc: string }[] = [
  {
    id: 'docker-deploy',
    icon: '🐳',
    title: 'Docker Deploy',
    desc: 'Vencore spins up Postgres and Redis containers for you. Recommended for new installs.',
  },
  {
    id: 'own-creds',
    icon: '🗄',
    title: 'Own Credentials',
    desc: 'I already have Postgres and Redis running. I will provide connection details.',
  },
];

export function StepInfrastructure({ state, dispatch }: Props) {
  const { infra } = state;
  const setMode = (mode: InfraMode) =>
    dispatch({ type: 'SET_INFRA', value: { ...infra, mode } });

  return (
    <div>
      <h2 style={heading}>Infrastructure</h2>
      <p style={subtext}>How do you want to set up the database?</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              padding: '20px 24px',
              border: `2px solid ${infra.mode === m.id ? 'var(--text)' : 'var(--border)'}`,
              borderRadius: 10,
              background: infra.mode === m.id ? 'var(--surface2)' : 'var(--surface)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <span style={{ fontSize: 28, lineHeight: 1 }}>{m.icon}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{m.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{m.desc}</div>
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%', display: 'inline-block',
                border: `2px solid ${infra.mode === m.id ? 'var(--text)' : 'var(--border)'}`,
                background: infra.mode === m.id ? 'var(--text)' : 'transparent',
              }} />
            </div>
          </button>
        ))}
      </div>

      {infra.mode === 'docker-deploy' && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Docker options</h3>
          <Field label="Data directory">
            <input style={input} value={infra.dataDir}
              onChange={e => dispatch({ type: 'SET_INFRA', value: { ...infra, dataDir: e.target.value } })}
              placeholder="/opt/vencore/data" />
          </Field>
          <div style={{ display: 'flex', gap: 16 }}>
            <Field label="Postgres version">
              <select style={input} value={infra.postgresVersion}
                onChange={e => dispatch({ type: 'SET_INFRA', value: { ...infra, postgresVersion: e.target.value } })}>
                {['16', '15', '14'].map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Redis version">
              <select style={input} value={infra.redisVersion}
                onChange={e => dispatch({ type: 'SET_INFRA', value: { ...infra, redisVersion: e.target.value } })}>
                {['7', '6'].map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const input: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Sans, sans-serif', boxSizing: 'border-box',
};
