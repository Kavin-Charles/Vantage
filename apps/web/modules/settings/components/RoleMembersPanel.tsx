'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRole, addRoleMember, removeRoleMember } from '@vencore/api-client';
import { apiFetch } from '@/modules/shared/lib/api';
import { FluidSelect, FluidButton } from '@/modules/shared/fluid/ui';
import type { User } from '@vencore/types';

/**
 * Only used by the Fluid role-detail screen (RoleDetailScreen) — restyled to
 * `--fl-*` in place since it had no other importers.
 */
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
        <p style={{ fontSize: 13, color: 'var(--fl-outline)', margin: 0 }}>No members in this role yet.</p>
      )}
      {members.map(m => (
        <div
          key={m.id}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px',
            background: 'var(--fl-surface-container-low)', border: '1px solid var(--fl-outline-variant)', borderRadius: 'var(--fl-radius-input)',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--fl-on-surface)' }}>
            {m.name} <span style={{ color: 'var(--fl-outline)', marginLeft: 6 }}>{m.email}</span>
          </span>
          <button
            onClick={() => remove.mutate(m.id)}
            disabled={remove.isPending}
            style={{ fontSize: 12, color: 'var(--fl-error)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Remove
          </button>
        </div>
      ))}
      {error && (
        <div style={{ fontSize: 12, color: 'var(--fl-on-error-container)', background: 'var(--fl-error-container)', padding: '6px 10px', borderRadius: 'var(--fl-radius-input)' }}>
          {error}
        </div>
      )}
      {nonMembers.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <FluidSelect
              value={addId}
              onChange={setAddId}
              options={[{ label: 'Add a member…', value: '' }, ...nonMembers.map(u => ({ label: `${u.name} (${u.email})`, value: u.id }))]}
            />
          </div>
          <FluidButton onClick={() => addId && add.mutate(addId)} disabled={!addId || add.isPending}>
            {add.isPending ? 'Adding…' : 'Add'}
          </FluidButton>
        </div>
      )}
    </div>
  );
}
