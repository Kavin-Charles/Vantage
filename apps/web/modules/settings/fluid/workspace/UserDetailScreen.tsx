'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { PageHeader, GlassCard, Avatar, EmptyState, MSIcon } from '@/modules/shared/fluid/ui';
import { UserRoleAssignment } from '@/modules/settings/components/UserRoleAssignment';
import { EffectivePermissionsView } from '@/modules/settings/components/EffectivePermissionsView';
import type { User } from '@vencore/types';

/**
 * Fluid user-detail screen — registered as the [id] route under the Fluid
 * "users" settings entry. Mounted by
 * apps/web/app/(fluid)/settings/users/[id]/page.tsx.
 *
 * Reuses the exact backend surface and role-assignment widgets as the legacy
 * apps/web/app/(dashboard)/settings/(users-roles)/users/[id]/page.tsx it
 * replaces: there is no GET /api/users/:id endpoint, so — same as the legacy
 * page — this fetches the full GET /api/users list (query key ['users'],
 * shared with UsersPanel) and finds the matching record. Role assignment
 * (UserRoleAssignment) and effective-permissions (EffectivePermissionsView)
 * are reused unmodified — they already work standalone via the global
 * (non-Fluid) CSS variables and are wrapped in Fluid GlassCards here.
 */
export function UserDetailScreen({ id }: { id: string }) {
  const getToken = useApiToken();

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => apiFetch<{ data: User[]; error: null }>('/api/users', { token: await getToken() }),
  });
  const user = data?.data?.find(u => u.id === id);

  return (
    <>
      <Link
        href="/settings/users"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16,
          fontFamily: 'var(--fl-font-body)', fontSize: 13, fontWeight: 600,
          color: 'var(--fl-on-surface-variant)', textDecoration: 'none',
        }}
      >
        <MSIcon name="arrow_back" size={16} /> Users
      </Link>

      {isLoading ? (
        <EmptyState icon="hourglass_empty" title="Loading…" />
      ) : !user ? (
        <EmptyState icon="person_off" title="User not found" />
      ) : (
        <>
          <PageHeader title={user.name} subtitle={user.email} />

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
            <GlassCard>
              <h3 style={{ marginTop: 0, fontFamily: 'var(--fl-font-display)' }}>Roles</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>
                All access comes from roles — no per-user overrides.
              </p>
              <UserRoleAssignment userId={id} />

              <h3 style={{ margin: '24px 0 12px', fontFamily: 'var(--fl-font-display)' }}>Effective permissions</h3>
              <EffectivePermissionsView userId={id} />
            </GlassCard>

            <GlassCard>
              <h3 style={{ marginTop: 0, fontFamily: 'var(--fl-font-display)' }}>Member</h3>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Avatar name={user.name} size={48} />
                <div>
                  <div style={{ fontWeight: 600 }}>{user.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>{user.email}</div>
                </div>
              </div>
            </GlassCard>
          </div>
        </>
      )}
    </>
  );
}
