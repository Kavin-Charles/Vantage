'use client';

import { use, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/modules/shared/components/Topbar';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { Button } from '@/modules/shared/components/ui/Button';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { getServer } from '@/modules/servers/lib/servers';
import { useServerMetrics } from '@/modules/shared/contexts/ServerMetricsContext';
import { OverviewTab } from '@/modules/servers/components/detail/OverviewTab';
import { ConsoleTab } from '@/modules/servers/components/detail/ConsoleTab';
import { TerminalTab } from '@/modules/servers/components/detail/TerminalTab';
import { ServicesTab } from '@/modules/servers/components/detail/ServicesTab';
import { LogsTab } from '@/modules/servers/components/detail/LogsTab';
import { FilesTab } from '@/modules/servers/components/detail/FilesTab';
import { DeploymentsTab } from '@/modules/servers/components/detail/DeploymentsTab';
import { AlertsTab } from '@/modules/servers/components/detail/AlertsTab';
import { EditServerModal } from '@/modules/servers/components/detail/EditServerModal';
import type { Server } from '@vencore/types';

type Tab = 'overview' | 'deployments' | 'alerts' | 'console' | 'terminal' | 'services' | 'logs' | 'files';
const SSH_TABS: Tab[] = ['console', 'terminal', 'services', 'logs', 'files'];

export default function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const getToken = useApiToken();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canSsh = hasPermission('servers:ssh');

  const [tab, setTab] = useState<Tab>('overview');
  const [consoleEverActive, setConsoleEverActive] = useState(false);
  const [filesEverActive, setFilesEverActive] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (tab === 'console') setConsoleEverActive(true);
    if (tab === 'files') setFilesEverActive(true);
  }, [tab]);

  const live = useServerMetrics(id);

  const { data, isLoading } = useQuery({
    queryKey: ['server', id],
    queryFn: async () => getServer(await getToken(), id),
    refetchInterval: 30_000,
  });

  const server = data?.data;

  if (isLoading) return <><Topbar /><div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div></>;
  if (!server) return <><Topbar /><div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Server not found.</div></>;

  const liveStatus = live?.status ?? server.status;
  const baseTabs: Tab[] = ['overview', 'deployments', 'alerts'];
  const tabs: Tab[] = canSsh ? [...baseTabs, ...SSH_TABS] : baseTabs;

  // Live-merged server for the overview header/details.
  const mergedServer: Server = {
    ...server,
    cpu_pct: live?.cpu_pct ?? server.cpu_pct,
    mem_pct: live?.mem_pct ?? server.mem_pct,
    disk_pct: live?.disk_pct ?? server.disk_pct,
    load_avg_1m: live?.load_avg_1m ?? server.load_avg_1m,
    uptime_seconds: live?.uptime_seconds ?? server.uptime_seconds,
    last_ping_at: live?.last_ping_at ?? server.last_ping_at,
    net_in_bytes: live?.net_in_bytes ?? server.net_in_bytes,
    net_out_bytes: live?.net_out_bytes ?? server.net_out_bytes,
    status: liveStatus,
  };

  return (
    <>
      <Topbar action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => router.push('/servers')}>← Servers</Button>
          <Button onClick={() => setEditOpen(true)}>Edit</Button>
        </div>
      } />
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{server.name}</h2>
          <Badge label={liveStatus} color={statusColor[liveStatus] ?? 'gray'} />
          {server.region && <span style={{ fontSize: 13, color: 'var(--text3)' }}>{server.region}</span>}
        </div>

        <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: 'none', border: 'none',
                borderBottom: tab === t ? '2px solid var(--text)' : '2px solid transparent',
                padding: '8px 16px', fontSize: 13,
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? 'var(--text)' : 'var(--text3)',
                cursor: 'pointer', textTransform: 'capitalize', marginBottom: -1,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab server={mergedServer} />}
        {tab === 'deployments' && <DeploymentsTab serverId={id} />}
        {tab === 'alerts' && <AlertsTab serverId={id} />}
        {canSsh && tab === 'terminal' && <TerminalTab serverId={id} />}
        {canSsh && tab === 'services' && <ServicesTab serverId={id} />}
        {canSsh && tab === 'logs' && <LogsTab serverId={id} />}
        {/* Console + Files: mount once, keep alive with CSS so the SSH/SFTP connection persists across tab switches. */}
        {canSsh && consoleEverActive && (
          <div style={{ display: tab === 'console' ? 'block' : 'none' }}>
            <ConsoleTab serverId={id} />
          </div>
        )}
        {canSsh && filesEverActive && (
          <div style={{ display: tab === 'files' ? 'block' : 'none' }}>
            <FilesTab serverId={id} />
          </div>
        )}
      </div>

      {editOpen && <EditServerModal server={server} onClose={() => setEditOpen(false)} />}
    </>
  );
}
