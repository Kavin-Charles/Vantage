// apps/web/app/setup/steps/StepSmtp.tsx
'use client';

import { useState } from 'react';
import type { SetupState, WizardAction, SmtpConfig } from '../types';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { useToast } from '@/modules/shared/components/ui/Toast';
import { Button } from '@/modules/shared/components/ui/Button';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

const EMPTY: SmtpConfig = { host: '', port: 587, secure: false, user: '', password: '', from: '' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function StepSmtp({ state, dispatch }: Props) {
  const smtp = state.smtp ?? EMPTY;
  const { showToast } = useToast();
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [testError, setTestError] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState(false);

  const anyFieldFilled = !!(smtp.host || smtp.user || smtp.password || smtp.from);
  const hostError = anyFieldFilled && !smtp.host ? 'Host is required when configuring SMTP.' : '';
  const portError = smtp.port < 1 || smtp.port > 65535 ? 'Port must be between 1 and 65535.' : '';
  const fromError = smtp.from && !EMAIL_RE.test(smtp.from) ? 'Enter a valid email address.' : '';

  const set = (partial: Partial<SmtpConfig>) =>
    dispatch({ type: 'SET_SMTP', value: { ...smtp, ...partial } });

  const blur = (field: string) => setTouched(t => ({ ...t, [field]: true }));

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
      if (json.data?.ok) {
        setTestStatus('ok');
        showToast('success', 'Test email sent successfully.');
      } else {
        const msg = json.error?.message ?? 'Send failed';
        setTestStatus('error');
        setTestError(msg);
        showToast('error', msg);
      }
    } catch {
      const msg = 'Network error — is the API running?';
      setTestStatus('error');
      setTestError(msg);
      showToast('error', msg);
    }
  };

  return (
    <div>
      <h2 style={heading}>
        SMTP{' '}
        <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 400 }}>optional</span>
      </h2>
      <p style={subtext}>Configure outbound email (invites, alerts, password reset). Skip to set up later.</p>

      <SectionLabel>Connection</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Host" htmlFor="smtp-host" style={{ flex: 3 }}>
            <input id="smtp-host" style={input} value={smtp.host} onChange={e => set({ host: e.target.value })} onBlur={() => blur('host')} placeholder="smtp.example.com" />
            {touched.host && hostError && <p style={fieldError}>{hostError}</p>}
          </Field>
          <Field label="Port" htmlFor="smtp-port" style={{ flex: 1 }}>
            <input id="smtp-port" style={input} type="number" value={smtp.port} onChange={e => set({ port: parseInt(e.target.value) || 587 })} onBlur={() => blur('port')} />
            {touched.port && portError && <p style={fieldError}>{portError}</p>}
          </Field>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={smtp.secure} onChange={e => set({ secure: e.target.checked })} />
          <span style={{ color: 'var(--text)' }}>Use TLS/SSL</span>
        </label>
      </div>

      <SectionLabel>Sender</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Username" htmlFor="smtp-user">
          <input id="smtp-user" style={input} value={smtp.user} onChange={e => set({ user: e.target.value })} />
        </Field>
        <Field label="Password" htmlFor="smtp-password">
          <div style={{ position: 'relative' }}>
            <input
              id="smtp-password"
              style={{ ...input, paddingRight: 38 }}
              type={showPassword ? 'text' : 'password'}
              value={smtp.password}
              onChange={e => set({ password: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 4 }}
            >
              <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} />
            </button>
          </div>
        </Field>
        <Field label="From address" htmlFor="smtp-from">
          <input id="smtp-from" style={input} type="email" value={smtp.from} onChange={e => set({ from: e.target.value })} onBlur={() => blur('from')} placeholder="noreply@acme.com" />
          {touched.from && fromError && <p style={fieldError}>{fromError}</p>}
        </Field>
      </div>

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button variant="secondary" onClick={sendTest} disabled={testStatus === 'sending' || !smtp.host}>
          {testStatus === 'sending' ? 'Sending…' : 'Send test email'}
        </Button>
        {testStatus === 'ok' && <span style={{ fontSize: 13, color: 'var(--green)' }}>✓ Email sent</span>}
        {testStatus === 'error' && <span style={{ fontSize: 13, color: 'var(--red)' }}>✗ {testError}</span>}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase',
      letterSpacing: '0.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)',
    }}>
      {children}
    </div>
  );
}

function Field({ label, children, style, htmlFor }: { label: string; children: React.ReactNode; style?: React.CSSProperties; htmlFor?: string }) {
  return (
    <div style={style}>
      <label htmlFor={htmlFor} style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const fieldError: React.CSSProperties = { fontSize: 12, color: 'var(--red)', margin: '4px 0 0' };
const input: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Sans, sans-serif', boxSizing: 'border-box' };
