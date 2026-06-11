'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listServers } from '@/modules/servers/lib/servers';
import { Badge } from '@/modules/shared/components/ui/Badge';
import { WidgetSkeleton, WidgetError, Stat, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';
import type { Server } from '@vencore/types';

export function ServersWidget() {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'servers'],
    queryFn: async () => listServers(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('servers'),
  });

  if (!isEnabled('servers')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const servers: Server[] = data?.data ?? [];

  if (servers.length === 0) {
    return <EmptyState href="/servers" label="Connect your first server" />;
  }

  const online = servers.filter(s => s.status === 'online').length;
  const degraded = servers.filter(s => s.status === 'degraded').length;
  const offline = servers.filter(s => s.status === 'offline' || s.status === 'stopped').length;

  const top5 = servers.slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', gap: 20 }}>
        <Stat label="Online" value={online} color="var(--green)" />
        <Stat label="Degraded" value={degraded} color="var(--amber)" />
        <Stat label="Offline" value={offline} color="var(--red)" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {top5.map((s: Server, i: number) => (
          <button
            key={s.id}
            onClick={() => router.push(`/servers/${s.id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 4px',
              borderBottom: i < top5.length - 1 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer',
              borderRadius: 4,
              background: 'transparent',
              border: 'none',
              width: '100%',
              textAlign: 'left',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: s.status === 'online' ? 'var(--green)' : s.status === 'degraded' ? 'var(--amber)' : 'var(--red)',
            }} />
            <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.name}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }}>
              {s.cpu_pct != null ? `CPU ${Math.round(s.cpu_pct)}%` : '—'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }}>
              {s.mem_pct != null ? `MEM ${Math.round(s.mem_pct)}%` : '—'}
            </span>
            <Badge
              label={s.status}
              color={s.status === 'online' ? 'green' : s.status === 'degraded' ? 'amber' : s.status === 'stopped' ? 'gray' : 'red'}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
