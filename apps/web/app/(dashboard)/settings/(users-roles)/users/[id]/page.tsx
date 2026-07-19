'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import type { User } from '@vencore/types';
import { UserRoleAssignment } from '@/modules/settings/components/UserRoleAssignment';
import { EffectivePermissionsView } from '@/modules/settings/components/EffectivePermissionsView';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const getToken = useApiToken();

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => apiFetch<{ data: User[]; error: null }>('/api/users', { token: await getToken() }),
  });
  const user = data?.data?.find(u => u.id === id);

  return (
    <div className="fade-in" style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <Link href="/settings/users" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none' }}>← Users</Link>
        {user && (
          <>
            <span style={{ color: 'var(--text3)' }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</span>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="skeleton" style={{ height: 32, width: 240, marginBottom: 20 }} />
      ) : !user ? (
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>User not found.</p>
      ) : (
        <>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>{user.name}</h2>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>{user.email}</p>

          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Roles</h3>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text2)' }}>
            All access comes from roles — no per-user overrides.
          </p>
          <UserRoleAssignment userId={id} />

          <h3 style={{ margin: '24px 0 12px', fontSize: 14, fontWeight: 600 }}>Effective permissions</h3>
          <EffectivePermissionsView userId={id} />
        </>
      )}
    </div>
  );
}
