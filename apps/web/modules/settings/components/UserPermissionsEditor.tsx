'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import type { PermissionEntry } from '@vantage/api-client';
import { MODULE_REGISTRY } from '@vantage/modules';

interface Props {
  userId: string;
  isAdmin: boolean;
}

export function UserPermissionsEditor({ userId, isAdmin }: Props) {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: async () =>
      apiFetch<{ data: { permissions: PermissionEntry[] }; error: null }>(
        `/api/users/${userId}/permissions`,
        { token: await getToken() },
      ),
  });

  const mutation = useMutation({
    mutationFn: async ({ permission, granted }: { permission: string; granted: boolean }) => {
      const token = await getToken();
      return apiFetch(`/api/users/${userId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permission, granted }),
        token,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-permissions', userId] });
    },
  });

  if (isAdmin) {
    return (
      <div style={{ padding: '16px', background: 'var(--surface2)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text2)' }}>
        Admin users have full access to all permissions.
      </div>
    );
  }

  if (isLoading || !data) {
    return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading permissions…</div>;
  }

  const permsByModule = new Map<string, PermissionEntry[]>();
  for (const p of data.data.permissions) {
    const arr = permsByModule.get(p.moduleId) ?? [];
    arr.push(p);
    permsByModule.set(p.moduleId, arr);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {MODULE_REGISTRY.map(mod => {
        const perms = permsByModule.get(mod.id) ?? [];
        if (perms.length === 0) return null;
        const moduleEnabled = perms[0]?.moduleEnabled ?? false;

        return (
          <div key={mod.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{mod.name}</span>
              {!moduleEnabled && (
                <span style={{ fontSize: 11, background: 'var(--surface2)', color: 'var(--text3)', padding: '2px 6px', borderRadius: 4 }}>
                  Module disabled
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {perms.map(p => (
                <div
                  key={p.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    opacity: moduleEnabled ? 1 : 0.5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13 }}>{p.label}</span>
                    {p.isOverride && (
                      <span style={{ fontSize: 10, background: 'var(--amber-bg)', color: 'var(--amber)', padding: '1px 5px', borderRadius: 3 }}>
                        Override
                      </span>
                    )}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: moduleEnabled ? 'pointer' : 'not-allowed' }}>
                    <input
                      type="checkbox"
                      checked={p.effectivelyGranted}
                      disabled={!moduleEnabled || mutation.isPending}
                      onChange={e => mutation.mutate({ permission: p.key, granted: e.target.checked })}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
