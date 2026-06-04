/* ServerDetail — drill-in page with Overview / Terminal / Services / Logs / Files tabs.
   Mirrors apps/web/app/(dashboard)/servers/[id]/page.tsx */

const SERVER_BY_ID = {
  's1': { id: 's1', name: 'prod-web-01',    status: 'degraded', cpu: 34.2, mem: 61.8, disk: 47.3, load: 1.43, region: 'us-east-1', ip: '10.0.4.18',  sshPort: 22, lastPing: '2m ago',  uptime: 12 * 86400 + 4 * 3600,  netIn: 184320,  netOut: 92160  },
  's2': { id: 's2', name: 'prod-api-01',    status: 'degraded', cpu: 71.5, mem: 83.2, disk: 58.9, load: 2.81, region: 'us-east-1', ip: '10.0.4.22',  sshPort: 22, lastPing: '2m ago',  uptime: 28 * 86400 + 14 * 3600, netIn: 421376, netOut: 248832 },
  's3': { id: 's3', name: 'staging-01',     status: 'degraded', cpu: 12.1, mem: 38.4, disk: 21.0, load: 0.42, region: 'eu-west-1', ip: '10.1.2.7',   sshPort: 22, lastPing: '2m ago',  uptime: 7  * 86400 + 11 * 3600, netIn: 12288,  netOut: 8192   },
  's4': { id: 's4', name: 'prod-worker-01', status: 'offline',  cpu: 88.3, mem: 91.7, disk: 72.1, load: 4.21, region: 'us-east-1', ip: '10.0.5.31',  sshPort: 22, lastPing: '5m ago',  uptime: 0,                       netIn: 0,       netOut: 0      },
};

// Pre-baked sparkline data — last 24 readings, 30s apart
function makeSeries(n, base, jitter, drift = 0) {
  const arr = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    v = Math.max(0, Math.min(100, v + (Math.random() - 0.5) * jitter + drift));
    arr.push(v);
  }
  return arr;
}

