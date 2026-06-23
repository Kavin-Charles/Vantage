'use client';

import { ComingSoonBadge } from '@/modules/shared/components/ui/ComingSoonBadge';

const ROWS = [
  { label: 'Two-factor authentication', description: 'Require a code from your phone when signing in.' },
  { label: 'Active sessions', description: 'See and revoke devices currently signed in.' },
];

export default function SecurityPage() {
  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Security</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Extra protection for your account.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ROWS.map(row => (
          <div
            key={row.label}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)',
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{row.label}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{row.description}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <ComingSoonBadge />
              <button
                disabled
                style={{
                  padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--surface2)', color: 'var(--text3)', fontSize: 13,
                  fontWeight: 500, cursor: 'not-allowed',
                }}
              >
                Enable
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
