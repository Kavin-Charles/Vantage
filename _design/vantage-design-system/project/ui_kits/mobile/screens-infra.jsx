/* Infra screens — Servers, ServerDetail, Alerts. */

// ─── SERVERS LIST ───────────────────────────────────────────────────────────
function ServersScreen({ nav }) {
  const [filter, setFilter] = React.useState('all');
  const filtered = filter === 'all' ? SERVERS : SERVERS.filter(s => s.status === filter);
  const counts = {
    all: SERVERS.length,
    online: SERVERS.filter(s => s.status === 'online').length,
    degraded: SERVERS.filter(s => s.status === 'degraded').length,
    offline: SERVERS.filter(s => s.status === 'offline').length,
  };
  return (
    <>
      <MobileHeader title="Servers" large
        eyebrow={
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <StatDotSet counts={counts} />
          </span>
        }
        right={
          <button className="vt-press" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text)', padding: 8, display: 'flex',
          }}><Icon name="plus" size={20} /></button>
        } />
      <ScreenBody>
        <Section>
          <Segmented value={filter} onChange={setFilter} options={[
            { id: 'all',      label: 'All',      count: counts.all },
            { id: 'online',   label: 'Online',   count: counts.online },
            { id: 'degraded', label: 'Degraded', count: counts.degraded },
            { id: 'offline',  label: 'Offline',  count: counts.offline },
          ]} />
        </Section>
        <ListGroup>
          {filtered.map((s, i) => (
            <ServerRow key={s.id} s={s} last={i === filtered.length - 1}
              onClick={() => nav.go('server', { id: s.id })} />
          ))}
        </ListGroup>
      </ScreenBody>
    </>
  );
}

function StatDotSet({ counts }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textTransform: 'none', letterSpacing: 0 }}>
      <span style={{ display:'inline-flex', alignItems:'center', gap: 5 }}>
        <StatusDot color="var(--green)" /> <span style={{ color: 'var(--text2)', fontSize: 11, fontWeight: 500 }}>{counts.online}</span>
      </span>
      <span style={{ display:'inline-flex', alignItems:'center', gap: 5 }}>
        <StatusDot color="var(--amber)" /> <span style={{ color: 'var(--text2)', fontSize: 11, fontWeight: 500 }}>{counts.degraded}</span>
      </span>
      <span style={{ display:'inline-flex', alignItems:'center', gap: 5 }}>
        <StatusDot color="var(--red)" pulse={counts.offline > 0} /> <span style={{ color: 'var(--text2)', fontSize: 11, fontWeight: 500 }}>{counts.offline}</span>
      </span>
    </span>
  );
}

function ServerRow({ s, last, onClick }) {
  const sb = STATUS_BADGE[s.status];
  const spark = SERVER_SPARK[s.status] ?? SERVER_SPARK.online;
  const sparkColor = s.status === 'online' ? 'var(--green)' : s.status === 'degraded' ? 'var(--amber)' : 'var(--red)';
  return (
    <div onClick={onClick} className="vt-press"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <StatusDot color={sb.dot} pulse={s.status === 'offline'} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color: 'var(--text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{s.name}</span>
        </div>
        <div style={{
          fontSize: 11, color: 'var(--text3)',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{s.host}</span>
          <span>·</span>
          <span>{s.region}</span>
          <span>·</span>
          <span>{s.status === 'offline' ? 'down' : `${s.cpu}% CPU`}</span>
        </div>
      </div>
      <div style={{ color: sparkColor, marginRight: 8 }}>
        <Sparkline data={spark} width={48} height={20} />
      </div>
      <Icon name="chevronRight" size={15} color="var(--text3)" />
    </div>
  );
}

// ─── SERVER DETAIL ──────────────────────────────────────────────────────────
function ServerDetailScreen({ nav, params }) {
  const s = SERVERS.find(x => x.id === params.id) ?? SERVERS[0];
  const sb = STATUS_BADGE[s.status];
  const spark = SERVER_SPARK[s.status] ?? SERVER_SPARK.online;
  const sparkColor = s.status === 'online' ? 'var(--green)' : s.status === 'degraded' ? 'var(--amber)' : 'var(--red)';
  const serverAlerts = ALERTS.filter(a => a.resource === s.name && !a.res);

  return (
    <>
      <MobileHeader title={s.name} onBack={() => nav.back()}
        right={<button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text2)', padding:8, display:'flex' }}><Icon name="more" size={20}/></button>} />
      <ScreenBody>
        {/* Status hero */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <StatusDot color={sb.dot} pulse={s.status === 'offline'} />
            <span style={{
              fontSize: 11, fontWeight: 700, color: `var(--${sb.color})`,
              textTransform: 'uppercase', letterSpacing: 1.2,
            }}>{s.status}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>
              {s.status === 'offline' ? 'No response' : `ping ${s.ping}`}
            </span>
          </div>
          <div style={{ color: sparkColor, marginBottom: 10 }}>
            <Sparkline data={spark} width={332} height={56} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 600,
          }}>
            <span>CPU usage · last 60 min</span>
            <span style={{ color: 'var(--text2)' }}>{s.cpu}% avg</span>
          </div>
        </Card>

        {/* Vital tiles */}
        <Section eyebrow="Vitals">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <VitalTile icon="cpu"  label="CPU"  value={`${s.cpu}%`}  tone={s.cpu  > 80 ? 'red' : s.cpu  > 60 ? 'amber' : 'green'} />
            <VitalTile icon="ram"  label="MEM"  value={`${s.mem}%`}  tone={s.mem  > 85 ? 'red' : s.mem  > 65 ? 'amber' : 'green'} />
            <VitalTile icon="disk" label="DISK" value={`${s.disk}%`} tone={s.disk > 80 ? 'red' : s.disk > 60 ? 'amber' : 'green'} />
          </div>
        </Section>

        {/* Info */}
        <Section eyebrow="Info">
          <ListGroup>
            <KvRow label="Host"     value={s.host} mono />
            <KvRow label="Region"   value={s.region} />
            <KvRow label="Uptime"   value={s.uptime} />
            <KvRow label="Last ping" value={s.ping} last />
          </ListGroup>
        </Section>

        {/* Alerts on this server */}
        {serverAlerts.length > 0 && (
          <Section eyebrow={`${serverAlerts.length} active alert${serverAlerts.length>1?'s':''}`}
            action={
              <button onClick={() => nav.go('alerts')} style={{
                background:'none', border:'none', color:'var(--text2)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
                fontFamily: 'inherit',
              }}>See all</button>
            }>
            <ListGroup>
              {serverAlerts.map((a, i) => (
                <AlertRow key={a.id} a={a} last={i === serverAlerts.length - 1} compact />
              ))}
            </ListGroup>
          </Section>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Btn variant="secondary" style={{ flex: 1 }}>Restart</Btn>
          <Btn variant="secondary" style={{ flex: 1 }}>SSH</Btn>
          <Btn variant="primary"   style={{ flex: 1 }}>Logs</Btn>
        </div>
      </ScreenBody>
    </>
  );
}

function VitalTile({ icon, label, value, tone }) {
  const c = `var(--${tone})`;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: c, marginBottom: 6 }}>
        <Icon name={icon} size={14} />
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2,
        }}>{label}</span>
      </div>
      <div className="vt-display" style={{ fontSize: 22, color: 'var(--text)', lineHeight: 1, marginBottom: 8, letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--surface2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: value, background: c, borderRadius: 2 }} />
      </div>
    </div>
  );
}

