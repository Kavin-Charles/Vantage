/* Databases — table with engine badges + status. */

const ENGINE_COLOR = {
  postgres: 'blue', mysql: 'amber', redis: 'red',
  clickhouse: 'purple', mongo: 'green', other: 'gray',
};

const SEED_DBS = [
  { id: 'db1', name: 'prod-redis',          engine: 'redis',      host: 'cache.internal.acme.com',     port: 6379, status: 'offline', lastChecked: '5/13/2026, 11:43:01 PM' },
  { id: 'db2', name: 'analytics-clickhouse', engine: 'clickhouse', host: 'analytics.internal.acme.com', port: 9000, status: 'offline', lastChecked: '5/13/2026, 11:43:01 PM' },
  { id: 'db3', name: 'prod-postgres',        engine: 'postgres',   host: 'db.internal.acme.com',         port: 5432, status: 'offline', lastChecked: '5/13/2026, 11:43:01 PM' },
];

function Databases() {
  const [dbs] = React.useState(SEED_DBS);
  const cols = 'minmax(160px,1.4fr) .8fr 1.6fr .6fr .8fr 1.2fr auto';
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text2)' }}>{dbs.length} databases</div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'center',
          padding: '12px 18px', borderBottom: '1px solid var(--border)',
        }}>
          {['Name','Engine','Host','Port','Status','Last checked'].map(h => <Eyebrow key={h}>{h}</Eyebrow>)}
          <span/>
        </div>
        {dbs.map((d, i) => <DBRow key={d.id} d={d} cols={cols} last={i === dbs.length - 1} />)}
      </div>
    </div>
  );
}

function DBRow({ d, cols, last }) {
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
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text)' }}>{d.name}</span>
      <span><Badge label={d.engine} color={ENGINE_COLOR[d.engine] ?? 'gray'} /></span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text2)' }}>{d.host}</span>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{d.port}</span>
      <span><Badge label={d.status} color={STATUS_COLOR[d.status] ?? 'gray'} /></span>
      <span style={{ color: 'var(--text2)' }}>{d.lastChecked}</span>
      <Button style={{ padding: '4px 12px', fontSize: 12 }}>Remove</Button>
    </div>
  );
}

window.Databases = Databases;
