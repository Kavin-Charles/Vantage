'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';
import { Badge, statusColor } from '@/components/ui/Badge';
import type { User } from '@vantage/types';

export default function TeamPage() {
  const getToken = useApiToken();

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => apiFetch<{ data: { user: User; workspace: { name: string; plan: string; contact_count: number } }; error: null }>('/api/me', { token: await getToken() }),
  });

  const workspace = data?.data?.workspace;
  const currentUser = data?.data?.user;

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
    marginBottom: 16,
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Team & Workspace</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Your workspace details and role.
      </p>

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {workspace && (
            <div style={card}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 16 }}>Workspace</div>
              <div style={{ display: 'grid', gap: 0 }}>
                {[
                  { label: 'Name', value: workspace.name },
                  { label: 'Plan', value: <Badge label={workspace.plan} color={workspace.plan === 'active' ? 'green' : workspace.plan === 'cancelled' ? 'red' : 'amber'} /> },
                  { label: 'Contacts', value: workspace.contact_count },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentUser && (
            <div style={card}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 16 }}>Your Role</div>
              <div style={{ display: 'grid', gap: 0 }}>
                {[
                  { label: 'Role', value: <Badge label={currentUser.role} color={currentUser.role === 'admin' ? 'purple' : 'gray'} /> },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: 13 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p style={{ fontSize: 12, color: 'var(--text3)' }}>
            Team invitations and multi-seat management coming soon.
          </p>
        </>
      )}
    </div>
  );
}
