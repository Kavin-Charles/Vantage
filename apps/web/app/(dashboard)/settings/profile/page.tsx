'use client';

import { useUser } from '@clerk/nextjs';

export default function ProfilePage() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;
  if (!user) return null;

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '20px 24px',
    marginBottom: 16,
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Profile</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Your account details from Clerk.
      </p>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          {user.imageUrl ? (
            <img src={user.imageUrl} alt="avatar" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600, color: 'var(--text2)' }}>
              {(user.fullName ?? user.firstName ?? 'U')[0].toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{user.fullName ?? user.firstName}</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>
              {user.primaryEmailAddress?.emailAddress}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {[
            { label: 'Full name', value: user.fullName ?? '—' },
            { label: 'Email', value: user.primaryEmailAddress?.emailAddress ?? '—' },
            { label: 'User ID', value: user.id },
            { label: 'Created', value: user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: label === 'User ID' ? 'monospace' : 'inherit', fontSize: label === 'User ID' ? 11 : 13 } as React.CSSProperties}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text3)' }}>
        To update your name or email, visit{' '}
        <a href="https://accounts.clerk.dev" target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>
          Clerk account settings
        </a>.
      </p>
    </div>
  );
}
