'use client';

import { useState } from 'react';
import type { SetupState } from '../SetupWizard';

type Props = {
  state: SetupState;
  onBack: () => void;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text2)', fontSize: 13 }}>{label}</span>
      <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export function StepReview({ state, onBack }: Props) {
  const [loading, setLoading] = useState(false);
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

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          branding: state.branding,
          features: state.features,
          smtp: state.smtp,
          admin: state.admin,
        }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        setError(json.error?.code === 'ALREADY_CONFIGURED'
          ? 'This instance is already configured.'
          : 'Setup failed. Please check your inputs and try again.');
        return;
      }

      // Redirect to login — cookie is set by the API
      window.location.href = '/login';
    } catch {
      setError('Network error. Is the API running?');
    } finally {
      setLoading(false);
    }
  };

  const enabledFeatures = Object.entries(state.features)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ') || 'None';

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
        Review & Confirm
      </h2>
      <p style={{ margin: '0 0 24px', color: 'var(--text2)', fontSize: 14 }}>
        Check your configuration before launching.
      </p>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          Branding
        </div>
        <Row label="App name" value={state.branding.name} />
        <Row label="Logo URL" value={state.branding.logoUrl} />
        {state.branding.domain && <Row label="Domain" value={state.branding.domain} />}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          Features
        </div>
        <Row label="Enabled" value={enabledFeatures} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          SMTP
        </div>
        {state.smtp
          ? <>
              <Row label="Host" value={`${state.smtp.host}:${state.smtp.port}`} />
              <Row label="From" value={state.smtp.from} />
              <Row label="Password" value="••••••••" />
            </>
          : <Row label="Status" value="Skipped" />
        }
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          Admin Account
        </div>
        <Row label="Name" value={state.admin.name} />
        <Row label="Email" value={state.admin.email} />
        <Row label="Password" value="••••••••" />
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} disabled={loading} style={{ ...btnBase, background: 'var(--surface2)', color: 'var(--text)' }}>
          Back
        </button>
        <button
          onClick={submit}
          disabled={loading}
          style={{ ...btnBase, background: 'var(--green)', color: '#fff', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Launching…' : 'Launch Vantage'}
        </button>
      </div>
    </div>
  );
}
