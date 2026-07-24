'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRole, setRolePermissions } from '@vencore/api-client';
import { PermissionRow } from './PermissionRow';
import { FluidInput } from '@/modules/shared/fluid/ui';

/**
 * Only used by the Fluid role-detail screen (RoleDetailScreen) — restyled to
 * `--fl-*` in place since it had no other importers.
 */
export function RoleMatrixEditor({ roleId }: { roleId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['role', roleId],
    queryFn: async () => getRole(await getToken(), roleId),
  });

  const toggle = useMutation({
    mutationFn: async ({ permission, granted }: { permission: string; granted: boolean }) =>
      setRolePermissions(await getToken(), roleId, { permission, granted }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['role', roleId] }),
  });

  const modules = useMemo(() => {
    const mods = data?.data.modules ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return mods;
    return mods
      .map((m) => ({
        ...m,
        groups: m.groups
          .map((g) => ({
            ...g,
            permissions: g.permissions.filter(
              (p) => p.key.toLowerCase().includes(needle) || p.label.toLowerCase().includes(needle),
            ),
          }))
          .filter((g) => g.permissions.length > 0),
      }))
      .filter((m) => m.groups.length > 0);
  }, [data, q]);

  if (isLoading) return <div className="skeleton" style={{ height: 240 }} />;

  const grantAll = (keys: string[], granted: boolean) =>
    keys.forEach((k) => toggle.mutate({ permission: k, granted }));

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <FluidInput value={q} onChange={setQ} placeholder="Search permissions…" icon="search" />
      {modules.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--fl-outline)' }}>No permissions match &ldquo;{q}&rdquo;.</p>
      )}
      {modules.map((mod) => (
        <div key={mod.id}>
          <p
            style={{
              position: 'sticky', top: 0, background: 'var(--fl-surface-container-lowest)', margin: '0 0 8px',
              fontSize: 13, fontWeight: 700, zIndex: 1, color: 'var(--fl-on-surface)',
            }}
          >
            {mod.name}
          </p>
          {mod.groups.map((g) => {
            const editable = g.permissions.filter((p) => !p.inherited);
            const allOn = editable.length > 0 && editable.every((p) => p.granted);
            const someOn = editable.some((p) => p.granted);
            return (
              <div key={g.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                  <span
                    style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--fl-on-surface-variant)', textTransform: 'uppercase',
                      letterSpacing: '.04em',
                    }}
                  >
                    {g.label}
                  </span>
                  {editable.length > 0 && (
                    <button
                      onClick={() => grantAll(editable.map((p) => p.key), !allOn)}
                      style={{
                        fontSize: 11, color: 'var(--fl-on-surface-variant)', background: 'none', border: '1px solid var(--fl-outline-variant)',
                        borderRadius: 'var(--fl-radius-pill)', padding: '2px 8px', cursor: 'pointer',
                      }}
                    >
                      {allOn ? 'Clear all' : someOn ? 'Grant rest' : 'Grant all'}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {g.permissions.map((p) => (
                    <PermissionRow key={p.key} perm={p} onToggle={(permission, granted) => toggle.mutate({ permission, granted })} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
