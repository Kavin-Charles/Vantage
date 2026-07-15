'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRole, addRoleMember, removeRoleMember } from '@vencore/api-client';
import { apiFetch } from '@/modules/shared/lib/api';
import type { User } from '@vencore/types';

export function RoleMembersPanel({ roleId }: { roleId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [addId, setAddId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const role = useQuery({ queryKey: ['role', roleId], queryFn: async () => getRole(await getToken(), roleId) });
  const users = useQuery({
    queryKey: ['users'],
    queryFn: async () => apiFetch<{ data: User[]; error: null }>('/api/users', { token: await getToken() }),
  });

  const add = useMutation({
    mutationFn: async (userId: string) => addRoleMember(await getToken(), roleId, userId),
    onSuccess: () => {
      setError(null);
      setAddId('');
      void qc.invalidateQueries({ queryKey: ['role', roleId] });
      void qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not add member'),
  });
  const remove = useMutation({
    mutationFn: async (userId: string) => removeRoleMember(await getToken(), roleId, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['role', roleId] });
      void qc.invalidateQueries({ queryKey: ['roles'] });
    },
  });

  if (role.isLoading) return <div className="skeleton" style={{ height: 120 }} />;

  const members = role.data?.data.members ?? [];
  const memberIds = new Set(members.map(m => m.id));
  const nonMembers = (users.data?.data ?? []).filter(u => !memberIds.has(u.id));

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {members.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>No members in this role yet.</p>
      )}
      {members.map(m => (
        <div
          key={m.id}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          }}
        >
          <span style={{ fontSize: 13 }}>
            {m.name} <span style={{ color: 'var(--text3)', marginLeft: 6 }}>{m.email}</span>
          </span>
          <button
            onClick={() => remove.mutate(m.id)}
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
      {nonMembers.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <select
            value={addId}
            onChange={e => setAddId(e.target.value)}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
            }}
          >
            <option value="">Add a member…</option>
            {nonMembers.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
          <button
            onClick={() => addId && add.mutate(addId)}
            disabled={!addId || add.isPending}
            style={{
              padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--text)',
              color: 'var(--bg)', fontSize: 13, cursor: !addId || add.isPending ? 'not-allowed' : 'pointer',
              opacity: !addId || add.isPending ? 0.6 : 1,
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
