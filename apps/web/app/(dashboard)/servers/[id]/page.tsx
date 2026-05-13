'use client';

import { use, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/Topbar';
import { Badge, statusColor } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useApiToken } from '@/lib/useApiToken';
import { getServer } from '@/lib/servers';
import { openSshStream, getSshHistory } from '@/lib/ssh';
import type { Server, MetricsSnapshot, SshCommandLog } from '@vantage/types';

function Sparkline({ data, color = '#2d6a4f' }: { data: number[]; color?: string }) {
  if (data.length < 2) return <span style={{ color: 'var(--text3)', fontSize: 11 }}>no data</span>;
  const max = Math.max(...data, 1);
  const w = 120, h = 32, pad = 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = pad + (1 - v / max) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

function MetricCard({ label, value, unit, snapshots, color }: {
  label: string; value: number | null; unit: string; snapshots: number[]; color?: string;
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{value !== null ? `${value}${unit}` : '—'}</div>
      <Sparkline data={snapshots} color={color} />
    </div>
  );
}

type NumericMetric = 'cpu_pct' | 'mem_pct' | 'disk_pct' | 'load_avg_1m' | 'net_in_bytes' | 'net_out_bytes';

function snap(snapshots: MetricsSnapshot[], key: NumericMetric): number[] {
  return snapshots.map(s => Number(s[key]) || 0);
}

function OverviewTab({ server, snapshots }: {
  server: Server & { snapshots: MetricsSnapshot[] };
  snapshots: MetricsSnapshot[];
}) {
  return (
    <>
      {/* Metric sparklines */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <MetricCard label="CPU" value={server.cpu_pct} unit="%" snapshots={snap(snapshots, 'cpu_pct')} color="var(--blue)" />
        <MetricCard label="Memory" value={server.mem_pct} unit="%" snapshots={snap(snapshots, 'mem_pct')} color="var(--purple)" />
        <MetricCard label="Disk" value={server.disk_pct} unit="%" snapshots={snap(snapshots, 'disk_pct')} color="var(--amber)" />
        <MetricCard label="Load avg (1m)" value={server.load_avg_1m} unit="" snapshots={snap(snapshots, 'load_avg_1m')} color="var(--green)" />
      </div>

      {/* Meta */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Details</div>
        {[
          ['Uptime', server.uptime_seconds !== null ? `${Math.floor(server.uptime_seconds / 86400)}d ${Math.floor((server.uptime_seconds % 86400) / 3600)}h` : '—'],
          ['IP', server.ip_address ?? '—'],
          ['Last ping', server.last_ping_at ? new Date(server.last_ping_at).toLocaleString() : 'never'],
          ['Net in (interval)', server.net_in_bytes !== null ? `${(server.net_in_bytes / 1024).toFixed(1)} KB` : '—'],
          ['Net out (interval)', server.net_out_bytes !== null ? `${(server.net_out_bytes / 1024).toFixed(1)} KB` : '—'],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{value}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function TerminalTab({ serverId }: { serverId: string }) {
  const getToken = useApiToken();
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState<Array<{ type: string; text: string }>>([]);
  const [running, setRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [history, setHistory] = useState<SshCommandLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  async function fetchHistory() {
    const token = await getToken();
    const result = await getSshHistory(token, serverId);
    setHistory(result.data);
  }

  async function runCmd() {
    if (!command.trim() || running) return;
    setRunning(true);
    setOutput([]);
    setExitCode(null);
    const token = await getToken();

    openSshStream(
      `/api/servers/${serverId}/ssh/exec`,
      { command },
      token,
      (event) => {
        if (event.type === 'stdout' || event.type === 'stderr') {
          setOutput(prev => [...prev, { type: event.type, text: event.line }]);
          setTimeout(() => outputRef.current?.scrollTo(0, outputRef.current.scrollHeight), 0);
        } else if (event.type === 'exit') {
          setExitCode(event.code);
          setRunning(false);
          void fetchHistory();
        } else if (event.type === 'error') {
          setOutput(prev => [...prev, { type: 'error', text: event.message }]);
          setRunning(false);
        }
      },
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={command}
          onChange={e => setCommand(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void runCmd(); }}
          placeholder="Enter command…"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'monospace', background: 'var(--bg)' }}
        />
        <Button onClick={() => void runCmd()} disabled={running} variant="primary">
          {running ? 'Running…' : 'Run'}
        </Button>
      </div>

      <pre
        ref={outputRef}
        style={{ background: '#1a1814', color: '#f0ede6', borderRadius: 8, padding: 16, fontSize: 12, fontFamily: 'monospace', minHeight: 200, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}
      >
        {output.map((line, i) => (
          <span key={i} style={{ color: line.type === 'stderr' || line.type === 'error' ? '#f87171' : '#f0ede6' }}>
            {line.text}{'\n'}
          </span>
        ))}
        {exitCode !== null && (
          <span style={{ color: exitCode === 0 ? '#4ade80' : '#f87171' }}>
            {'\n'}[exit {exitCode}]
          </span>
        )}
      </pre>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={() => { setShowHistory(h => !h); if (!showHistory) void fetchHistory(); }}
          style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', padding: 0 }}
        >
          {showHistory ? '▾' : '▸'} History ({history.length})
        </button>
        {showHistory && (
          <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Command', 'Exit', 'When'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text3)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map(row => (
                <tr key={row.id} onClick={() => setCommand(row.command)} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: 'var(--text)' }}>{row.command}</td>
                  <td style={{ padding: '6px 8px', color: row.exit_code === 0 ? 'var(--green)' : 'var(--red)' }}>{row.exit_code ?? '—'}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text3)' }}>{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ServicesTab({ serverId }: { serverId: string }) { return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Services tab — coming in next step</div>; }
function LogsTab({ serverId }: { serverId: string }) { return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Logs tab — coming in next step</div>; }
function FilesTab({ serverId }: { serverId: string }) { return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Files tab — coming in next step</div>; }

export default function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const getToken = useApiToken();
  const router = useRouter();
  const [tab, setTab] = useState<'overview' | 'terminal' | 'services' | 'logs' | 'files'>('overview');

  const { data, isLoading } = useQuery({
    queryKey: ['server', id],
    queryFn: async () => getServer(await getToken(), id),
    refetchInterval: 30_000,
  });

  const server = data?.data;
  const snapshots = server?.snapshots ?? [];

  if (isLoading) return <><Topbar /><div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div></>;
  if (!server) return <><Topbar /><div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Server not found.</div></>;

  return (
    <>
      <Topbar action={<Button onClick={() => router.push('/servers')}>← Servers</Button>} />
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{server.name}</h2>
          <Badge label={server.status} color={statusColor[server.status] ?? 'gray'} />
          {server.region && <span style={{ fontSize: 13, color: 'var(--text3)' }}>{server.region}</span>}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
          {(['overview', 'terminal', 'services', 'logs', 'files'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid var(--text)' : '2px solid transparent',
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? 'var(--text)' : 'var(--text3)',
                cursor: 'pointer',
                textTransform: 'capitalize',
                marginBottom: -1,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab server={server} snapshots={snapshots} />}
        {tab === 'terminal' && <TerminalTab serverId={id} />}
        {tab === 'services' && <ServicesTab serverId={id} />}
        {tab === 'logs' && <LogsTab serverId={id} />}
        {tab === 'files' && <FilesTab serverId={id} />}
      </div>
    </>
  );
}
