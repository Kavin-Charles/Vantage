'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  listRoles,
  listSsdSets,
  createSsdSet,
  deleteSsdSet,
  listDsdSets,
  createDsdSet,
  deleteDsdSet,
  type ConstraintSet,
} from '@vencore/api-client';
import { FluidInput, FluidButton } from '@/modules/shared/fluid/ui';

const api = {
  ssd: { list: listSsdSets, create: createSsdSet, remove: deleteSsdSet },
  dsd: { list: listDsdSets, create: createDsdSet, remove: deleteDsdSet },
};

/**
 * Only used by the Fluid roles-constraints screen (RoleConstraintsScreen) —
 * restyled to `--fl-*` in place since it had no other importers.
 */
export function ConstraintSetEditor({ kind }: { kind: 'ssd' | 'dsd' }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [cardinality, setCardinality] = useState(2);
  const [error, setError] = useState<string | null>(null);

  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => listRoles(await getToken()) });
  const sets = useQuery({ queryKey: [kind, 'sets'], queryFn: async () => api[kind].list(await getToken()) });

  const create = useMutation({
    mutationFn: async () => api[kind].create(await getToken(), { name, cardinality, roleIds }),
    onSuccess: () => {
      setError(null);
      setName('');
      setRoleIds([]);
      void qc.invalidateQueries({ queryKey: [kind, 'sets'] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Existing assignments already violate this set'),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api[kind].remove(await getToken(), id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [kind, 'sets'] }),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(sets.data?.data ?? []).map((s: ConstraintSet) => (
        <div
          key={s.id}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px',
            background: 'var(--fl-surface-container-low)', border: '1px solid var(--fl-outline-variant)', borderRadius: 'var(--fl-radius-input)',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--fl-on-surface)' }}>
            <b>{s.name}</b>{' '}
            <span style={{ color: 'var(--fl-on-surface-variant)' }}>· at most {s.cardinality - 1} of {s.roleIds.length}</span>
          </span>
          <button
            onClick={() => remove.mutate(s.id)}
            disabled={remove.isPending}
            style={{ fontSize: 12, color: 'var(--fl-error)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Delete
          </button>
        </div>
      ))}
      {sets.data?.data.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--fl-outline)', margin: 0 }}>No constraint sets yet.</p>
      )}
      <div style={{ padding: 16, background: 'var(--fl-surface-container-low)', borderRadius: 'var(--fl-radius-input)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FluidInput value={name} onChange={setName} placeholder="Set name" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(roles.data?.data ?? []).filter(r => !r.grants_all).map(r => (
            <label
              key={r.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 8px',
                border: '1px solid var(--fl-outline-variant)', borderRadius: 'var(--fl-radius-pill)', color: 'var(--fl-on-surface)',
              }}
            >
              <input
                type="checkbox"
                checked={roleIds.includes(r.id)}
                onChange={() => setRoleIds(p => (p.includes(r.id) ? p.filter(x => x !== r.id) : [...p, r.id]))}
              />
              {r.name}
            </label>
          ))}
        </div>
        <label style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)' }}>
          Cardinality (min roles that conflict):{' '}
          <input
            type="number"
            min={2}
            value={cardinality}
            onChange={e => setCardinality(Number(e.target.value))}
            style={{
              width: 56, marginLeft: 6, padding: '4px 6px', borderRadius: 'var(--fl-radius-input)',
              border: '1px solid var(--fl-outline-variant)', background: 'var(--fl-surface-container-lowest)', color: 'var(--fl-on-surface)',
            }}
          />
        </label>
        {error && (
          <div style={{ fontSize: 12, color: 'var(--fl-on-error-container)', background: 'var(--fl-error-container)', padding: '6px 10px', borderRadius: 'var(--fl-radius-input)' }}>
            {error}
          </div>
        )}
        <FluidButton
          onClick={() => create.mutate()}
          disabled={!name.trim() || roleIds.length < 2 || create.isPending}
          style={{ alignSelf: 'flex-start' }}
        >
          {create.isPending ? 'Creating…' : 'Create set'}
        </FluidButton>
      </div>
    </div>
  );
}
