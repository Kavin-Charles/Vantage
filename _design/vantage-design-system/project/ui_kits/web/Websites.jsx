/* Websites — uptime monitoring table. SSL date colored by days remaining. */

const SEED_SITES = [
  { id: 'w1', label: 'Marketing site',        url: 'https://vantage.dev',           status: 'online',   response: 142, uptime: 99.98, ssl: '2026-09-21' },
  { id: 'w2', label: 'API gateway',           url: 'https://api.vantage.dev',       status: 'online',   response: 86,  uptime: 99.99, ssl: '2026-06-10' },
  { id: 'w3', label: 'Status page',           url: 'https://status.vantage.dev',    status: 'online',   response: 64,  uptime: 100,   ssl: '2026-07-04' },
  { id: 'w4', label: 'Cobalt dashboard',      url: 'https://app.cobaltsystems.com', status: 'degraded', response: 1247, uptime: 97.40, ssl: '2026-05-19' },
  { id: 'w5', label: null,                    url: 'https://docs.vantage.dev',      status: 'online',   response: 188, uptime: 99.90, ssl: '2026-08-15' },
  { id: 'w6', label: 'Orbit legacy',          url: 'https://legacy.orbitcloud.io',  status: 'offline',  response: null, uptime: 88.13, ssl: '2026-05-15' },
];

function Websites() {
  const [sites] = React.useState(SEED_SITES);
  const cols = 'minmax(220px,2fr) .9fr .9fr .9fr 1.1fr auto';
  const today = new Date('2026-05-13');

  const sslColor = (date) => {
    if (!date) return 'var(--text3)';
    const days = (new Date(date) - today) / 86400000;
    if (days < 7)  return 'var(--red)';
    if (days < 30) return 'var(--amber)';
    return 'var(--text2)';
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text2)' }}>{sites.length} websites monitored</div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'center',
          padding: '12px 18px', borderBottom: '1px solid var(--border)',
        }}>
          {['Label / URL','Status','Response','Uptime 30d','SSL expiry'].map(h => <Eyebrow key={h}>{h}</Eyebrow>)}
          <span/>
        </div>
        {sites.map((s, i) => {
          return (
            <SiteRow key={s.id} s={s} cols={cols} last={i === sites.length - 1} sslColor={sslColor(s.ssl)} />
          );
        })}
      </div>
    </div>
  );
}

function SiteRow({ s, cols, last, sslColor }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'center',
        padding: '13px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s', fontSize: 13,
      }}>
      <span style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.label ?? s.url}
        </div>
        {s.label && (
          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</div>
        )}
      </span>
      <span><Badge label={s.status} color={STATUS_COLOR[s.status] ?? 'gray'} /></span>
      <span style={{ color: s.response > 500 ? 'var(--amber)' : 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
        {s.response !== null ? `${s.response}ms` : '—'}
      </span>
      <span style={{ color: s.uptime < 99 ? 'var(--amber)' : 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{s.uptime.toFixed(2)}%</span>
      <span style={{ color: sslColor, fontVariantNumeric: 'tabular-nums', fontWeight: sslColor !== 'var(--text2)' && sslColor !== 'var(--text3)' ? 600 : 400 }}>
        {s.ssl ? new Date(s.ssl + 'T00:00:00').toLocaleDateString() : '—'}
      </span>
      <Button style={{ padding: '4px 12px', fontSize: 12 }}>Remove</Button>
    </div>
  );
}

window.Websites = Websites;
