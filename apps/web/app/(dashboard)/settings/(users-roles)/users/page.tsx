'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { apiFetch } from '@/modules/shared/lib/api';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';
import { InviteUserModal } from '@/modules/settings/components/InviteUserModal';
import type { User } from '@vencore/types';

interface UserWithActive extends User {
  is_active: boolean;
  isAdmin: boolean;
}

export default function UsersPage() {
  const getToken = useApiToken();
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const { ask: askConfirm, el: confirmEl } = useConfirm();

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () =>
      apiFetch<{ data: UserWithActive[]; error: null }>('/api/users', { token: await getToken() }),
  });

  const { data: configData } = useQuery({
    queryKey: ['config', 'smtp'],
    queryFn: async () =>
      apiFetch<{ data: { smtp_configured: boolean } }>('/api/config'),
  });

  const hasSMTP = configData?.data?.smtp_configured ?? false;

  const patchUser = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<UserWithActive> }) => {
      const token = await getToken();
      return apiFetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(body), token });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return apiFetch(`/api/users/${id}`, { method: 'DELETE', token });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const users = usersData?.data ?? [];

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 0', borderBottom: '1px solid var(--border)',
  };

  const badgeStyle = (color: string, bg: string): React.CSSProperties => ({
    fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
    color, background: bg, textTransform: 'uppercase',
  });

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Users</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text2)' }}>
            Manage workspace members.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: 13, cursor: 'pointer' }}
        >
          {hasSMTP ? '+ Invite User' : '+ Add User'}
        </button>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div>
          {users.map(u => {
            const isSelf = u.id === currentUser?.id;
            const adminCount = users.filter(x => x.isAdmin && x.is_active).length;
            const cantRemove = isSelf || (u.isAdmin && adminCount <= 1);

            return (
              <div
                key={u.id}
                onClick={() => router.push(`/settings/users/${u.id}`)}
                style={{ ...rowStyle, opacity: u.is_active ? 1 : 0.5, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: 'var(--surface2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600, color: 'var(--text)',
                  }}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name} {isSelf && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(you)</span>}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>{u.email}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={badgeStyle(u.isAdmin ? 'var(--blue)' : 'var(--text3)', u.isAdmin ? 'var(--blue-bg)' : 'var(--surface2)')}>
                    {u.isAdmin ? 'Admin' : 'Member'}
                  </span>
                  {!u.is_active && (
                    <span style={badgeStyle('var(--amber)', 'var(--amber-bg)')}>Inactive</span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); patchUser.mutate({ id: u.id, body: { is_active: !u.is_active } }); }}
                    disabled={isSelf}
                    style={{ fontSize: 12, color: 'var(--text2)', background: 'none', border: 'none', cursor: isSelf ? 'not-allowed' : 'pointer', opacity: isSelf ? 0.4 : 1 }}
                  >
                    {u.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); askConfirm({ title: 'Remove member', message: `Remove ${u.name} from this workspace?`, confirmLabel: 'Remove', variant: 'danger', onConfirm: () => deleteUser.mutate(u.id) }); }}
                    disabled={cantRemove}
                    style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: cantRemove ? 'not-allowed' : 'pointer', opacity: cantRemove ? 0.4 : 1 }}
                    title={cantRemove ? (isSelf ? "Can't remove yourself" : "Can't remove last admin") : undefined}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showInvite && <InviteUserModal hasSMTP={hasSMTP} onClose={() => setShowInvite(false)} />}
      {confirmEl}
    </div>
  );
}
