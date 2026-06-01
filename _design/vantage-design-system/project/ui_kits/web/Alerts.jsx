/* Alerts — severity-tabbed list with Acknowledge / Resolve actions. */

const SEV_COLOR = { critical: 'red', warning: 'amber', info: 'blue' };

const SEED_ALERTS = [
  { id: 'al1', sev: 'critical', message: 'prod-worker-01: Memory usage at 91.7% — above critical threshold (90%)', resource: 'server',   at: '2m ago',  ack: false, res: false },
  { id: 'al2', sev: 'warning',  message: 'prod-api-01: CPU usage at 71.5% sustained for 10 minutes',               resource: 'server',   at: '4m ago',  ack: true,  res: false },
  { id: 'al3', sev: 'warning',  message: 'Database "prod-postgres" (postgres) is unreachable',                      resource: 'database', at: '12m ago', ack: false, res: false },
  { id: 'al4', sev: 'info',     message: 'staging-01 recovered — memory back below 70%',                           resource: 'server',   at: '23m ago', ack: false, res: true  },
  { id: 'al5', sev: 'warning',  message: 'app.cobaltsystems.com response time degraded (1247ms)',                  resource: 'website',  at: '38m ago', ack: false, res: false },
  { id: 'al6', sev: 'critical', message: 'legacy.orbitcloud.io is down — 4 consecutive failed pings',              resource: 'website',  at: '1h ago',  ack: false, res: false },
  { id: 'al7', sev: 'info',     message: 'analytics-clickhouse SSL certificate expires in 8 days',                 resource: 'database', at: '3h ago',  ack: true,  res: true  },
];

function Alerts() {
  const [alerts, setAlerts] = React.useState(SEED_ALERTS);
  const [tab, setTab]       = React.useState('unresolved');

  const filtered = alerts.filter(a => {
    if (tab === 'all') return true;
    if (tab === 'unresolved') return !a.res;
    return a.sev === tab && !a.res;
  });

  const counts = {
    all: alerts.length,
    unresolved: alerts.filter(a => !a.res).length,
    critical: alerts.filter(a => a.sev === 'critical' && !a.res).length,
    warning:  alerts.filter(a => a.sev === 'warning'  && !a.res).length,
    info:     alerts.filter(a => a.sev === 'info'     && !a.res).length,
  };

  const ack     = (id) => setAlerts(as => as.map(a => a.id === id ? { ...a, ack: true } : a));
  const resolve = (id) => setAlerts(as => as.map(a => a.id === id ? { ...a, res: true } : a));

  return (
    <div style={{ padding: 24 }}>
      <div style={{
        display: 'inline-flex', gap: 0,
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 3, marginBottom: 16,
      }}>
        {['all', 'unresolved', 'critical', 'warning', 'info'].map(f => {
          const on = tab === f;
          return (
            <button key={f} onClick={() => setTab(f)}
              style={{
                padding: '5px 14px', borderRadius: 8, border: 'none',
                background: on ? 'var(--text)' : 'transparent',
                color: on ? '#fff' : 'var(--text2)',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', transition: 'all .15s',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span style={{ fontSize: 11, opacity: on ? 0.7 : 0.6, fontWeight: 600 }}>{counts[f]}</span>
            </button>
          );
        })}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 50, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No alerts.</div>
        ) : filtered.map((a, i) => <AlertRow key={a.id} a={a} last={i === filtered.length - 1} onAck={() => ack(a.id)} onResolve={() => resolve(a.id)} />)}
      </div>
    </div>
  );
}

function AlertRow({ a, last, onAck, onResolve }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '13px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s',
      }}>
      <Badge label={a.sev} color={SEV_COLOR[a.sev]} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginBottom: 3 }}>{a.message}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{a.resource}</span>
          <span>·</span>
          <span>{a.at}</span>
          {a.ack && !a.res && <><span>·</span><span style={{ color: 'var(--text2)' }}>acknowledged</span></>}
          {a.res && <><span>·</span><span style={{ color: 'var(--green)', fontWeight: 600 }}>resolved</span></>}
        </div>
      </div>
      {!a.ack && !a.res && (
        <Button onClick={onAck} style={{ padding: '5px 12px', fontSize: 12 }}>Acknowledge</Button>
      )}
      {!a.res && (
        <Button variant="danger" onClick={onResolve} style={{ padding: '5px 12px', fontSize: 12 }}>Resolve</Button>
      )}
    </div>
  );
}

window.Alerts = Alerts;
