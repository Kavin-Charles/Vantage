'use client';

import { useState } from 'react';
import type { SetupState, WizardAction } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

export function StepDatabase({ state, dispatch }: Props) {
  const { db } = state.infra;
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  const set = (partial: Partial<typeof db>) =>
    dispatch({ type: 'SET_INFRA', value: { ...state.infra, db: { ...db, ...partial } } });

  const testConnection = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const res = await fetch('/api/installer/test-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: db.host, port: parseInt(db.port), name: db.name,
          user: db.user, password: db.password, ssl: db.ssl,
        }),
      });
      const json = await res.json();
      if (json.data?.ok) { setTestStatus('ok'); }
      else { setTestStatus('error'); setTestError(json.error?.message ?? 'Connection failed'); }
    } catch {
      setTestStatus('error');
      setTestError('Network error — is the API running?');
    }
  };

  return (
    <div>
      <h2 style={heading}>Database</h2>
      <p style={subtext}>Enter your Postgres connection details.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Host" style={{ flex: 3 }}>
            <input style={input} value={db.host} onChange={e => set({ host: e.target.value })} placeholder="localhost" />
          </Field>
          <Field label="Port" style={{ flex: 1 }}>
            <input style={input} value={db.port} onChange={e => set({ port: e.target.value })} placeholder="5432" />
          </Field>
        </div>
        <Field label="Database name">
          <input style={input} value={db.name} onChange={e => set({ name: e.target.value })} placeholder="vencore" />
        </Field>
        <Field label="Username">
          <input style={input} value={db.user} onChange={e => set({ user: e.target.value })} placeholder="vencore" />
        </Field>
        <Field label="Password">
          <input style={input} type="password" value={db.password} onChange={e => set({ password: e.target.value })} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={db.ssl} onChange={e => set({ ssl: e.target.checked })} />
          <span style={{ color: 'var(--text)' }}>Use SSL</span>
        </label>
      </div>

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={testConnection} disabled={testStatus === 'testing'} style={btnTest}>
          {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
        </button>
        {testStatus === 'ok' && <span style={{ fontSize: 13, color: 'var(--green)' }}>✓ Connected</span>}
        {testStatus === 'error' && <span style={{ fontSize: 13, color: 'var(--red)' }}>✗ {testError}</span>}
      </div>
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'Bricolage Grotesque, sans-serif' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const input: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Sans, sans-serif', boxSizing: 'border-box' };
const btnTest: React.CSSProperties = { padding: '8px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif', color: 'var(--text)' };
