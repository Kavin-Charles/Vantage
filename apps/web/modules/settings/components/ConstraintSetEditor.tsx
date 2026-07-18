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

const api = {
  ssd: { list: listSsdSets, create: createSsdSet, remove: deleteSsdSet },
  dsd: { list: listDsdSets, create: createDsdSet, remove: deleteDsdSet },
};

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
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
          }}
        >
          <span style={{ fontSize: 13 }}>
            <b>{s.name}</b>{' '}
            <span style={{ color: 'var(--text2)' }}>· at most {s.cardinality - 1} of {s.roleIds.length}</span>
          </span>
          <button
            onClick={() => remove.mutate(s.id)}
            disabled={remove.isPending}
            style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Delete
          </button>
        </div>
      ))}
      {sets.data?.data.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>No constraint sets yet.</p>
      )}
      <div style={{ padding: 12, background: 'var(--surface2)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Set name"
          style={{
            padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
          }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(roles.data?.data ?? []).filter(r => !r.grants_all).map(r => (
            <label
              key={r.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 8px',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)',
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
        <label style={{ fontSize: 12, color: 'var(--text2)' }}>
          Cardinality (min roles that conflict):{' '}
          <input
            type="number"
            min={2}
            value={cardinality}
            onChange={e => setCardinality(Number(e.target.value))}
            style={{
              width: 56, marginLeft: 6, padding: '4px 6px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
            }}
          />
        </label>
        {error && (
          <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
            {error}
          </div>
        )}
        <button
          onClick={() => create.mutate()}
          disabled={!name.trim() || roleIds.length < 2 || create.isPending}
          style={{
            alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'var(--text)', color: 'var(--bg)', fontSize: 13,
            cursor: !name.trim() || roleIds.length < 2 || create.isPending ? 'not-allowed' : 'pointer',
            opacity: !name.trim() || roleIds.length < 2 || create.isPending ? 0.6 : 1,
          }}
        >
          Create set
        </button>
      </div>
    </div>
  );
}
