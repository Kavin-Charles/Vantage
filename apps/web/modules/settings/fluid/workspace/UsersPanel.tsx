'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { apiFetch } from '@/modules/shared/lib/api';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';
import { InviteUserModal } from '@/modules/settings/components/InviteUserModal';
import {
  PageHeader, FluidTable, FluidButton, FluidBadge, Avatar, EmptyState,
  type FluidColumn,
} from '@/modules/shared/fluid/ui';
import type { User } from '@vencore/types';

interface UserWithActive extends User {
  is_active: boolean;
  isAdmin: boolean;
}

/**
 * Fluid Users settings panel — registered into the Foundation settings
 * registry (workspace scope, admin-only). Takes no props; mounted directly
 * by apps/web/app/(fluid)/settings/users/page.tsx.
 *
 * Reuses the exact backend surface as the legacy
 * apps/web/app/(dashboard)/settings/(users-roles)/users/page.tsx it replaces:
 *   - GET    /api/users        → list of workspace members
 *   - GET    /api/config       → smtp_configured (invite vs. add-user copy)
 *   - PATCH  /api/users/:id    → { is_active } toggle
 *   - DELETE /api/users/:id    → remove member
 *   - POST   /api/invites      → via InviteUserModal (restyled in place, no
 *     other importers so it was safe to convert to Fluid primitives directly)
 */
export function UsersPanel() {
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
  const adminCount = users.filter(u => u.isAdmin && u.is_active).length;

  const columns: FluidColumn<UserWithActive>[] = [
    {
      key: 'member',
      header: 'Member',
      render: u => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: u.is_active ? 1 : 0.5 }}>
          <Avatar name={u.name} size={32} />
          <div>
            <div style={{ fontWeight: 600 }}>
              {u.name} {u.id === currentUser?.id && (
                <span style={{ fontWeight: 400, color: 'var(--fl-on-surface-variant)' }}>(you)</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)' }}>{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: 110,
      render: u => <FluidBadge tone={u.isAdmin ? 'blue' : 'neutral'}>{u.isAdmin ? 'Admin' : 'Member'}</FluidBadge>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 100,
      render: u => (u.is_active ? <FluidBadge tone="green">Active</FluidBadge> : <FluidBadge tone="gold">Inactive</FluidBadge>),
    },
    {
      key: 'actions',
      header: '',
      width: 200,
      render: u => {
        const isSelf = u.id === currentUser?.id;
        const cantRemove = isSelf || (u.isAdmin && adminCount <= 1);
        return (
          <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end' }}>
            <button
              onClick={e => { e.stopPropagation(); patchUser.mutate({ id: u.id, body: { is_active: !u.is_active } }); }}
              disabled={isSelf}
              style={{
                fontFamily: 'var(--fl-font-body)', fontSize: 13, fontWeight: 600, color: 'var(--fl-on-surface-variant)',
                background: 'none', border: 'none', cursor: isSelf ? 'not-allowed' : 'pointer', opacity: isSelf ? 0.4 : 1,
              }}
            >
              {u.is_active ? 'Deactivate' : 'Reactivate'}
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                askConfirm({
                  title: 'Remove member',
                  message: `Remove ${u.name} from this workspace?`,
                  confirmLabel: 'Remove',
                  variant: 'danger',
                  onConfirm: () => deleteUser.mutate(u.id),
                });
              }}
              disabled={cantRemove}
              title={cantRemove ? (isSelf ? "Can't remove yourself" : "Can't remove last admin") : undefined}
              style={{
                fontFamily: 'var(--fl-font-body)', fontSize: 13, fontWeight: 600, color: 'var(--fl-error)',
                background: 'none', border: 'none', cursor: cantRemove ? 'not-allowed' : 'pointer', opacity: cantRemove ? 0.4 : 1,
              }}
            >
              Remove
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Manage workspace members."
        actions={
          <FluidButton icon="person_add" onClick={() => setShowInvite(true)}>
            {hasSMTP ? 'Invite User' : 'Add User'}
          </FluidButton>
        }
      />

      {isLoading ? (
        <EmptyState icon="hourglass_empty" title="Loading…" />
      ) : users.length === 0 ? (
        <EmptyState icon="group" title="No members yet" message="Invite someone to get started." />
      ) : (
        <FluidTable
          columns={columns}
          rows={users}
          rowKey={u => u.id}
          onRowClick={u => router.push(`/settings/users/${u.id}`)}
        />
      )}

      {showInvite && <InviteUserModal hasSMTP={hasSMTP} onClose={() => setShowInvite(false)} />}
      {confirmEl}
    </>
  );
}
