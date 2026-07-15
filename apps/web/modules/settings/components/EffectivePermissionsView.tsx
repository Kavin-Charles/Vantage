'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getUserRoles } from '@vencore/api-client';

export function EffectivePermissionsView({ userId }: { userId: string }) {
  const getToken = useApiToken();
  const { data, isLoading } = useQuery({
    queryKey: ['user-roles', userId],
    queryFn: async () => getUserRoles(await getToken(), userId),
  });

  if (isLoading) return <div className="skeleton" style={{ height: 160 }} />;

  if (data?.data.isAdmin) {
    return (
      <div style={{ padding: 16, background: 'var(--surface2)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text2)' }}>
        This user is an Administrator — full access to everything.
      </div>
    );
  }

  const modules = data?.data.modules ?? [];
  const grantedModules = modules
    .map(mod => ({ mod, granted: mod.groups.flatMap(g => g.permissions).filter(p => p.granted) }))
    .filter(entry => entry.granted.length > 0);

  if (!grantedModules.length) {
    return (
      <div style={{ padding: 16, background: 'var(--surface2)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text3)' }}>
        No permissions granted through this user's roles.
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {grantedModules.map(({ mod, granted }) => (
        <div key={mod.id}>
          <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>{mod.name}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {granted.map(p => (
              <code
                key={p.key}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px',
                  borderRadius: 'var(--radius-pill)', background: 'var(--green-bg)', color: 'var(--green)',
                }}
              >
                {p.key}
              </code>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
