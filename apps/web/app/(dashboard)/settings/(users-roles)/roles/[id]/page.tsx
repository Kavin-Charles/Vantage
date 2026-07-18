'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRole, deleteRole } from '@vencore/api-client';
import { RoleMatrixEditor } from '@/modules/settings/components/RoleMatrixEditor';
import { RoleMembersPanel } from '@/modules/settings/components/RoleMembersPanel';
import { RoleInheritancePanel } from '@/modules/settings/components/RoleInheritancePanel';
import { RoleBadges } from '@/modules/settings/components/RoleBadges';

type Tab = 'permissions' | 'members' | 'inheritance';

export default function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('permissions');

  const { data, isLoading } = useQuery({
    queryKey: ['role', id],
    queryFn: async () => getRole(await getToken(), id),
  });
  const role = data?.data;

  const remove = useMutation({
    mutationFn: async () => deleteRole(await getToken(), id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['roles'] });
      router.push('/settings/roles');
    },
  });

  if (isLoading) {
    return (
      <div style={{ maxWidth: 720 }}>
        <div className="skeleton" style={{ height: 32, width: 240, marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 240 }} />
      </div>
    );
  }

  if (!role) {
    return (
      <div style={{ maxWidth: 720 }}>
        <Link href="/settings/roles" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none' }}>← Roles</Link>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 16 }}>Role not found.</p>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/settings/roles" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none' }}>← Roles</Link>
          <span style={{ color: 'var(--text3)' }}>/</span>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: role.color, flexShrink: 0 }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>{role.name}</span>
          <RoleBadges role={role} />
        </div>
        {!role.is_system && (
          <button
            onClick={() => {
              if (confirm(`Delete "${role.name}"? This cannot be undone.`)) remove.mutate();
            }}
            disabled={remove.isPending}
            style={{
              fontSize: 12, color: 'var(--red)', background: 'none', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '5px 10px', cursor: remove.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            Delete role
          </button>
        )}
      </div>

      {role.description && (
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>{role.description}</p>
      )}
      {role.max_members != null && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text3)' }}>
          Limited to {role.max_members} member{role.max_members === 1 ? '' : 's'}.
        </p>
      )}
      {role.is_system && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text3)' }}>
          System role — cannot be renamed or deleted.
        </p>
      )}

      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          {(['permissions', 'members', 'inheritance'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 14px', fontSize: 13, fontWeight: 500, textTransform: 'capitalize',
                color: tab === t ? 'var(--text)' : 'var(--text3)', background: 'none', border: 'none',
                borderBottom: tab === t ? '2px solid var(--text)' : '2px solid transparent', marginBottom: -1,
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === 'permissions' && (
          role.grants_all ? (
            <div style={{ padding: 16, background: 'var(--surface2)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text2)' }}>
              The Administrator role grants full access to everything. Its permissions are not editable.
            </div>
          ) : (
            <RoleMatrixEditor roleId={id} />
          )
        )}
        {tab === 'members' && <RoleMembersPanel roleId={id} />}
        {tab === 'inheritance' && <RoleInheritancePanel roleId={id} />}
      </div>
    </div>
  );
}
