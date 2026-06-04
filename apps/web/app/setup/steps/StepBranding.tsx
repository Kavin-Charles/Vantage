'use client';

import { useState } from 'react';

type Props = {
  value: { name: string; logoUrl: string; domain: string };
  onChange: (v: { name: string; logoUrl: string; domain: string }) => void;
  onNext: () => void;
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

export function StepBranding({ value, onChange, onNext }: Props) {
  const [error, setError] = useState('');

  const submit = () => {
    if (!value.name.trim()) {
      setError('App name is required.');
      return;
    }
    setError('');
    onNext();
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
        Branding
      </h2>
      <p style={{ margin: '0 0 24px', color: 'var(--text2)', fontSize: 14 }}>
        Customize how your Vencore instance appears.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>App name *</label>
          <input
            style={inputStyle}
            value={value.name}
            onChange={e => onChange({ ...value, name: e.target.value })}
            placeholder="Acme CRM"
          />
        </div>
        <div>
          <label style={labelStyle}>Logo URL</label>
          <input
            style={inputStyle}
            value={value.logoUrl}
            onChange={e => onChange({ ...value, logoUrl: e.target.value })}
            placeholder="/logo.png"
          />
        </div>
        <div>
          <label style={labelStyle}>Domain</label>
          <input
            style={inputStyle}
            value={value.domain}
            onChange={e => onChange({ ...value, domain: e.target.value })}
            placeholder="app.yourcompany.com"
          />
        </div>
      </div>

      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>
      )}

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={submit}
          style={{
            padding: '8px 20px',
            background: 'var(--text)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
