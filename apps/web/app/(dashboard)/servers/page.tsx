'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/modules/shared/components/Topbar';
import { Button } from '@/modules/shared/components/ui/Button';
import { Modal } from '@/modules/shared/components/ui/Modal';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { FormField, Input } from '@/modules/shared/components/ui/FormField';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { AgentInstallInstructions } from '@/modules/shared/components/ui/AgentInstallInstructions';
import { listServers, createServer, deleteServer } from '@/modules/servers/lib/servers';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import { useServerMetrics } from '@/modules/shared/contexts/ServerMetricsContext';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import type { Server } from '@vencore/types';

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

const COLS = '1.4fr 1fr .8fr .8fr .8fr 1fr 1fr auto';

const eyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1.4,
};

export default function ServersPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const router = useRouter();
  const [modal, setModal] = useState<'create' | { token: string; name: string } | null>(null);
  const [form, setForm] = useState({ name: '', region: '', ip_address: '' });
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const { data, isLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => listServers(await getToken()),
    refetchInterval: 30_000,
  });

  const createMut = useMutation({
    mutationFn: async () => createServer(await getToken(), { name: form.name, region: form.region || undefined, ip_address: form.ip_address || undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['servers'] });
      setModal({ token: res.data.agent_token, name: res.data.name });
      setForm({ name: '', region: '', ip_address: '' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteServer(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  });

  const servers: Server[] = data?.data ?? [];

  return (
    <ModuleGuard moduleId="servers">
      <Topbar action={<Button variant="primary" onClick={() => setModal('create')}>+ Add Server</Button>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>{servers.length} servers</div>

        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '11px 18px', borderBottom: '1px solid var(--border)', gap: 14, alignItems: 'center' }}>
            {['Name', 'Status', 'CPU', 'Mem', 'Disk', 'Region', 'Last ping'].map(h => (
              <span key={h} style={eyebrow}>{h}</span>
            ))}
            <span />
          </div>

          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
          ) : servers.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No servers yet. Add one to start monitoring.</div>
          ) : servers.map((s, i) => (
            <ServerRow
              key={s.id}
              server={s}
              last={i === servers.length - 1}
              onClick={() => router.push(`/servers/${s.id}`)}
              onDelete={() => { if (confirm('Deregister this server?')) deleteMut.mutate(s.id); }}
              onContextMenu={(e) => {
                const items: ContextMenuItem[] = [
                  { icon: 'open',     label: 'Open server',       onClick: () => router.push(`/servers/${s.id}`) },
                  { type: 'separator' },
                  ...(s.ip_address ? [{ icon: 'copy', label: 'Copy IP address',  onClick: () => navigator.clipboard.writeText(s.ip_address!) } as ContextMenuItem] : []),
                  { icon: 'copy',     label: 'Copy agent token',  onClick: () => navigator.clipboard.writeText(s.agent_token ?? '') },
                  { type: 'separator' },
                  { icon: 'trash',    label: 'Remove server',     danger: true, onClick: () => { if (confirm('Deregister this server?')) deleteMut.mutate(s.id); } },
                ];
                openMenu(e, items);
              }}
            />
          ))}
        </div>
      </div>

      {modal === 'create' && (
        <Modal title="Add server" onClose={() => setModal(null)}>
          <form onSubmit={e => { e.preventDefault(); createMut.mutate(); }}>
            <FormField label="Server name *">
              <Input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="prod-web-01" />
            </FormField>
            <FormField label="Region">
              <Input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} placeholder="us-east-1" />
            </FormField>
            <FormField label="IP address">
              <Input value={form.ip_address} onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))} placeholder="10.0.0.1" />
            </FormField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button type="button" onClick={() => setModal(null)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create server'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {modal && typeof modal === 'object' && (
        <Modal title={`Agent token for ${modal.name}`} onClose={() => setModal(null)}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Copy this token now — it won't be shown again.
          </p>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', marginBottom: 16 }}>
            {modal.token}
          </div>
          <AgentInstallInstructions token={modal.token} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button variant="primary" onClick={() => setModal(null)}>Done</Button>
          </div>
        </Modal>
      )}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </ModuleGuard>
  );
}

const metricColor = (n: number | null) =>
  n === null ? 'var(--text3)' : n > 85 ? 'var(--red)' : n > 70 ? 'var(--amber)' : 'var(--text)';

function ServerRow({ server: s, last, onClick, onDelete, onContextMenu }: {
  server: Server; last: boolean;
  onClick: () => void; onDelete: () => void; onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  const live = useServerMetrics(s.id);

  const cpu = live?.cpu_pct ?? s.cpu_pct;
  const mem = live?.mem_pct ?? s.mem_pct;
  const disk = live?.disk_pct ?? s.disk_pct;
  const status = live?.status ?? s.status;
  const lastPing = live?.last_ping_at ?? s.last_ping_at;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        display: 'grid', gridTemplateColumns: COLS,
        gap: 14, alignItems: 'center',
        padding: '12px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s',
        cursor: 'pointer', fontSize: 13,
      }}
    >
      <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text)' }}>{s.name}</span>
      <span><Badge label={status} color={statusColor[status] ?? 'gray'} /></span>
      <span style={{ color: metricColor(cpu), fontVariantNumeric: 'tabular-nums' }}>{cpu !== null ? `${cpu}%` : '—'}</span>
      <span style={{ color: metricColor(mem), fontVariantNumeric: 'tabular-nums' }}>{mem !== null ? `${mem}%` : '—'}</span>
      <span style={{ color: metricColor(disk), fontVariantNumeric: 'tabular-nums' }}>{disk !== null ? `${disk}%` : '—'}</span>
      <span style={{ color: 'var(--text2)' }}>{s.region ?? '—'}</span>
      <span style={{ color: 'var(--text2)' }}>{timeAgo(lastPing)}</span>
      <span onClick={e => e.stopPropagation()}>
        <Button onClick={onDelete} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12 }}>Remove</Button>
      </span>
    </div>
  );
}
