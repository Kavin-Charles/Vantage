'use client';

import { useState, useEffect } from 'react';
import type { SetupState } from '../types';

type Props = { state: SetupState };

type CheckItem = {
  id: string;
  label: string;
  status: 'pending' | 'ok' | 'skip';
  action?: { label: string; onClick: () => void };
};

export function StepComplete({ state }: Props) {
  const { domain, smtp, branding } = state;
  const appUrl = domain.domain
    ? `http${domain.sslEnabled ? 's' : ''}://${domain.domain}`
    : `http://localhost:3000`;

  const [dnsOk, setDnsOk] = useState(false);
  const [sslOk, setSslOk] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [removeCopied, setRemoveCopied] = useState(false);

  useEffect(() => {
    if (!domain.domain) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch('/api/installer/check-domain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: domain.domain, ssl: domain.sslEnabled }),
        });
        const json = await res.json();
        if (json.data?.dns) setDnsOk(true);
        if (json.data?.ssl) setSslOk(true);
        if (json.data?.dns && (!domain.sslEnabled || json.data?.ssl)) clearInterval(poll);
      } catch { /* network not ready yet */ }
    }, 5000);
    return () => clearInterval(poll);
  }, [domain.domain, domain.sslEnabled]);

  const checks: CheckItem[] = [
    ...(domain.domain ? [
      { id: 'dns', label: 'DNS A record set', status: dnsOk ? 'ok' as const : 'pending' as const },
      ...(domain.sslEnabled ? [{ id: 'ssl', label: 'SSL certificate issued', status: sslOk ? 'ok' as const : 'pending' as const }] : []),
    ] : []),
    ...(smtp ? [{
      id: 'smtp', label: 'Send a test email', status: 'pending' as const,
      action: { label: 'Send test →', onClick: () => {} },
    }] : []),
    {
      id: 'invite', label: 'Invite your team', status: 'pending' as const,
      action: {
        label: inviteCopied ? 'Copied!' : 'Copy invite link',
        onClick: () => { navigator.clipboard.writeText(`${appUrl}/invite`); setInviteCopied(true); },
      },
    },
    {
      id: 'remove', label: 'Remove installer container', status: 'pending' as const,
      action: {
        label: removeCopied ? 'Copied!' : 'Copy command',
        onClick: () => { navigator.clipboard.writeText('docker rm -f vencore-installer'); setRemoveCopied(true); },
      },
    },
  ];

  return (
    <div style={{ textAlign: 'center', paddingTop: 40 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>
        {branding.name || 'Vencore'} is running
      </h1>
      {domain.domain && (
        <p style={{ fontSize: 15, color: 'var(--text2)', margin: '0 0 40px' }}>{appUrl}</p>
      )}

      <div style={{ textAlign: 'left', maxWidth: 440, margin: '0 auto 40px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Next steps
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {checks.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)',
            }}>
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>
                {c.status === 'ok' ? '✓' : c.status === 'skip' ? '—' : '○'}
              </span>
              <span style={{ flex: 1, fontSize: 14, color: c.status === 'ok' ? 'var(--text3)' : 'var(--text)' }}>
                {c.label}
                {c.status === 'pending' && !c.action && (
                  <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 6 }}>checking…</span>
                )}
              </span>
              {c.action && (
                <button onClick={c.action.onClick} style={{
                  padding: '5px 12px', fontSize: 12, fontWeight: 500,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 4, cursor: 'pointer', color: 'var(--text)', fontFamily: 'IBM Plex Sans, sans-serif',
                }}>
                  {c.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <a href={appUrl} target="_blank" rel="noreferrer" style={{
        display: 'inline-block', padding: '12px 32px',
        background: 'var(--text)', color: '#fff', borderRadius: 8,
        fontSize: 15, fontWeight: 600, textDecoration: 'none',
        fontFamily: 'var(--font-display)',
      }}>
        Open {branding.name || 'Vencore'} →
      </a>
    </div>
  );
}
