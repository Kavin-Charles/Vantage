'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRole, listRoles, addInheritance, removeInheritance } from '@vencore/api-client';
import { FluidSelect, FluidButton } from '@/modules/shared/fluid/ui';

/**
 * Only used by the Fluid role-detail screen (RoleDetailScreen) — restyled to
 * `--fl-*` in place since it had no other importers.
 */
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
      <p style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)', margin: 0 }}>
        This role inherits all permissions of its child roles.
      </p>
      {children.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--fl-outline)', margin: 0 }}>No inherited roles yet.</p>
      )}
      {children.map(c => (
        <div
          key={c}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px',
            background: 'var(--fl-surface-container-low)', border: '1px solid var(--fl-outline-variant)', borderRadius: 'var(--fl-radius-input)',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--fl-on-surface)' }}>↳ {byId.get(c) ?? c}</span>
          <button
            onClick={() => remove.mutate(c)}
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
      {candidates.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <FluidSelect
              value={childId}
              onChange={setChildId}
              options={[{ label: 'Inherit a role…', value: '' }, ...candidates.map(r => ({ label: r.name, value: r.id }))]}
            />
          </div>
          <FluidButton onClick={() => childId && add.mutate(childId)} disabled={!childId || add.isPending}>
            {add.isPending ? 'Adding…' : 'Add'}
          </FluidButton>
        </div>
      )}
    </div>
  );
}
