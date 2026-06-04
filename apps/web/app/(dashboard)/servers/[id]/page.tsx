'use client';

import { use, useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/modules/shared/components/Topbar';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { Button } from '@/modules/shared/components/ui/Button';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getServer, updateServer, regenToken } from '@/modules/servers/lib/servers';
import { useServerMetrics } from '@/modules/shared/contexts/ServerMetricsContext';
import { openSshStream, getSshHistory } from '@/modules/servers/lib/ssh';
import { openSftpSession, SftpClient } from '@/modules/servers/lib/sftp';
import type { SftpEntry } from '@/modules/servers/lib/sftp';
import { SshTerminal } from '@/modules/servers/components/SshTerminal';
import type { Server, MetricsSnapshot, SshCommandLog } from '@vencore/types';

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
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8 }}>{label}</div>
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
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [regenConfirming, setRegenConfirming] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const regenMut = useMutation({
    mutationFn: async () => regenToken(await getToken(), server.id),
    onSuccess: (res) => {
      setNewToken(res.data.agent_token);
      setRegenConfirming(false);
      void qc.invalidateQueries({ queryKey: ['server', server.id] });
    },
  });

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
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 12 }}>Details</div>
        {[
          ['Uptime', server.uptime_seconds !== null ? `${Math.floor(server.uptime_seconds / 86400)}d ${Math.floor((server.uptime_seconds % 86400) / 3600)}h` : '—'],
          ['IP', server.ip_address ?? '—'],
          ['SSH Port', String(server.ssh_port ?? 22)],
          ['Last ping', server.last_ping_at ? new Date(server.last_ping_at).toLocaleString() : 'never'],
          ['Net in (interval)', server.net_in_bytes !== null ? `${(server.net_in_bytes / 1024).toFixed(1)} KB` : '—'],
          ['Net out (interval)', server.net_out_bytes !== null ? `${(server.net_out_bytes / 1024).toFixed(1)} KB` : '—'],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{value}</span>
          </div>
        ))}

        {/* Agent Token */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8 }}>Agent Token</div>
          {!regenConfirming ? (
            <Button onClick={() => setRegenConfirming(true)}>Regenerate token</Button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>This will invalidate the current token. Continue?</span>
              <Button onClick={() => setRegenConfirming(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => regenMut.mutate()} disabled={regenMut.isPending}>
                {regenMut.isPending ? 'Regenerating…' : 'Regenerate'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* New token reveal modal */}
      {newToken && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setNewToken(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, width: 520, maxWidth: '90vw', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>New Agent Token</div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>Copy this token now — it won&apos;t be shown again.</p>
            <div style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', wordBreak: 'break-all', userSelect: 'all' }}>
              {newToken}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>Update the agent on your server:</p>
            <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 12, background: '#1a1814', color: '#f0ede6', borderRadius: 6, padding: '10px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {`VENCORE_TOKEN=${newToken} vencore-agent`}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={() => setNewToken(null)}>Done</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ConsoleTab({ serverId }: { serverId: string }) {
  return (
    <div style={{ height: 'calc(100vh - 220px)', minHeight: 400, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <SshTerminal serverId={serverId} />
    </div>
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
  const streamRef = useRef<AbortController | null>(null);

  async function fetchHistory() {
    const token = await getToken();
    const result = await getSshHistory(token, serverId);
    setHistory(result.data);
  }

  useEffect(() => {
    return () => { streamRef.current?.abort(); };
  }, []);

  async function runCmd() {
    if (!command.trim() || running) return;
    streamRef.current?.abort(); // cancel any prior stream
    setRunning(true);
    setOutput([]);
    setExitCode(null);
    const token = await getToken();

    streamRef.current = openSshStream(
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

function ServicesTab({ serverId }: { serverId: string }) {
  const getToken = useApiToken();
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionOutput, setActionOutput] = useState<{ name: string; lines: string[]; exitCode: number | null } | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const fetchStreamRef = useRef<AbortController | null>(null);
  const actionStreamRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      fetchStreamRef.current?.abort();
      actionStreamRef.current?.abort();
    };
  }, []);

  function fetchServices() {
    fetchStreamRef.current?.abort();
    setLoading(true);
    setLines([]);
    getToken().then(token => {
      fetchStreamRef.current = openSshStream(
        `/api/servers/${serverId}/ssh/services`,
        {},
        token,
        (event) => {
          if (event.type === 'stdout') setLines(prev => [...prev, event.line]);
          if (event.type === 'exit' || event.type === 'error') setLoading(false);
        },
      );
    });
  }

  function doAction(serviceName: string, action: 'start' | 'stop' | 'restart' | 'status') {
    actionStreamRef.current?.abort();
    setActioning(serviceName);
    setActionOutput({ name: serviceName, lines: [], exitCode: null });
    getToken().then(token => {
      actionStreamRef.current = openSshStream(
        `/api/servers/${serverId}/ssh/service/${encodeURIComponent(serviceName)}`,
        { action },
        token,
        (event) => {
          if (event.type === 'stdout' || event.type === 'stderr') {
            setActionOutput(prev => prev ? { ...prev, lines: [...prev.lines, event.line] } : null);
          }
          if (event.type === 'exit') {
            setActionOutput(prev => prev ? { ...prev, exitCode: event.code } : null);
            setActioning(null);
            fetchServices();
          }
          if (event.type === 'error') {
            setActionOutput(prev => prev ? { ...prev, lines: [...prev.lines, event.message], exitCode: 1 } : null);
            setActioning(null);
          }
        },
      );
    });
  }

  const services = lines.map(line => {
    const parts = line.trim().split(/\s+/);
    return {
      name: parts[0] ?? '',
      load: parts[1] ?? '',
      active: parts[2] ?? '',
      sub: parts[3] ?? '',
      description: parts.slice(4).join(' '),
    };
  }).filter(s => s.name.endsWith('.service'));

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Button onClick={fetchServices} disabled={loading}>{loading ? 'Loading…' : 'Refresh services'}</Button>
      </div>

      {actionOutput && (
        <pre style={{ background: '#1a1814', color: '#f0ede6', borderRadius: 8, padding: 12, fontSize: 12, fontFamily: 'monospace', marginBottom: 16, maxHeight: 150, overflow: 'auto' }}>
          {actionOutput.lines.join('\n')}
          {actionOutput.exitCode !== null && `\n[exit ${actionOutput.exitCode}]`}
        </pre>
      )}

      {services.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Service', 'Active', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map((svc, i) => (
                <tr key={svc.name} style={{ borderBottom: i < services.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12 }}>{svc.name}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ color: svc.active === 'active' ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>{svc.active}</span>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text3)' }}>{svc.sub}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['start', 'stop', 'restart', 'status'] as const).map(a => (
                        <button key={a} disabled={actioning === svc.name}
                          onClick={() => doAction(svc.name, a)}
                          style={{ padding: '3px 10px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', cursor: 'pointer', color: 'var(--text)' }}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LogsTab({ serverId }: { serverId: string }) {
  const getToken = useApiToken();
  const [source, setSource] = useState<'journalctl' | 'file'>('journalctl');
  const [service, setService] = useState('');
  const [filePath, setFilePath] = useState('');
  const [lines, setLines] = useState(200);
  const [output, setOutput] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const ctrlRef = useRef<ReturnType<typeof openSshStream> | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sourceRef = useRef(source);
  const serviceRef = useRef(service);
  const filePathRef = useRef(filePath);
  const linesRef = useRef(lines);

  useEffect(() => {
    return () => { ctrlRef.current?.abort(); };
  }, []);

  useEffect(() => { sourceRef.current = source; }, [source]);
  useEffect(() => { serviceRef.current = service; }, [service]);
  useEffect(() => { filePathRef.current = filePath; }, [filePath]);
  useEffect(() => { linesRef.current = lines; }, [lines]);

  function fetchLogs() {
    ctrlRef.current?.abort();
    setLoading(true);
    setOutput([]);
    const body = sourceRef.current === 'journalctl'
      ? { source: 'journalctl', service: serviceRef.current || undefined, lines: linesRef.current }
      : { source: 'file', path: filePathRef.current, lines: linesRef.current };
    getToken().then(token => {
      ctrlRef.current = openSshStream(
        `/api/servers/${serverId}/ssh/logs`,
        body,
        token,
        (event) => {
          if (event.type === 'stdout') {
            setOutput(prev => [...prev, event.line]);
            setTimeout(() => outputRef.current?.scrollTo(0, outputRef.current.scrollHeight), 0);
          }
          if (event.type === 'exit' || event.type === 'error') setLoading(false);
        },
      );
    });
  }

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(fetchLogs, 10_000);
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={source} onChange={e => setSource(e.target.value as 'journalctl' | 'file')}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)' }}>
          <option value="journalctl">journalctl</option>
          <option value="file">File path</option>
        </select>
        {source === 'journalctl' ? (
          <input value={service} onChange={e => setService(e.target.value)} placeholder="Service (optional)"
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', width: 180 }} />
        ) : (
          <input value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="/var/log/app.log"
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', width: 240 }} />
        )}
        <select value={lines} onChange={e => setLines(Number(e.target.value))}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)' }}>
          {[50, 200, 500, 1000].map(n => <option key={n} value={n}>{n} lines</option>)}
        </select>
        <Button onClick={fetchLogs} disabled={loading}>{loading ? 'Loading…' : 'Fetch'}</Button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
          Auto-refresh (10s)
        </label>
      </div>
      <pre ref={outputRef}
        style={{ background: '#1a1814', color: '#f0ede6', borderRadius: 8, padding: 16, fontSize: 12, fontFamily: 'monospace', minHeight: 200, maxHeight: 500, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
        {output.join('\n')}
      </pre>
    </div>
  );
}

function FilesTab({ serverId }: { serverId: string }) {
  const [connState, setConnState] = useState<'connecting' | 'ready' | 'error'>('connecting');
  const [connError, setConnError] = useState<string | null>(null);
  const [curPath, setCurPath] = useState('/');
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string; saved: string } | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const sftpRef = useRef<SftpClient | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;

    void openSftpSession(serverId).then(sftp => {
      if (cancelled) { sftp.close(); return; }
      sftpRef.current = sftp;
      ws = (sftp as unknown as { ws: WebSocket }).ws;

      function handleOpen() {
        setConnState('ready');
        void ls('/');
      }
      function handleError() {
        setConnState('error');
        setConnError('WebSocket connection failed.');
      }
      ws.addEventListener('open', handleOpen);
      ws.addEventListener('error', handleError);

      sftp.onClose(() => {
        setConnState('error');
        setConnError('Connection closed.');
      });

      // If already open (readyState 1) — shouldn't happen on fresh WS but guard anyway
      if (ws.readyState === WebSocket.OPEN) handleOpen();
    });

    return () => {
      cancelled = true;
      if (ws) ws.removeEventListener('open', () => undefined);
      sftpRef.current?.close();
      sftpRef.current = null;
    };
  }, [serverId]); // eslint-disable-line react-hooks/exhaustive-deps

  function joinPath(base: string, name: string) {
    return (base === '/' ? '' : base.replace(/\/$/, '')) + '/' + name;
  }

  async function ls(dir: string) {
    const sftp = sftpRef.current;
    if (!sftp) return;
    setDirLoading(true);
    setOpError(null);
    try {
      const res = await sftp.ls(dir);
      if (res.ok && res.data) {
        setCurPath(dir);
        const sorted = [...res.data.entries].sort((a, b) => {
          if (a.type === 'dir' && b.type !== 'dir') return -1;
          if (a.type !== 'dir' && b.type === 'dir') return 1;
          return a.name.localeCompare(b.name);
        });
        setEntries(sorted);
      } else {
        setOpError(res.error ?? 'Failed to list directory.');
      }
    } catch (e) {
      setOpError((e as Error).message);
    } finally {
      setDirLoading(false);
    }
  }

  async function openFile(filePath: string) {
    const sftp = sftpRef.current;
    if (!sftp) return;
    setOpError(null);
    const res = await sftp.read(filePath);
    if (res.ok && res.data) {
      const content = res.data.content;
      setSelectedFile({ path: filePath, content, saved: content });
      setEditorContent(content);
    } else {
      // SSH_CONNECT_FAILED / NO_KEYPAIR surface here
      const msg = res.error ?? 'Failed to read file.';
      if (msg.includes('SSH_CONNECT_FAILED') || msg.includes('NO_KEYPAIR')) {
        setConnState('error');
        setConnError(msg);
      } else {
        setOpError(msg);
      }
    }
  }

  async function saveFile() {
    const sftp = sftpRef.current;
    if (!sftp || !selectedFile) return;
    setSaving(true);
    setOpError(null);
    const res = await sftp.write(selectedFile.path, editorContent);
    if (res.ok) {
      setSelectedFile(f => f ? { ...f, content: editorContent, saved: editorContent } : null);
    } else {
      setOpError(res.error ?? 'Save failed.');
    }
    setSaving(false);
  }

  async function deleteEntry(entryPath: string, isDir: boolean) {
    const sftp = sftpRef.current;
    if (!sftp) return;
    if (!confirm(`Delete ${isDir ? 'directory' : 'file'} "${entryPath}"?`)) return;
    setOpError(null);
    const res = await sftp.delete(entryPath);
    if (res.ok) {
      if (selectedFile?.path === entryPath) { setSelectedFile(null); setEditorContent(''); }
      void ls(curPath);
    } else {
      setOpError(res.error ?? 'Delete failed.');
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const sftp = sftpRef.current;
    const file = e.target.files?.[0];
    if (!sftp || !file) return;
    setOpError(null);
    const text = await file.text();
    const destPath = joinPath(curPath, file.name);
    const res = await sftp.write(destPath, text);
    if (res.ok) {
      void ls(curPath);
    } else {
      setOpError(res.error ?? 'Upload failed.');
    }
    // reset input so same file can be re-uploaded
    e.target.value = '';
  }

  function downloadFile() {
    if (!selectedFile) return;
    const blob = new Blob([editorContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.path.split('/').pop() ?? 'file.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Breadcrumb parts
  const parts = curPath.split('/').filter(Boolean);

  if (connState === 'connecting') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: 'var(--text3)', fontSize: 14, gap: 10 }}>
        <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid var(--border)', borderTopColor: 'var(--text2)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        Connecting…
      </div>
    );
  }

  if (connState === 'error') {
    const isKeypair = connError?.includes('NO_KEYPAIR') || connError?.includes('SSH_CONNECT_FAILED');
    return (
      <div style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 'var(--radius-lg)', padding: '20px 28px', maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontWeight: 600, color: 'var(--red)', marginBottom: 8 }}>Connection failed</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: isKeypair ? 12 : 0 }}>{connError}</div>
          {isKeypair && (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Add an SSH keypair in Settings → SSH to enable file browsing.</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 0, minHeight: 400, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', fontFamily: 'var(--font-sans)' }}>
      {/* Directory pane */}
      <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
        {/* Breadcrumb */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', fontSize: 12, fontFamily: 'monospace', background: 'var(--surface2)' }}>
          <button onClick={() => void ls('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: '0 2px' }}>/</button>
          {parts.map((part, i) => {
            const target = '/' + parts.slice(0, i + 1).join('/');
            return (
              <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ color: 'var(--text3)' }}>/</span>
                <button onClick={() => void ls(target)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: '0 2px', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={part}>{part}</button>
              </span>
            );
          })}
        </div>

        {/* Entry list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Parent dir */}
          {curPath !== '/' && (
            <div
              onClick={() => {
                const parent = curPath.split('/').slice(0, -1).join('/') || '/';
                void ls(parent);
              }}
              style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'monospace', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <span>↑</span> ..
            </div>
          )}
          {dirLoading && <div style={{ padding: '12px', fontSize: 12, color: 'var(--text3)' }}>Loading…</div>}
          {!dirLoading && entries.map(entry => {
            const entryPath = joinPath(curPath, entry.name);
            const isSelected = selectedFile?.path === entryPath;
            return (
              <div
                key={entry.name}
                style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isSelected ? 'var(--surface2)' : '' }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface2)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = ''; }}
                onClick={() => {
                  if (entry.type === 'dir') void ls(entryPath);
                  else void openFile(entryPath);
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', color: 'var(--text)' }}>
                  <span>{entry.type === 'dir' ? '📁' : '📄'}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                </span>
                <button
                  onClick={e => { e.stopPropagation(); void deleteEntry(entryPath, entry.type === 'dir'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '0 2px', fontSize: 11, flexShrink: 0, opacity: 0 }}
                  title="Delete"
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--red)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text3)'; }}
                >✕</button>
              </div>
            );
          })}
          {!dirLoading && entries.length === 0 && (
            <div style={{ padding: '12px', fontSize: 12, color: 'var(--text3)' }}>Empty directory</div>
          )}
        </div>

        {/* Upload button */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <input ref={uploadRef} type="file" style={{ display: 'none' }} onChange={e => void handleUpload(e)} />
          <button
            onClick={() => uploadRef.current?.click()}
            style={{ width: '100%', padding: '6px 0', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text2)' }}
          >
            ↑ Upload file
          </button>
        </div>
      </div>

      {/* Editor pane */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
        {opError && (
          <div style={{ padding: '8px 14px', background: 'var(--red-bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: 'var(--red)' }}>{opError}</span>
            <button onClick={() => setOpError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>✕</button>
          </div>
        )}
        {selectedFile ? (
          <>
            {/* Editor toolbar */}
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface2)', gap: 8 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFile.path}
              </span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => void saveFile()}
                  disabled={saving || editorContent === selectedFile.saved}
                  style={{ padding: '4px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: editorContent !== selectedFile.saved ? 'var(--green)' : 'var(--surface)', color: editorContent !== selectedFile.saved ? '#fff' : 'var(--text3)', cursor: editorContent !== selectedFile.saved ? 'pointer' : 'default', fontWeight: 500 }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={downloadFile}
                  style={{ padding: '4px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text2)' }}
                >
                  ↓ Download
                </button>
              </div>
            </div>
            {/* Textarea editor */}
            <textarea
              value={editorContent}
              onChange={e => setEditorContent(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', fontFamily: 'monospace', fontSize: 12, padding: 16, background: '#1a1814', color: '#f0ede6', minHeight: 360, lineHeight: 1.6 }}
              spellCheck={false}
            />
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Select a file to view or edit
          </div>
        )}
      </div>
    </div>
  );
}

export default function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const getToken = useApiToken();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'console' | 'terminal' | 'services' | 'logs' | 'files'>('overview');
  const [consoleEverActive, setConsoleEverActive] = useState(false);
  const [filesEverActive, setFilesEverActive] = useState(false);

  useEffect(() => {
    if (tab === 'console') setConsoleEverActive(true);
    if (tab === 'files') setFilesEverActive(true);
  }, [tab]);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', region: '', ip_address: '', ssh_port: 22 });

  const editMut = useMutation({
    mutationFn: async () => updateServer(await getToken(), id, {
      name: editForm.name || undefined,
      region: editForm.region || undefined,
      ip_address: editForm.ip_address || undefined,
      ssh_port: editForm.ssh_port,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['server', id] });
      setEditOpen(false);
    },
  });

  function openEdit(srv: Server) {
    setEditForm({
      name: srv.name,
      region: srv.region ?? '',
      ip_address: srv.ip_address ?? '',
      ssh_port: srv.ssh_port ?? 22,
    });
    setEditOpen(true);
  }

  const live = useServerMetrics(id);

  const { data, isLoading } = useQuery({
    queryKey: ['server', id],
    queryFn: async () => getServer(await getToken(), id),
    refetchInterval: 30_000,
  });

  const server = data?.data;
  const snapshots = server?.snapshots ?? [];

  if (isLoading) return <><Topbar /><div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div></>;
  if (!server) return <><Topbar /><div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Server not found.</div></>;

  const liveStatus = live?.status ?? server.status;

  return (
    <>
      <Topbar action={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => router.push('/servers')}>← Servers</Button>
          <Button onClick={() => openEdit(server)}>Edit</Button>
        </div>
      } />
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{server.name}</h2>
          <Badge label={liveStatus} color={statusColor[liveStatus] ?? 'gray'} />
          {server.region && <span style={{ fontSize: 13, color: 'var(--text3)' }}>{server.region}</span>}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
          {(['overview', 'console', 'terminal', 'services', 'logs', 'files'] as const).map(t => (
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

        {tab === 'overview' && <OverviewTab server={{
          ...server,
          cpu_pct: live?.cpu_pct ?? server.cpu_pct,
          mem_pct: live?.mem_pct ?? server.mem_pct,
          disk_pct: live?.disk_pct ?? server.disk_pct,
          load_avg_1m: live?.load_avg_1m ?? server.load_avg_1m,
          uptime_seconds: live?.uptime_seconds ?? server.uptime_seconds,
          last_ping_at: live?.last_ping_at ?? server.last_ping_at,
          net_in_bytes: live?.net_in_bytes ?? server.net_in_bytes,
          net_out_bytes: live?.net_out_bytes ?? server.net_out_bytes,
        }} snapshots={snapshots} />}
        {tab === 'terminal' && <TerminalTab serverId={id} />}
        {tab === 'services' && <ServicesTab serverId={id} />}
        {tab === 'logs' && <LogsTab serverId={id} />}
        {/* Console: mount once, keep alive with CSS so SSH connection persists */}
        {consoleEverActive && (
          <div style={{ display: tab === 'console' ? 'block' : 'none' }}>
            <ConsoleTab serverId={id} />
          </div>
        )}
        {/* Files: mount once, keep alive so listing persists across tab switches */}
        {filesEverActive && (
          <div style={{ display: tab === 'files' ? 'block' : 'none' }}>
            <FilesTab serverId={id} />
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setEditOpen(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, width: 440, maxWidth: '90vw', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Edit {server.name}</div>
            <form onSubmit={e => { e.preventDefault(); editMut.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>Name *</label>
                <input
                  required
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>Region</label>
                <input
                  value={editForm.region}
                  onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))}
                  placeholder="us-east-1"
                  style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>IP Address</label>
                <input
                  value={editForm.ip_address}
                  onChange={e => setEditForm(f => ({ ...f, ip_address: e.target.value }))}
                  placeholder="1.2.3.4"
                  style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>SSH Port</label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={String(editForm.ssh_port)}
                  onChange={e => setEditForm(f => ({ ...f, ssh_port: parseInt(e.target.value, 10) || 22 }))}
                  style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <Button type="button" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={editMut.isPending}>
                  {editMut.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
