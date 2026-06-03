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
  userId: string;
  isAdmin: boolean;
}

export function UserPermissionsEditor({ userId, isAdmin }: Props) {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: async () =>
      apiFetch<{ data: { modules: ModuleBlock[]; plugins: PluginBlock[] }; error: null }>(
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {data.data.modules.map((mod) => (
        <PermissionBlock
          key={mod.id}
          title={mod.name}
          permissions={mod.permissions}
          onToggle={(key, granted) => mutation.mutate({ permission: key, granted })}
          disabled={isAdmin}
        />
      ))}

      {data.data.plugins.length > 0 && (
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
            {data.data.plugins.map((plugin) => (
              <PermissionBlock
                key={plugin.id}
                title={plugin.name}
                permissions={plugin.permissions}
                onToggle={(key, granted) => mutation.mutate({ permission: key, granted })}
                disabled={isAdmin}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
