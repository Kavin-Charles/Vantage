'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';
import { MODULE_REGISTRY } from '@vantage/modules';

interface GroupPermEntry {
  permission: string;
  granted: boolean;
}

interface Props {
  groupId: string;
}

export function GroupPermissionsEditor({ groupId }: Props) {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['group', groupId],
    queryFn: async () =>
      apiFetch<{ data: { permissions: GroupPermEntry[]; members: unknown[] }; error: null }>(
        `/api/groups/${groupId}`,
        { token: await getToken() },
      ),
  });

  const mutation = useMutation({
    mutationFn: async ({ permission, granted }: { permission: string; granted: boolean }) => {
      const token = await getToken();
      return apiFetch(`/api/groups/${groupId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permission, granted }),
        token,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group', groupId] }),
  });

  if (isLoading || !data) {
    return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading permissions…</div>;
  }

  const permMap = new Map(data.data.permissions.map(p => [p.permission, p.granted]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {MODULE_REGISTRY.map(mod => (
        <div key={mod.id}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{mod.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mod.permissions.map(p => {
              const currentlyGranted = permMap.get(p.key) ?? false;
              const isSet = permMap.has(p.key);
              return (
                <div
                  key={p.key}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', background: 'var(--surface)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13 }}>{p.label}</span>
                    {isSet && (
                      <span style={{ fontSize: 10, background: 'var(--amber-bg)', color: 'var(--amber)', padding: '1px 5px', borderRadius: 3 }}>
                        Set
                      </span>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={currentlyGranted}
                    disabled={mutation.isPending}
                    onChange={e => mutation.mutate({ permission: p.key, granted: e.target.checked })}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
