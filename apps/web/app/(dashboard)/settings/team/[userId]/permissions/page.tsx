'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { User } from '@vantage/types';
import { UserPermissionsEditor } from '@/modules/settings/components/UserPermissionsEditor';

export default function UserPermissionsPage() {
  const { userId } = useParams<{ userId: string }>();
  const getToken = useApiToken();

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () =>
      apiFetch<{ data: User[]; error: null }>('/api/users', { token: await getToken() }),
  });

  const user = usersData?.data?.find(u => u.id === userId);

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <Link href="/settings/team" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none' }}>
          ← Team
        </Link>
        {user && (
          <>
            <span style={{ color: 'var(--text3)' }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</span>
          </>
        )}
      </div>

      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Permissions</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Manage what this user can do. Overrides apply on top of their role defaults.
      </p>

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : !user ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>User not found.</div>
      ) : (
        <UserPermissionsEditor userId={userId} isAdmin={user.role === 'admin'} />
      )}
    </div>
  );
}