function KvRow({ label, value, mono, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '11px 14px',
      borderBottom: last ? 'none' : '1px solid var(--border)',
      gap: 12,
    }}>
      <span style={{ fontSize: 13, color: 'var(--text2)' }}>{label}</span>
      <span style={{
        fontSize: 13, color: 'var(--text)',
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        textAlign: 'right',
      }}>{value}</span>
    </div>
  );
}

// ─── ALERTS ─────────────────────────────────────────────────────────────────
function AlertsScreen({ nav }) {
  const [tab, setTab] = React.useState('unresolved');
  const filtered = ALERTS.filter(a => {
    if (tab === 'all') return true;
    if (tab === 'unresolved') return !a.res;
    return a.sev === tab && !a.res;
  });
  const counts = {
    all: ALERTS.length,
    unresolved: ALERTS.filter(a => !a.res).length,
    critical: ALERTS.filter(a => a.sev === 'critical' && !a.res).length,
    warning:  ALERTS.filter(a => a.sev === 'warning'  && !a.res).length,
  };

  return (
    <>
      <MobileHeader title="Alerts" large eyebrow={`${counts.unresolved} unresolved`} onBack={() => nav.back()} />
      <ScreenBody>
        <Section>
          <Segmented value={tab} onChange={setTab} options={[
            { id: 'unresolved', label: 'Open',      count: counts.unresolved },
            { id: 'critical',   label: 'Critical',  count: counts.critical },
            { id: 'warning',    label: 'Warning',   count: counts.warning },
            { id: 'all',        label: 'All',       count: counts.all },
          ]} />
        </Section>
        <ListGroup>
          {filtered.length === 0
            ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No alerts.</div>
            : filtered.map((a, i) => (
                <AlertRow key={a.id} a={a} last={i === filtered.length - 1}
                  onClick={() => {
                    if (a.resType === 'server') {
                      const srv = SERVERS.find(s => s.name === a.resource);
                      if (srv) nav.go('server', { id: srv.id });
                    }
                  }}
                />
              ))
          }
        </ListGroup>
      </ScreenBody>
    </>
  );
}

function AlertRow({ a, last, onClick, compact }) {
  const sev = SEV_COLOR[a.sev];
  return (
    <div onClick={onClick} className={onClick ? 'vt-press' : ''}
      style={{
        display: 'flex', gap: 12, padding: compact ? '10px 14px' : '13px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}>
      <div style={{
        width: 8, alignSelf: 'stretch', borderRadius: 4,
        background: `var(--${sev})`, flexShrink: 0, marginTop: 2, marginBottom: 2,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
          <Badge label={a.sev} color={sev} />
          <span style={{ fontSize: 10.5, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{a.resource}</span>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text3)' }}>{a.at}</span>
        </div>
        <div style={{
          fontSize: 12.5, color: 'var(--text)', lineHeight: 1.4,
          textWrap: 'pretty',
        }}>{a.message}</div>
        {a.ack && !a.res && (
          <div style={{ fontSize: 10.5, color: 'var(--text2)', marginTop: 4 }}>· Acknowledged</div>
        )}
        {a.res && (
          <div style={{ fontSize: 10.5, color: 'var(--green)', marginTop: 4, fontWeight: 600 }}>· Resolved</div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, {
  ServersScreen, ServerRow, ServerDetailScreen,
  AlertsScreen, AlertRow, VitalTile, KvRow, StatDotSet,
});
