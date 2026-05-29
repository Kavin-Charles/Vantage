// apps/web/app/setup/steps/StepAdminAccount.tsx
'use client';

import { useState } from 'react';

type AdminValue = { name: string; email: string; password: string };

type Props = {
  value: AdminValue;
  onChange: (v: AdminValue) => void;
  onNext: () => void;
  onBack: () => void;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'DM Sans, sans-serif',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text)',
  marginBottom: 6,
};

export function StepAdminAccount({ value, onChange, onNext, onBack }: Props) {
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const btnBase: React.CSSProperties = {
    padding: '8px 20px',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif',
  };

  const submit = () => {
    if (!value.name.trim()) { setError('Name is required.'); return; }
    if (!value.email.includes('@')) { setError('Valid email is required.'); return; }
    if (value.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (value.password !== confirm) { setError('Passwords do not match.'); return; }
    setError('');
    onNext();
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
        Admin Account
      </h2>
      <p style={{ margin: '0 0 24px', color: 'var(--text2)', fontSize: 14 }}>
        This creates the first admin account. Use these credentials to log in after setup.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Full name *</label>
          <input
            style={inputStyle}
            value={value.name}
            onChange={e => onChange({ ...value, name: e.target.value })}
            placeholder="Jane Smith"
          />
        </div>
        <div>
          <label style={labelStyle}>Email *</label>
          <input
            style={inputStyle}
            type="email"
            value={value.email}
            onChange={e => onChange({ ...value, email: e.target.value })}
            placeholder="admin@yourcompany.com"
          />
        </div>
        <div>
          <label style={labelStyle}>Password * (min 8 characters)</label>
          <input
            style={inputStyle}
            type="password"
            value={value.password}
            onChange={e => onChange({ ...value, password: e.target.value })}
          />
        </div>
        <div>
          <label style={labelStyle}>Confirm password *</label>
          <input
            style={inputStyle}
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
          />
        </div>
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>}

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ ...btnBase, background: 'var(--surface2)', color: 'var(--text)' }}>
          Back
        </button>
        <button onClick={submit} style={{ ...btnBase, background: 'var(--text)', color: '#fff' }}>
          Next
        </button>
      </div>
    </div>
  );
}
