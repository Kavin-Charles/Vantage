// apps/web/app/setup/steps/StepSmtp.tsx
'use client';

import { useState } from 'react';
import type { SmtpConfig } from '../SetupWizard';

type Props = {
  value: SmtpConfig | null;
  onChange: (v: SmtpConfig | null) => void;
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

const EMPTY: SmtpConfig = { host: '', port: 587, secure: false, user: '', password: '', from: '' };

export function StepSmtp({ value, onChange, onNext, onBack }: Props) {
  const [enabled, setEnabled] = useState(value !== null);
  const [form, setForm] = useState<SmtpConfig>(value ?? EMPTY);
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
    if (!enabled) {
      onChange(null);
      onNext();
      return;
    }
    if (!form.host || !form.user || !form.password || !form.from) {
      setError('All SMTP fields are required when SMTP is enabled.');
      return;
    }
    setError('');
    onChange(form);
    onNext();
  };

  const f = (key: keyof SmtpConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(s => ({ ...s, [key]: key === 'port' ? Number(e.target.value) : e.target.value }));

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
        SMTP
      </h2>
      <p style={{ margin: '0 0 20px', color: 'var(--text2)', fontSize: 14 }}>
        Configure email sending for notifications and password resets.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
          style={{ width: 16, height: 16 }}
        />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>Enable SMTP</span>
      </label>

      {enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
            <div>
              <label style={labelStyle}>Host *</label>
              <input style={inputStyle} value={form.host} onChange={f('host')} placeholder="smtp.sendgrid.net" />
            </div>
            <div>
              <label style={labelStyle}>Port *</label>
              <input style={inputStyle} type="number" value={form.port} onChange={f('port')} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Username *</label>
            <input style={inputStyle} value={form.user} onChange={f('user')} placeholder="apikey" />
          </div>
          <div>
            <label style={labelStyle}>Password *</label>
            <input style={inputStyle} type="password" value={form.password} onChange={f('password')} />
          </div>
          <div>
            <label style={labelStyle}>From address *</label>
            <input style={inputStyle} value={form.from} onChange={f('from')} placeholder="hello@yourcompany.com" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.secure}
              onChange={e => setForm(s => ({ ...s, secure: e.target.checked }))}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>Use TLS (port 465)</span>
          </label>
        </div>
      )}

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>}

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ ...btnBase, background: 'var(--surface2)', color: 'var(--text)' }}>
          Back
        </button>
        <button onClick={submit} style={{ ...btnBase, background: 'var(--text)', color: '#fff' }}>
          {enabled ? 'Next' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