function ServerDetail({ serverId, onBack }) {
  const server = SERVER_BY_ID[serverId] ?? SERVER_BY_ID.s1;
  const [tab, setTab] = React.useState('overview');

  // Stable sparkline data, keyed off serverId so it doesn't re-randomize on tab switch
  const series = React.useMemo(() => ({
    cpu:  makeSeries(24, server.cpu,  6),
    mem:  makeSeries(24, server.mem,  4),
    disk: makeSeries(24, server.disk, 1),
    load: makeSeries(24, server.load, 0.6),
  }), [serverId]);

  return (
    <div style={{ padding: 24 }}>
      {/* Back + title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'none', border: '1px solid var(--border)',
            borderRadius: 12, padding: '6px 12px',
            fontSize: 12, fontWeight: 500, color: 'var(--text2)',
            cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          }}>
          <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={12} /></span>
          Servers
        </button>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500,
          letterSpacing: '-0.4px', color: 'var(--text)', margin: 0, whiteSpace: 'nowrap',
        }}>{server.name}</h2>
        <Badge label={server.status} color={STATUS_COLOR[server.status] ?? 'gray'} />
        <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{server.ip}</span>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{server.region}</span>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 22 }}>
        {[
          ['overview', 'Overview'],
          ['terminal', 'Terminal'],
          ['services', 'Services'],
          ['logs',     'Logs'],
          ['files',    'Files'],
        ].map(([id, label]) => {
          const on = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)}
              style={{
                padding: '10px 18px', border: 'none', background: 'none',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                color: on ? 'var(--text)' : 'var(--text3)',
                borderBottom: on ? '2px solid var(--text)' : '2px solid transparent',
                marginBottom: -1, cursor: 'pointer', transition: 'all .15s',
              }}>{label}</button>
          );
        })}
      </div>

      {tab === 'overview' && <OverviewTab server={server} series={series} />}
      {tab === 'terminal' && <TerminalTab />}
      {tab === 'services' && <ServicesTab />}
      {tab === 'logs'     && <LogsTab />}
      {tab === 'files'    && <FilesTab />}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────
function OverviewTab({ server, series }) {
  const high = (n) => n > 85 ? 'var(--red)' : n > 70 ? 'var(--amber)' : 'var(--text)';

  const uptimeDays = Math.floor(server.uptime / 86400);
  const uptimeHrs  = Math.floor((server.uptime % 86400) / 3600);

  return (
    <>
      {/* Metric cards with sparklines */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <MetricCard label="CPU"            value={server.cpu}  unit="%"  series={series.cpu}  color="var(--blue)"   valueColor={high(server.cpu)} />
        <MetricCard label="Memory"         value={server.mem}  unit="%"  series={series.mem}  color="var(--purple)" valueColor={high(server.mem)} />
        <MetricCard label="Disk"           value={server.disk} unit="%"  series={series.disk} color="var(--amber)"  valueColor={high(server.disk)} />
        <MetricCard label="Load avg (1m)"  value={server.load} unit=""   series={series.load} color="var(--green)" />
      </div>

      {/* Two-column: Details + Agent install */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 12 }}>
        {/* Details */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 22px' }}>
          <Eyebrow style={{ marginBottom: 14, display: 'block' }}>Details</Eyebrow>
          {[
            ['Uptime',          server.uptime > 0 ? `${uptimeDays}d ${uptimeHrs}h` : '—'],
            ['IP address',       <span style={{ fontFamily: 'var(--font-mono)' }}>{server.ip}</span>],
            ['SSH port',        <span style={{ fontFamily: 'var(--font-mono)' }}>{server.sshPort}</span>],
            ['Region',          server.region],
            ['Last ping',       server.lastPing],
            ['Net in (last)',   `${(server.netIn  / 1024).toFixed(1)} KB`],
            ['Net out (last)',  `${(server.netOut / 1024).toFixed(1)} KB`],
          ].map(([k, v], i) => (
            <div key={k} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)', gap: 12,
            }}>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500, whiteSpace: 'nowrap' }}>{k}</span>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Agent install */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 22px' }}>
          <Eyebrow style={{ marginBottom: 14, display: 'block' }}>Agent</Eyebrow>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 14px', lineHeight: 1.5 }}>
            Install on this server. Pings every 30s, no inbound connections required.
          </p>
          <pre style={{
            background: 'var(--text)', color: '#f0ede6',
            borderRadius: 12, padding: '14px 16px', margin: 0,
            fontSize: 12, fontFamily: 'var(--font-mono)', lineHeight: 1.6,
            overflowX: 'auto', whiteSpace: 'pre',
          }}>
{`# Install the agent
$ VENCORE_TOKEN=vt_••••4b9c \\
  npx @vencore/agent`}
          </pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button>Copy token</Button>
            <Button variant="danger">Regenerate</Button>
          </div>
        </div>
      </div>
    </>
  );
}

function MetricCard({ label, value, unit, series, color, valueColor }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '14px 16px',
    }}>
      <Eyebrow style={{ display: 'block', marginBottom: 8 }}>{label}</Eyebrow>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600,
        letterSpacing: '-0.6px', color: valueColor ?? 'var(--text)',
        lineHeight: 1.05, marginBottom: 10, fontVariantNumeric: 'tabular-nums',
      }}>{typeof value === 'number' ? (unit === '%' ? value.toFixed(1) : value.toFixed(2)) : '—'}{unit}</div>
      <Sparkline data={series} color={color} />
    </div>
  );
}

