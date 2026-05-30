'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { WorkspaceImapConfig } from '@/app/(dashboard)/settings/mail/page';

interface Props {
  workspaceConfig: WorkspaceImapConfig | null;
  userRole: 'admin' | 'member';
  onClose: () => void;
  onConnected: () => void;
}

type Screen = 'pick' | 'gmail' | 'imap';

interface ServerFields {
  imap_host: string;
  imap_port: string;
  smtp_host: string;
  smtp_port: string;
  use_ssl: boolean;
}

export default function ConnectAccountModal({ workspaceConfig, userRole, onClose, onConnected }: Props) {
  const [screen, setScreen] = useState<Screen>('pick');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverFields, setServerFields] = useState<ServerFields>({
    imap_host: '', imap_port: '993', smtp_host: '', smtp_port: '587', use_ssl: true,
  });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admin with no prior config sees full server fields
  const showServerFields = !workspaceConfig && userRole === 'admin';
  // Non-admin with no config sees "ask admin" message
  const noConfig = !workspaceConfig && userRole !== 'admin';

  async function handleGmail() {
    setScreen('gmail');
    setError(null);
    try {
      const res = await apiFetch<{ data: { url: string } }>('/api/mail/accounts/gmail/auth-url', { method: 'POST' });
      window.location.href = res.data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start Gmail auth');
      setScreen('pick');
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      // Admin with no prior config: save server settings first
      if (showServerFields) {
        await apiFetch('/api/mail/workspace-config', {
          method: 'PUT',
          body: JSON.stringify({
            imap_host: serverFields.imap_host,
            imap_port: Number(serverFields.imap_port),
            smtp_host: serverFields.smtp_host,
            smtp_port: Number(serverFields.smtp_port),
            use_ssl: serverFields.use_ssl,
          }),
        });
      }

      // Test connection against workspace config
      await apiFetch('/api/mail/accounts/imap/test', {
        method: 'POST',
        body: JSON.stringify({ email, imap_pass: password }),
      });

      // Connect account
      const body: Record<string, unknown> = {
        email,
        imap_pass: password,
        smtp_pass: password,
      };
      if (showServerFields) {
        body['imap_host'] = serverFields.imap_host;
        body['imap_port'] = Number(serverFields.imap_port);
        body['smtp_host'] = serverFields.smtp_host;
        body['smtp_port'] = Number(serverFields.smtp_port);
        body['use_ssl'] = serverFields.use_ssl;
      }
      await apiFetch('/api/mail/accounts/imap', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      onConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text)',
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
        padding: 24, width: 420, maxWidth: '90vw',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Connect mail account</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)', padding: 0, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '8px 12px', borderRadius: 6, marginBottom: 14, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Provider picker */}
        {screen === 'pick' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => void handleGmail()}
              style={{
                padding: '12px 16px', fontSize: 14, textAlign: 'left',
                background: 'var(--text)', color: '#fff', border: 'none',
                borderRadius: 8, cursor: 'pointer', fontWeight: 500,
              }}
            >
              Gmail
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>
                Connect via Google OAuth
              </div>
            </button>
            <button
              onClick={() => setScreen('imap')}
              style={{
                padding: '12px 16px', fontSize: 14, textAlign: 'left',
                background: 'var(--surface2)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontWeight: 500,
              }}
            >
              Company mail
              <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--text3)', marginTop: 2 }}>
                Connect via IMAP/SMTP
              </div>
            </button>
          </div>
        )}

        {/* Gmail redirecting */}
        {screen === 'gmail' && (
          <p style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', padding: '20px 0' }}>
            Redirecting to Google…
          </p>
        )}

        {/* Company mail: no config, non-admin */}
        {screen === 'imap' && noConfig && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
              Your admin hasn&apos;t configured the company mail server yet. Ask them to set it up in Settings → Mail.
            </p>
            <button
              onClick={() => setScreen('pick')}
              style={{ padding: '8px 14px', fontSize: 13, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
            >
              Back
            </button>
          </div>
        )}

        {/* Company mail: connect form (config exists OR admin setting up for first time) */}
        {screen === 'imap' && !noConfig && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Existing config: show locked server info */}
            {workspaceConfig && (
              <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>
                Server: {workspaceConfig.imap_host}:{workspaceConfig.imap_port} ·{' '}
                {workspaceConfig.smtp_host}:{workspaceConfig.smtp_port}
              </p>
            )}

            {/* Admin first-time setup: editable server fields */}
            {showServerFields && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
                  Server settings (saved for your team)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8, marginBottom: 8 }}>
                  {([
                    ['imap_host', 'IMAP host', 'imap.company.com'],
                    ['imap_port', 'Port', '993'],
                    ['smtp_host', 'SMTP host', 'smtp.company.com'],
                    ['smtp_port', 'Port', '587'],
                  ] as [keyof ServerFields, string, string][]).map(([key, label, placeholder]) => (
                    <div key={key}>
                      <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>{label}</label>
                      <input
                        value={String(serverFields[key])}
                        onChange={e => setServerFields(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    id="modal-use-ssl"
                    checked={serverFields.use_ssl}
                    onChange={e => setServerFields(f => ({ ...f, use_ssl: e.target.checked }))}
                  />
                  <label htmlFor="modal-use-ssl" style={{ fontSize: 13 }}>Use SSL/TLS</label>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => void handleConnect()}
                disabled={connecting || !email || !password}
                style={{
                  flex: 1, padding: '8px 14px', fontSize: 13,
                  background: 'var(--text)', color: '#fff', border: 'none',
                  borderRadius: 8, cursor: 'pointer', fontWeight: 500,
                  opacity: connecting || !email || !password ? 0.6 : 1,
                }}
              >
                {connecting ? 'Connecting…' : 'Connect'}
              </button>
              <button
                onClick={() => setScreen('pick')}
                style={{ padding: '8px 14px', fontSize: 13, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
