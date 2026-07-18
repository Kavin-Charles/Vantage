'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRole, listRoles, addInheritance, removeInheritance } from '@vencore/api-client';

export function RoleInheritancePanel({ roleId }: { roleId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [childId, setChildId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const role = useQuery({ queryKey: ['role', roleId], queryFn: async () => getRole(await getToken(), roleId) });
  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => listRoles(await getToken()) });

  const add = useMutation({
    mutationFn: async (child: string) => addInheritance(await getToken(), roleId, child),
    onSuccess: () => {
      setError(null);
      setChildId('');
      void qc.invalidateQueries({ queryKey: ['role', roleId] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Cannot add (cycle or SoD conflict)'),
  });
  const remove = useMutation({
    mutationFn: async (child: string) => removeInheritance(await getToken(), roleId, child),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['role', roleId] }),
  });

  if (role.isLoading) return <div className="skeleton" style={{ height: 120 }} />;

  const children = role.data?.data.inheritance.children ?? [];
  const byId = new Map((roles.data?.data ?? []).map(r => [r.id, r.name]));
  const candidates = (roles.data?.data ?? []).filter(r => r.id !== roleId && !children.includes(r.id));

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
        This role inherits all permissions of its child roles.
      </p>
      {children.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>No inherited roles yet.</p>
      )}
      {children.map(c => (
        <div
          key={c}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          }}
        >
          <span style={{ fontSize: 13 }}>↳ {byId.get(c) ?? c}</span>
          <button
            onClick={() => remove.mutate(c)}
            disabled={remove.isPending}
            style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Remove
          </button>
        </div>
      ))}
      {error && (
        <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
          {error}
        </div>
      )}
      {candidates.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <select
            value={childId}
            onChange={e => setChildId(e.target.value)}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
            }}
          >
            <option value="">Inherit a role…</option>
            {candidates.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button
            onClick={() => childId && add.mutate(childId)}
            disabled={!childId || add.isPending}
            style={{
              padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--text)',
              color: 'var(--bg)', fontSize: 13, cursor: !childId || add.isPending ? 'not-allowed' : 'pointer',
              opacity: !childId || add.isPending ? 0.6 : 1,
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
