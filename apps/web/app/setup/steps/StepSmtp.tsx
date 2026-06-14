// apps/web/app/setup/steps/StepSmtp.tsx
'use client';

import { useState } from 'react';
import type { SetupState, WizardAction, SmtpConfig } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

const EMPTY: SmtpConfig = { host: '', port: 587, secure: false, user: '', password: '', from: '' };

export function StepSmtp({ state, dispatch }: Props) {
  const smtp = state.smtp ?? EMPTY;
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  const set = (partial: Partial<SmtpConfig>) =>
    dispatch({ type: 'SET_SMTP', value: { ...smtp, ...partial } });

  const sendTest = async () => {
    if (!state.admin.email && !smtp.from) return;
    setTestStatus('sending');
    setTestError('');
    try {
      const res = await fetch('/api/installer/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtp, to: state.admin.email || smtp.from }),
      });
      const json = await res.json();
      if (json.data?.ok) { setTestStatus('ok'); }
      else { setTestStatus('error'); setTestError(json.error?.message ?? 'Send failed'); }
    } catch {
      setTestStatus('error');
      setTestError('Network error — is the API running?');
    }
  };

  return (
    <div>
      <h2 style={heading}>
        SMTP{' '}
        <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 400 }}>optional</span>
      </h2>
      <p style={subtext}>Configure outbound email (invites, alerts, password reset). Skip to set up later.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Host" style={{ flex: 3 }}>
            <input style={input} value={smtp.host} onChange={e => set({ host: e.target.value })} placeholder="smtp.example.com" />
          </Field>
          <Field label="Port" style={{ flex: 1 }}>
            <input style={input} type="number" value={smtp.port} onChange={e => set({ port: parseInt(e.target.value) || 587 })} />
          </Field>
        </div>
        <Field label="Username">
          <input style={input} value={smtp.user} onChange={e => set({ user: e.target.value })} />
        </Field>
        <Field label="Password">
          <input style={input} type="password" value={smtp.password} onChange={e => set({ password: e.target.value })} />
        </Field>
        <Field label="From address">
          <input style={input} type="email" value={smtp.from} onChange={e => set({ from: e.target.value })} placeholder="noreply@acme.com" />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={smtp.secure} onChange={e => set({ secure: e.target.checked })} />
          <span style={{ color: 'var(--text)' }}>Use TLS/SSL</span>
        </label>
      </div>

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={sendTest} disabled={testStatus === 'sending' || !smtp.host} style={btnTest}>
          {testStatus === 'sending' ? 'Sending…' : 'Send test email'}
        </button>
        {testStatus === 'ok' && <span style={{ fontSize: 13, color: 'var(--green)' }}>✓ Email sent</span>}
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

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const input: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Sans, sans-serif', boxSizing: 'border-box' };
const btnTest: React.CSSProperties = { padding: '8px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif', color: 'var(--text)' };
