'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import type { User } from '@vencore/types';

export default function TeamPage() {
  const getToken = useApiToken();
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => apiFetch<{ data: { user: User; workspace: { name: string; plan: string; contact_count: number } }; error: null }>('/api/me', { token: await getToken() }),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () =>
      apiFetch<{ data: User[]; error: null }>('/api/users', { token: await getToken() }),
  });
  const users = usersData?.data ?? [];

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

          {users.length > 0 && (
            <div style={card}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Team Members</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {users.map(u => (
                  <div
                    key={u.id}
                    onContextMenu={(e) => {
                      const items: ContextMenuItem[] = [
                        { icon: 'user', label: u.name, disabled: true, onClick: () => {} },
                        { type: 'separator' },
                        { icon: 'copy', label: 'Copy email', onClick: () => navigator.clipboard.writeText(u.email) },
                        { icon: 'copy', label: 'Copy name',  onClick: () => navigator.clipboard.writeText(u.name) },
                        ...(currentUser?.role === 'admin' ? [
                          { type: 'separator' as const },
                          {
                            type: 'submenu' as const,
                            icon: 'shield',
                            label: 'Change role',
                            items: [
                              { label: 'Admin',  swatch: '#6366f1', onClick: () => {} },
                              { label: 'Member', swatch: '#94a3b8', onClick: () => {} },
                            ],
                          },
                        ] : []),
                      ];
                      openMenu(e, items);
                    }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 8, padding: '6px 8px', margin: '-6px -8px', cursor: 'default' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = ''; }}
                  >
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{u.email}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12, color: 'var(--text3)', textTransform: 'capitalize' }}>{u.role}</span>
                      {currentUser?.role === 'admin' && (
                        <a
                          href={`/settings/users/${u.id}`}
                          style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none' }}
                        >
                          Roles
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
