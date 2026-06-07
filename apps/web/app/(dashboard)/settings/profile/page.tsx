'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/modules/shared/lib/AuthContext';

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  if (isLoading) return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;
  if (!user) return null;

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
    marginBottom: 16,
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Profile</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Your account details.
      </p>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600, color: 'var(--text2)' }}>
            {(user.name ?? user.email)[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{user.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>
              {user.email}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {[
            { label: 'Full name', value: user.name ?? '—' },
            { label: 'Email', value: user.email },
            { label: 'Role', value: user.role },
            { label: 'User ID', value: user.id },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
              <span style={{ color: 'var(--text)', fontFamily: label === 'User ID' ? 'monospace' : 'inherit', fontSize: label === 'User ID' ? 11 : 13 } as React.CSSProperties}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
