/* Servers — table view with status badges + animated mock metrics.
   Mirrors apps/web/app/(dashboard)/servers/page.tsx */

const SEED_SERVERS = [
  { id: 's1', name: 'prod-web-01',    status: 'degraded', cpu: 34.2, mem: 61.8, disk: 47.3, region: 'us-east-1', lastPing: '2m ago' },
  { id: 's2', name: 'prod-api-01',    status: 'degraded', cpu: 71.5, mem: 83.2, disk: 58.9, region: 'us-east-1', lastPing: '2m ago' },
  { id: 's3', name: 'staging-01',     status: 'degraded', cpu: 12.1, mem: 38.4, disk: 21.0, region: 'eu-west-1', lastPing: '2m ago' },
  { id: 's4', name: 'prod-worker-01', status: 'offline',  cpu: 88.3, mem: 91.7, disk: 72.1, region: 'us-east-1', lastPing: '5m ago' },
];

function Servers({ onSelect }) {
  const [servers, setServers] = React.useState(SEED_SERVERS);
  React.useEffect(() => {
    const t = setInterval(() => {
      setServers(ss => ss.map(s => {
        if (s.status === 'offline') return s;
        const jitter = () => (Math.random() - 0.5) * 4;
        const clamp = (n) => Math.max(0, Math.min(99.9, n));
        return {
          ...s,
          cpu:  +clamp(s.cpu  + jitter()).toFixed(1),
          mem:  +clamp(s.mem  + jitter() * 0.6).toFixed(1),
          disk: +clamp(s.disk + jitter() * 0.2).toFixed(1),
        };
      }));
    }, 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text2)' }}>{servers.length} servers</div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1.4fr 1fr .8fr .8fr .8fr 1fr 1fr auto',
          padding: '11px 18px', borderBottom: '1px solid var(--border)',
          gap: 14, alignItems: 'center',
        }}>
          {['Name','Status','CPU','Mem','Disk','Region','Last ping'].map(h => (
            <Eyebrow key={h}>{h}</Eyebrow>
          ))}
          <span />
        </div>
        {servers.map((s, i) => (
          <ServerRow key={s.id} s={s} last={i === servers.length - 1} onClick={() => onSelect?.(s.id)} />
        ))}
      </div>
    </div>
  );
}

function ServerRow({ s, last, onClick }) {
  const [hover, setHover] = React.useState(false);
  const high = (n) => n > 85 ? 'var(--red)' : n > 70 ? 'var(--amber)' : 'var(--text)';
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: '1.4fr 1fr .8fr .8fr .8fr 1fr 1fr auto',
        padding: '12px 18px', borderBottom: last ? 'none' : '1px solid var(--border)',
        gap: 14, alignItems: 'center', fontSize: 13,
        background: hover ? 'var(--surface2)' : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background .12s',
      }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text)' }}>{s.name}</span>
      <span><Badge label={s.status} color={STATUS_COLOR[s.status] ?? 'gray'} /></span>
      <span style={{ color: high(s.cpu),  fontVariantNumeric: 'tabular-nums' }}>{s.cpu.toFixed(1)}%</span>
      <span style={{ color: high(s.mem),  fontVariantNumeric: 'tabular-nums' }}>{s.mem.toFixed(1)}%</span>
      <span style={{ color: high(s.disk), fontVariantNumeric: 'tabular-nums' }}>{s.disk.toFixed(1)}%</span>
      <span style={{ color: 'var(--text)' }}>{s.region}</span>
      <span style={{ color: 'var(--text2)' }}>{s.lastPing}</span>
      <Button onClick={(e) => e.stopPropagation()} style={{ padding: '4px 10px', borderRadius: 10, fontSize: 12 }}>Remove</Button>
    </div>
  );
}

window.Servers = Servers;
