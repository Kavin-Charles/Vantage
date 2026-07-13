'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/modules/shared/components/Topbar';
import { Button } from '@/modules/shared/components/ui/Button';
import { Modal } from '@/modules/shared/components/ui/Modal';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { FormField, Input } from '@/modules/shared/components/ui/FormField';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { AgentInstallInstructions } from '@/modules/shared/components/ui/AgentInstallInstructions';
import { listServers, createServer, deleteServer } from '@/modules/infra/servers/lib/servers';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';
import { useServerMetrics } from '@/modules/shared/contexts/ServerMetricsContext';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import type { Server, ServerStatus } from '@vencore/types';

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const COLS = '1.4fr .9fr .7fr .7fr .7fr .7fr 1fr 1fr 32px';

const eyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1.4,
};

type SortKey = 'name' | 'status' | 'cpu_pct' | 'mem_pct' | 'disk_pct' | 'load_avg_1m' | 'region' | 'last_ping_at';
const STATUS_FILTERS: { value: 'all' | ServerStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'online', label: 'Online' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'offline', label: 'Offline' },
  { value: 'stopped', label: 'Stopped' },
];

const COLUMNS: { key: SortKey; label: string; sortable: boolean }[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'cpu_pct', label: 'CPU', sortable: true },
  { key: 'mem_pct', label: 'Mem', sortable: true },
  { key: 'disk_pct', label: 'Disk', sortable: true },
  { key: 'load_avg_1m', label: 'Load', sortable: true },
  { key: 'region', label: 'Region', sortable: true },
  { key: 'last_ping_at', label: 'Last ping', sortable: true },
];

export default function ServersPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const router = useRouter();
  const [modal, setModal] = useState<'create' | { token: string; name: string } | null>(null);
  const [form, setForm] = useState({ name: '', region: '', ip_address: '' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ServerStatus>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const { ask: askConfirm, el: confirmEl } = useConfirm();

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = servers.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q)
        || (s.region ?? '').toLowerCase().includes(q)
        || (s.ip_address ?? '').toLowerCase().includes(q)
        || (s.hostname ?? '').toLowerCase().includes(q);
    });
    const { key, dir } = sort;
    const mul = dir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });
    return rows;
  }, [servers, search, statusFilter, sort]);

  function toggleSort(key: SortKey) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }

  function rowMenu(s: Server): ContextMenuItem[] {
    return [
      { icon: 'open', label: 'Open server', onClick: () => router.push(`/infra/servers/${s.id}`) },
      { type: 'separator' },
      ...(s.ip_address ? [{ icon: 'copy', label: 'Copy IP address', onClick: () => navigator.clipboard.writeText(s.ip_address!) } as ContextMenuItem] : []),
      { type: 'separator' },
      { icon: 'trash', label: 'Remove server', danger: true, onClick: () => askConfirm({ title: 'Deregister server', message: `Deregister "${s.name}"? The monitoring agent will stop sending data.`, confirmLabel: 'Deregister', variant: 'danger', onConfirm: () => deleteMut.mutate(s.id) }) },
    ];
  }

  return (
    <ModuleGuard moduleId="infra:servers">
      <Topbar action={<Button variant="primary" onClick={() => setModal('create')}>+ Add Server</Button>} />
      <div style={{ padding: 24 }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, region, IP…"
            style={{ flex: '1 1 240px', maxWidth: 320, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}
          />
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {STATUS_FILTERS.map(f => (
              <button key={f.value} onClick={() => setStatusFilter(f.value)}
                style={{
                  padding: '7px 12px', fontSize: 12, fontWeight: statusFilter === f.value ? 600 : 400,
                  border: 'none', cursor: 'pointer',
                  background: statusFilter === f.value ? 'var(--text)' : 'var(--surface)',
                  color: statusFilter === f.value ? 'var(--bg)' : 'var(--text2)',
                }}>
                {f.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 13, color: 'var(--text3)', marginLeft: 'auto' }}>
            {filtered.length} of {servers.length}
          </span>
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '11px 18px', borderBottom: '1px solid var(--border)', gap: 14, alignItems: 'center' }}>
            {COLUMNS.map(c => (
              <button key={c.key} onClick={() => c.sortable && toggleSort(c.key)}
                style={{ ...eyebrow, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: c.sortable ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 3 }}>
                {c.label}
                {sort.key === c.key && <span style={{ color: 'var(--text2)' }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
              </button>
            ))}
            <span />
          </div>

          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
          ) : servers.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No servers yet. Add one to start monitoring.</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No servers match your filters.</div>
          ) : filtered.map((s, i) => (
            <ServerRow
              key={s.id}
              server={s}
              last={i === filtered.length - 1}
              onClick={() => router.push(`/infra/servers/${s.id}`)}
              onMenu={(e) => { e.preventDefault(); openMenu(e, rowMenu(s)); }}
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
            {createMut.isError && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>Could not create. Check the IP/hostname is valid.</div>}
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
            Copy this token now — it won&apos;t be shown again.
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
      {confirmEl}
    </ModuleGuard>
  );
}

const metricColor = (n: number | null) =>
  n === null ? 'var(--text3)' : n > 85 ? 'var(--red)' : n > 70 ? 'var(--amber)' : 'var(--text)';

function ServerRow({ server: s, last, onClick, onMenu }: {
  server: Server; last: boolean;
  onClick: () => void; onMenu: (e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  const live = useServerMetrics(s.id);

  const cpu = live?.cpu_pct ?? s.cpu_pct;
  const mem = live?.mem_pct ?? s.mem_pct;
  const disk = live?.disk_pct ?? s.disk_pct;
  const load = live?.load_avg_1m ?? s.load_avg_1m;
  const status = live?.status ?? s.status;
  const lastPing = live?.last_ping_at ?? s.last_ping_at;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      onContextMenu={onMenu}
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
      <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
      <span><Badge label={status} color={statusColor[status] ?? 'gray'} /></span>
      <span style={{ color: metricColor(cpu), fontVariantNumeric: 'tabular-nums' }}>{cpu !== null ? `${cpu}%` : '—'}</span>
      <span style={{ color: metricColor(mem), fontVariantNumeric: 'tabular-nums' }}>{mem !== null ? `${mem}%` : '—'}</span>
      <span style={{ color: metricColor(disk), fontVariantNumeric: 'tabular-nums' }}>{disk !== null ? `${disk}%` : '—'}</span>
      <span style={{ color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{load !== null ? load.toFixed(2) : '—'}</span>
      <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.region ?? '—'}</span>
      <span style={{ color: 'var(--text2)' }}>{timeAgo(lastPing)}</span>
      <button
        onClick={e => { e.stopPropagation(); onMenu(e); }}
        title="Actions"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, lineHeight: 1, padding: 0, opacity: hover ? 1 : 0 }}
      >⋯</button>
    </div>
  );
}