function Sparkline({ data, color = 'var(--green)' }) {
  if (!data || data.length < 2) return <div style={{ height: 36, color: 'var(--text3)', fontSize: 11 }}>no data</div>;
  const w = 200, h = 36, pad = 2;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyline = pts.join(' ');
  const area = `${pts[0].split(',')[0]},${h-pad} ${polyline} ${pts[pts.length-1].split(',')[0]},${h-pad}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <polygon points={area} fill={color} opacity="0.12" />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Terminal ────────────────────────────────────────────────────────────────
function TerminalTab() {
  const [history, setHistory] = React.useState([
    { cmd: 'uptime', out: ' 23:42:18 up 12 days,  4:17,  1 user,  load average: 1.43, 1.62, 1.78', exit: 0 },
    { cmd: 'systemctl status nginx', out: '● nginx.service - A high performance web server\n     Loaded: loaded (/lib/systemd/system/nginx.service; enabled)\n     Active: active (running) since Mon 2026-05-01 09:14:22 UTC; 12 days ago', exit: 0 },
  ]);
  const [cmd, setCmd] = React.useState('');

  const run = () => {
    if (!cmd.trim()) return;
    const fake = MOCK_COMMANDS[cmd.trim()] ?? { out: `bash: ${cmd}: command not found`, exit: 127 };
    setHistory(h => [...h, { cmd: cmd.trim(), ...fake }]);
    setCmd('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={cmd} onChange={e => setCmd(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run()}
          placeholder="Enter a command (try: df, free, ps aux)"
          style={{
            flex: 1, padding: '9px 12px', borderRadius: 12,
            border: '1px solid var(--border)', background: 'var(--bg)',
            fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)',
            outline: 'none',
          }}/>
        <Button variant="primary" onClick={run}>Run</Button>
      </div>

      <div style={{
        background: 'var(--text)', color: '#f0ede6',
        borderRadius: 16, padding: '16px 18px',
        fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.6,
        minHeight: 320, maxHeight: 480, overflowY: 'auto',
        border: '1px solid var(--border2)',
      }}>
        {history.map((h, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ color: '#8e96ac' }}>
              <span style={{ color: '#67B6FF' }}>nina@{(SERVER_BY_ID.s1.name)}</span>
              <span>:</span>
              <span style={{ color: '#22c55e' }}>~</span>
              <span>$ </span>
              <span style={{ color: '#f0ede6' }}>{h.cmd}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', color: h.exit === 0 ? '#f0ede6' : '#f87171' }}>{h.out}</div>
            {h.exit !== 0 && <div style={{ color: '#f87171', fontSize: 11 }}>[exit {h.exit}]</div>}
          </div>
        ))}
        <div style={{ color: '#8e96ac' }}>
          <span style={{ color: '#67B6FF' }}>nina@prod-web-01</span>
          <span>:</span>
          <span style={{ color: '#22c55e' }}>~</span>
          <span>$ </span>
          <span style={{
            display: 'inline-block', width: 8, height: 14,
            background: '#f0ede6', verticalAlign: 'middle',
            animation: 'vt-blink 1.05s steps(2, start) infinite',
          }}/>
        </div>
      </div>
    </div>
  );
}

const MOCK_COMMANDS = {
  'df': { out: 'Filesystem     1K-blocks      Used Available Use% Mounted on\n/dev/sda1      82516288  39064128  39213120  50% /\ntmpfs           4030940         0   4030940   0% /dev/shm', exit: 0 },
  'free': { out: '              total        used        free      shared  buff/cache   available\nMem:        8061880     4988472     1108288       12380     1965120     2779184\nSwap:       2097148           0     2097148', exit: 0 },
  'ps aux': { out: 'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nroot         1  0.0  0.1 168432 13288 ?        Ss   Apr01   0:31 /sbin/init\nwww-data  1228  1.2  3.1 614032 251992 ?       S    May12   8:42 nginx: worker process\npostgres  2384  0.3  4.2 832912 339440 ?       Ss   May12   3:18 postgres: 15/main', exit: 0 },
  'uptime': { out: ' 23:42:18 up 12 days,  4:17,  1 user,  load average: 1.43, 1.62, 1.78', exit: 0 },
};

// ── Services ────────────────────────────────────────────────────────────────
function ServicesTab() {
  const [services, setServices] = React.useState([
    { name: 'nginx.service',     desc: 'A high performance web server',     active: 'active',   sub: 'running' },
    { name: 'postgres.service',  desc: 'PostgreSQL RDBMS',                  active: 'active',   sub: 'running' },
    { name: 'redis.service',     desc: 'Advanced key-value store',          active: 'inactive', sub: 'dead'    },
    { name: 'vencore-agent.service', desc: 'Vencore monitoring agent',      active: 'active',   sub: 'running' },
    { name: 'cron.service',      desc: 'Regular background program processing daemon', active: 'active', sub: 'running' },
    { name: 'ssh.service',       desc: 'OpenBSD Secure Shell server',       active: 'active',   sub: 'running' },
    { name: 'systemd-timesyncd.service', desc: 'Network Time Synchronization', active: 'active', sub: 'running' },
  ]);

  const toggle = (name, action) => {
    setServices(ss => ss.map(s => {
      if (s.name !== name) return s;
      if (action === 'start')   return { ...s, active: 'active',   sub: 'running' };
      if (action === 'stop')    return { ...s, active: 'inactive', sub: 'dead'    };
      if (action === 'restart') return { ...s, active: 'active',   sub: 'running' };
      return s;
    }));
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1.6fr 2fr .8fr .8fr auto',
        gap: 14, padding: '12px 18px', borderBottom: '1px solid var(--border)',
      }}>
        {['Service','Description','Active','Status'].map(h => <Eyebrow key={h}>{h}</Eyebrow>)}
        <Eyebrow>Actions</Eyebrow>
      </div>
      {services.map((s, i) => (
        <div key={s.name} style={{
          display: 'grid', gridTemplateColumns: '1.6fr 2fr .8fr .8fr auto', gap: 14, alignItems: 'center',
          padding: '11px 18px', borderBottom: i === services.length - 1 ? 'none' : '1px solid var(--border)',
          fontSize: 13,
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>{s.name}</span>
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>{s.desc}</span>
          <span>
            <Badge label={s.active} color={s.active === 'active' ? 'green' : 'gray'} />
          </span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{s.sub}</span>
          <span style={{ display: 'flex', gap: 4 }}>
            {['start','stop','restart'].map(a => (
              <button key={a} onClick={() => toggle(s.name, a)}
                style={{
                  padding: '3px 9px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  fontSize: 11, fontWeight: 500, color: 'var(--text2)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{a}</button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Logs ────────────────────────────────────────────────────────────────────
function LogsTab() {
  const [source, setSource] = React.useState('journalctl');
  const [service, setService] = React.useState('nginx');
  const [filePath, setFilePath] = React.useState('/var/log/syslog');
  const [lines, setLines] = React.useState(200);
  const [auto, setAuto] = React.useState(true);

  const sample = source === 'journalctl' ? LOG_JOURNALCTL : LOG_FILE;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        padding: '12px 14px', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 12,
      }}>
        <Select value={source} onChange={e => setSource(e.target.value)} style={{ width: 140 }}>
          <option value="journalctl">journalctl</option>
          <option value="file">File path</option>
        </Select>
        {source === 'journalctl' ? (
          <Input value={service} onChange={e => setService(e.target.value)} placeholder="Service" style={{ width: 180 }} />
        ) : (
          <Input value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="/var/log/app.log" style={{ width: 240 }} />
        )}
        <Select value={lines} onChange={e => setLines(+e.target.value)} style={{ width: 120 }}>
          {[50, 200, 500, 1000].map(n => <option key={n} value={n}>{n} lines</option>)}
        </Select>
        <Button variant="primary"><Icon name="activity" size={13} /> Fetch</Button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', marginLeft: 'auto', cursor: 'pointer' }}>
          <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />
          Auto-refresh (10s)
        </label>
      </div>

      <div style={{
        background: 'var(--text)', color: '#f0ede6',
        borderRadius: 16, padding: '16px 18px',
        fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6,
        minHeight: 360, maxHeight: 520, overflowY: 'auto',
        whiteSpace: 'pre-wrap',
      }}>
        {sample.split('\n').map((line, i) => {
          const isWarn  = /WARN|warning/i.test(line);
          const isError = /ERROR|FAIL|fatal/i.test(line);
          const isInfo  = /INFO|started|listening/i.test(line);
          return (
            <div key={i} style={{ color: isError ? '#f87171' : isWarn ? '#fbbf24' : isInfo ? '#67B6FF' : '#f0ede6' }}>
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const LOG_JOURNALCTL = `May 13 23:42:18 prod-web-01 nginx[1228]: 192.168.1.42 - - [13/May/2026:23:42:18 +0000] "GET /api/health HTTP/1.1" 200 17
May 13 23:42:18 prod-web-01 nginx[1228]: 192.168.1.88 - - [13/May/2026:23:42:18 +0000] "POST /api/agent/ping HTTP/1.1" 200 24
May 13 23:42:21 prod-web-01 nginx[1228]: 192.168.1.42 - - [13/May/2026:23:42:21 +0000] "GET /api/alerts HTTP/1.1" 200 1842
May 13 23:42:24 prod-web-01 systemd[1]: Started Vencore monitoring agent.
May 13 23:42:24 prod-web-01 vencore-agent[3144]: INFO  agent v1.4.2 started (workspace=vencore-internal)
May 13 23:42:24 prod-web-01 vencore-agent[3144]: INFO  connecting to https://api.vencore.dev
May 13 23:42:25 prod-web-01 vencore-agent[3144]: INFO  ping ok (latency=42ms cpu=34.2 mem=61.8 disk=47.3)
May 13 23:42:55 prod-web-01 vencore-agent[3144]: WARN  memory above 85% (current=87.1)
May 13 23:43:25 prod-web-01 vencore-agent[3144]: INFO  ping ok (latency=38ms cpu=29.4 mem=78.2 disk=47.3)
May 13 23:43:55 prod-web-01 vencore-agent[3144]: INFO  ping ok (latency=41ms cpu=31.2 mem=74.9 disk=47.3)
May 13 23:44:25 prod-web-01 vencore-agent[3144]: INFO  ping ok (latency=39ms cpu=28.1 mem=72.4 disk=47.3)
May 13 23:44:30 prod-web-01 sshd[3622]: Accepted publickey for nina from 192.168.1.42 port 51842 ssh2: ED25519 SHA256:Z9Lc…JTb4
May 13 23:44:30 prod-web-01 sshd[3622]: pam_unix(sshd:session): session opened for user nina by (uid=0)`;

const LOG_FILE = `2026-05-13 23:40:01 INFO  worker started (pid=4128)
2026-05-13 23:40:01 INFO  listening on :8080
2026-05-13 23:40:12 INFO  request id=req_4f3a /api/contacts 200 12ms
2026-05-13 23:40:14 INFO  request id=req_4f3b /api/deals 200 18ms
2026-05-13 23:40:18 WARN  request id=req_4f3c /api/files slow (1242ms)
2026-05-13 23:40:42 ERROR request id=req_4f3d /api/agent/ping 500 — db connection timeout
2026-05-13 23:40:43 INFO  reconnecting to postgres
2026-05-13 23:40:43 INFO  postgres reconnected
2026-05-13 23:41:01 INFO  cron tick — usage meter snapshot
2026-05-13 23:41:01 INFO  workspace=vencore-internal contacts=12 servers=4 dbs=3 seats=3
2026-05-13 23:42:18 INFO  request id=req_4f3e /api/health 200 1ms`;

// ── Files ───────────────────────────────────────────────────────────────────
function FilesTab() {
  const [path, setPath] = React.useState('/etc/nginx');
  const entries = FILES_BY_PATH[path] ?? FILES_BY_PATH['/'];

  const crumbs = path.split('/').filter(Boolean);

  const navigate = (next) => setPath(next);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)',
        fontSize: 13, padding: '10px 14px', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 12,
      }}>
        <button onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}>/</button>
        {crumbs.map((part, i) => {
          const target = '/' + crumbs.slice(0, i + 1).join('/');
          return (
            <React.Fragment key={i}>
              <span style={{ color: 'var(--text3)' }}>/</span>
              <button onClick={() => navigate(target)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}>{part}</button>
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1.8fr .6fr .8fr 1fr',
          gap: 14, padding: '12px 18px', borderBottom: '1px solid var(--border)',
        }}>
          {['Name','Size','Permissions','Modified'].map(h => <Eyebrow key={h}>{h}</Eyebrow>)}
        </div>
        {entries.map((e, i) => (
          <button key={e.name} onClick={() => e.type === 'dir' && navigate(path === '/' ? '/' + e.name : path + '/' + e.name)}
            style={{
              display: 'grid', gridTemplateColumns: '1.8fr .6fr .8fr 1fr', gap: 14, alignItems: 'center',
              padding: '11px 18px',
              borderBottom: i === entries.length - 1 ? 'none' : '1px solid var(--border)',
              fontSize: 13, background: 'none', cursor: e.type === 'dir' ? 'pointer' : 'default',
              textAlign: 'left', fontFamily: 'inherit', width: '100%',
            }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: e.type === 'dir' ? 'var(--blue)' : 'var(--text2)', display: 'inline-flex' }}>
                <Icon name={e.type === 'dir' ? 'companies' : 'files'} size={14} />
              </span>
              <span style={{ color: 'var(--text)' }}>{e.name}{e.type === 'dir' ? '/' : ''}</span>
            </span>
            <span style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{e.size}</span>
            <span style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{e.perm}</span>
            <span style={{ color: 'var(--text3)' }}>{e.mod}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const FILES_BY_PATH = {
  '/': [
    { name: 'bin',  type: 'dir',  size: '—',     perm: 'drwxr-xr-x', mod: '2026-04-01' },
    { name: 'etc',  type: 'dir',  size: '—',     perm: 'drwxr-xr-x', mod: '2026-05-13' },
    { name: 'var',  type: 'dir',  size: '—',     perm: 'drwxr-xr-x', mod: '2026-05-13' },
    { name: 'home', type: 'dir',  size: '—',     perm: 'drwxr-xr-x', mod: '2026-05-12' },
    { name: 'tmp',  type: 'dir',  size: '—',     perm: 'drwxrwxrwt', mod: '2026-05-13' },
  ],
  '/etc': [
    { name: 'nginx',         type: 'dir',  size: '—',     perm: 'drwxr-xr-x', mod: '2026-05-10' },
    { name: 'systemd',       type: 'dir',  size: '—',     perm: 'drwxr-xr-x', mod: '2026-04-22' },
    { name: 'ssh',           type: 'dir',  size: '—',     perm: 'drwxr-xr-x', mod: '2026-04-01' },
    { name: 'hostname',      type: 'file', size: '14 B',  perm: '-rw-r--r--', mod: '2026-04-01' },
    { name: 'os-release',    type: 'file', size: '418 B', perm: '-rw-r--r--', mod: '2026-04-01' },
  ],
  '/etc/nginx': [
    { name: 'sites-available', type: 'dir',  size: '—',      perm: 'drwxr-xr-x', mod: '2026-05-10' },
    { name: 'sites-enabled',   type: 'dir',  size: '—',      perm: 'drwxr-xr-x', mod: '2026-05-10' },
    { name: 'conf.d',          type: 'dir',  size: '—',      perm: 'drwxr-xr-x', mod: '2026-04-22' },
    { name: 'nginx.conf',      type: 'file', size: '2.4 KB', perm: '-rw-r--r--', mod: '2026-05-10' },
    { name: 'mime.types',      type: 'file', size: '5.2 KB', perm: '-rw-r--r--', mod: '2026-04-01' },
    { name: 'fastcgi.conf',    type: 'file', size: '1.1 KB', perm: '-rw-r--r--', mod: '2026-04-01' },
  ],
};

window.ServerDetail = ServerDetail;
