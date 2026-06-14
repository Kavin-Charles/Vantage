'use client';

import { useState, useEffect } from 'react';
import type { SetupState, WizardAction } from '../types';

type Props = {
  state: SetupState;
  dispatch: React.Dispatch<WizardAction>;
  validateRef: React.MutableRefObject<() => boolean>;
};

export function StepAdminAccount({ state, dispatch, validateRef }: Props) {
  const { admin } = state;
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    validateRef.current = () => {
      if (!admin.name.trim()) { setError('Full name is required.'); return false; }
      if (!admin.email.trim()) { setError('Email is required.'); return false; }
      if (admin.password.length < 8) { setError('Password must be at least 8 characters.'); return false; }
      if (admin.password !== confirm) { setError('Passwords do not match.'); return false; }
      setError('');
      return true;
    };
    return () => { validateRef.current = () => true; };
  }, [admin, confirm, validateRef]);

  const set = (partial: Partial<typeof admin>) =>
    dispatch({ type: 'SET_ADMIN', value: { ...admin, ...partial } });

  return (
    <div>
      <h2 style={heading}>Admin Account</h2>
      <p style={subtext}>Create the first administrator account for your Vencore instance.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Full name *">
          <input style={input} value={admin.name} onChange={e => set({ name: e.target.value })} placeholder="Jane Smith" />
        </Field>
        <Field label="Email *">
          <input style={input} type="email" value={admin.email} onChange={e => set({ email: e.target.value })} placeholder="admin@yourcompany.com" />
        </Field>
        <Field label="Password * (min 8 characters)">
          <input style={input} type="password" value={admin.password} onChange={e => set({ password: e.target.value })} />
        </Field>
        <Field label="Confirm password *">
          <input style={input} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />
        </Field>
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const input: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Sans, sans-serif', boxSizing: 'border-box' };
