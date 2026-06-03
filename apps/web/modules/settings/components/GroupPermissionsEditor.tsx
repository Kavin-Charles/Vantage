'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { PermissionBlock } from './PermissionBlock';

interface PermEntry {
  key: string;
  label: string;
  granted: boolean;
}

interface ModuleBlock {
  id: string;
  name: string;
  permissions: PermEntry[];
  moduleEnabled?: boolean;
}

interface PluginBlock {
  id: string;
  name: string;
  icon: string | null;
  permissions: PermEntry[];
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
      apiFetch<{
        data: {
          permissions: { modules: ModuleBlock[]; plugins: PluginBlock[] };
          members: unknown[];
        };
        error: null;
      }>(
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

  const modules = data.data.permissions.modules ?? [];
  const plugins = data.data.permissions.plugins ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {modules.map((mod) => (
        <PermissionBlock
          key={mod.id}
          title={mod.name}
          permissions={mod.permissions}
          onToggle={(key, granted) => mutation.mutate({ permission: key, granted })}
        />
      ))}

      {plugins.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
          <p
            style={{
              margin: '0 0 16px', fontSize: 12, fontWeight: 600, color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}
          >
            Plugin Permissions
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {plugins.map((plugin) => (
              <PermissionBlock
                key={plugin.id}
                title={plugin.name}
                permissions={plugin.permissions}
                onToggle={(key, granted) => mutation.mutate({ permission: key, granted })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
