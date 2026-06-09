'use client';

import { useState, useEffect } from 'react';
import type { SetupState, WizardAction } from '../types';

type Props = { state: SetupState; dispatch: React.Dispatch<WizardAction> };

export function StepDomainSsl({ state, dispatch }: Props) {
  const { domain } = state;
  const [serverIp, setServerIp] = useState('');

  useEffect(() => {
    fetch('/api/installer/server-ip')
      .then(r => r.json())
      .then(j => setServerIp(j.data?.ip ?? ''))
      .catch(() => {});
  }, []);

  const set = (partial: Partial<typeof domain>) =>
    dispatch({ type: 'SET_DOMAIN', value: { ...domain, ...partial } });

  return (
    <div>
      <h2 style={heading}>
        Domain & SSL{' '}
        <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 400 }}>optional</span>
      </h2>
      <p style={subtext}>Configure a custom domain and automatic SSL. Skip to use the server IP directly.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Domain */}
        <section>
          <div style={sectionHeading}>Domain</div>
          <label style={labelStyle}>Custom domain</label>
          <input style={input} value={domain.domain} onChange={e => set({ domain: e.target.value })} placeholder="app.acme.com" />
          {serverIp && domain.domain && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 6, fontSize: 13, color: 'var(--text2)' }}>
              Add a DNS A record:{' '}
              <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>{domain.domain}</code>
              {' → '}
              <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>{serverIp}</code>
            </div>
          )}
        </section>

        {/* SSL */}
        <section>
          <div style={sectionHeading}>SSL</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={domain.sslEnabled}
              disabled={!domain.domain}
              onChange={e => set({ sslEnabled: e.target.checked })}
            />
            <span style={{ fontSize: 13, color: domain.domain ? 'var(--text)' : 'var(--text3)' }}>
              Auto SSL via Let's Encrypt {!domain.domain && '(requires domain)'}
            </span>
          </label>
          {domain.sslEnabled && domain.domain && (
            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Email for cert renewal notices</label>
              <input style={input} type="email" value={domain.sslEmail} onChange={e => set({ sslEmail: e.target.value })} placeholder="admin@acme.com" />
            </div>
          )}
          {!domain.domain && (
            <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
              ⚠ No domain set — app will be accessible at http://{serverIp || 'SERVER_IP'}:3000
            </p>
          )}
        </section>

        {/* Proxy */}
        <section>
          <div style={sectionHeading}>Reverse proxy</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['caddy', 'nginx'] as const).map(pt => (
              <button key={pt} onClick={() => set({ proxyType: pt })} style={{
                padding: '8px 16px', borderRadius: 6,
                border: `1.5px solid ${domain.proxyType === pt ? 'var(--text)' : 'var(--border)'}`,
                background: domain.proxyType === pt ? 'var(--surface2)' : 'var(--surface)',
                cursor: 'pointer', fontSize: 13,
                fontWeight: domain.proxyType === pt ? 600 : 400,
                color: 'var(--text)', fontFamily: 'IBM Plex Sans, sans-serif',
              }}>
                {pt === 'caddy' ? 'Caddy (recommended)' : 'Nginx'}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
            {domain.proxyType === 'caddy'
              ? 'Caddy handles SSL automatically. Caddyfile written to /opt/vencore/Caddyfile.'
              : 'nginx.conf written to /opt/vencore/nginx.conf. You manage SSL via certbot or similar.'}
          </p>
        </section>
      </div>
    </div>
  );
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'Bricolage Grotesque, sans-serif' };
const subtext: React.CSSProperties = { margin: '0 0 28px', color: 'var(--text2)', fontSize: 14 };
const sectionHeading: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 };
const input: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Sans, sans-serif', boxSizing: 'border-box' };
