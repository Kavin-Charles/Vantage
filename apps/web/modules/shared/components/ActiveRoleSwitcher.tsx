'use client';

import { useRef, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { getActiveRoles, setActiveRoles } from '@vencore/api-client';

export function ActiveRoleSwitcher() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { refetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const roles = useQuery({
    queryKey: ['active-roles'],
    queryFn: async () => getActiveRoles(await getToken()),
  });
  const assigned = roles.data?.data.assigned ?? [];

  const save = useMutation({
    mutationFn: async (roleIds: string[]) => setActiveRoles(await getToken(), roleIds),
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries({ queryKey: ['active-roles'] });
      await refetch();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Cannot activate these together (separation of duty)'),
  });

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  if (assigned.length <= 1) return null;

  const activeIds = assigned.filter(r => r.active).map(r => r.id);

  const toggle = (id: string) => {
    const next = new Set(activeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save.mutate([...next]);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 12, color: 'var(--text2)',
          background: open ? 'var(--surface2)' : 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '6px 12px', cursor: 'pointer',
        }}
        title="Active roles"
      >
        Active roles ({activeIds.length})
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          minWidth: 220,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-modal)',
          padding: 8, zIndex: 500,
        }}>
          {assigned.map(r => (
            <label
              key={r.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', fontSize: 13, color: 'var(--text)',
                cursor: save.isPending ? 'default' : 'pointer',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <input
                type="checkbox"
                checked={r.active}
                disabled={save.isPending}
                onChange={() => toggle(r.id)}
              />
              {r.name}
            </label>
          ))}
          {error && (
            <div style={{ fontSize: 11, color: 'var(--red)', padding: '6px 8px 2px' }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
