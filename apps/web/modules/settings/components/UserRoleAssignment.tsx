'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getUserRoles, setUserRoles, listRoles } from '@vencore/api-client';

export function UserRoleAssignment({ userId }: { userId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const assigned = useQuery({
    queryKey: ['user-roles', userId],
    queryFn: async () => getUserRoles(await getToken(), userId),
  });
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: async () => listRoles(await getToken()),
  });

  const save = useMutation({
    mutationFn: async (roleIds: string[]) => setUserRoles(await getToken(), userId, roleIds),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['user-roles', userId] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Assignment blocked by a separation-of-duty rule'),
  });

  const current = new Set(assigned.data?.data.roleIds ?? []);
  const toggle = (roleId: string) => {
    const next = new Set(current);
    if (next.has(roleId)) next.delete(roleId);
    else next.add(roleId);
    save.mutate([...next]);
  };

  if (assigned.isLoading || roles.isLoading) {
    return <div className="skeleton" style={{ height: 120 }} />;
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(roles.data?.data ?? []).map(r => (
        <label
          key={r.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', cursor: save.isPending ? 'not-allowed' : 'pointer',
            opacity: save.isPending ? 0.6 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={current.has(r.id)}
            disabled={save.isPending}
            onChange={() => toggle(r.id)}
          />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
          {r.description && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{r.description}</span>}
        </label>
      ))}
      {error && (
        <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
