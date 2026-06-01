/* Home + Activity + Tasks screens.
   Navigation is provided via `nav` prop: nav.go(screenId, params), nav.back(). */

// ─── HOME ───────────────────────────────────────────────────────────────────
function HomeScreen({ nav }) {
  const { accent } = useTheme();
  const criticals = ALERTS.filter(a => a.sev === 'critical' && !a.res);
  const warnings  = ALERTS.filter(a => a.sev === 'warning'  && !a.res);

  return (
    <>
      {/* Header — full bleed brand strip with greeting */}
      <div style={{
        flexShrink: 0,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '12px 16px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 11,
            background: 'var(--bg)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            <LogoMark size={28} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: 1.2,
            }}>Tuesday · May 28</div>
            <div className="vt-display" style={{ fontSize: 18, color: 'var(--text)', lineHeight: 1.1 }}>
              Good morning, Nina.
            </div>
          </div>
          <button onClick={() => nav.go('alerts')} className="vt-press"
            style={{
              position: 'relative',
              background: 'none', border: '1px solid var(--border)',
              width: 36, height: 36, borderRadius: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text2)',
            }}>
            <Icon name="bell" size={17} />
            <span style={{
              position: 'absolute', top: 6, right: 6,
              width: 7, height: 7, borderRadius: 999, background: 'var(--red)',
              border: '1.5px solid var(--surface)',
            }}/>
          </button>
        </div>
      </div>

      <ScreenBody>
        {/* Hero alert card — only renders if there's something hot */}
        {criticals.length > 0 && (
          <Card pad={0} style={{
            marginBottom: 16, overflow: 'hidden',
            background: 'linear-gradient(180deg,#fff7ed 0%,#fef3c7 100%)',
            borderColor: 'var(--border)',
          }}
            onClick={() => nav.go('alerts')}
          >
            <div style={{ padding: '14px 16px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ position: 'relative', width: 8, height: 8 }}>
                  <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: 'var(--red)' }} />
                  <span className="vt-pulse-ring" style={{ background: 'var(--red)' }} />
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: 1.2 }}>
                  {criticals.length + warnings.length} active alerts
                </span>
                <span style={{ marginLeft: 'auto', display: 'inline-flex', color: 'var(--amber)' }}>
                  <Icon name="arrow" size={14} />
                </span>
              </div>
              <div style={{
                fontSize: 13, color: 'var(--text)', fontWeight: 500,
                lineHeight: 1.4,
              }}>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>
                  {criticals[0].resource}
                </strong>{' '}
                — memory 91.7% above 90% threshold
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.4)' }}>
              {[
                ['critical', 'red',   criticals.length],
                ['warning',  'amber', warnings.length],
                ['info',     'blue',  ALERTS.filter(a => a.sev==='info' && !a.res).length],
              ].map(([sev, tone, n]) => (
                <div key={sev} style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 8px',
                  background: `var(--${tone}-bg)`, borderRadius: 8,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: 999, background: `var(--${tone})` }} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: `var(--${tone})`, textTransform: 'uppercase', letterSpacing: 0.6 }}>{sev}</span>
                  <span className="vt-display" style={{ marginLeft: 'auto', fontSize: 14, color: `var(--${tone})` }}>{n}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* KPI grid */}
        <Section eyebrow="Today">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <KpiTile label="Pipeline"  value={KPIS.pipeline.value}  delta={KPIS.pipeline.delta}  sparkline={<Sparkline data={KPIS.pipeline.spark} />} />
            <KpiTile label="MRR"       value={KPIS.revenue.value}   delta={KPIS.revenue.delta}   sparkline={<Sparkline data={KPIS.revenue.spark} />} />
            <KpiTile label="Contacts"  value={KPIS.contacts.value}  delta={KPIS.contacts.delta}  sparkline={<Sparkline data={KPIS.contacts.spark} />} />
            <KpiTile label="Uptime"    value={KPIS.uptime.value}    delta={KPIS.uptime.delta}    deltaTone="red" sparkline={<Sparkline data={KPIS.uptime.spark.map(v => v*100)} />} />
          </div>
        </Section>

        {/* Tasks due today */}
        <Section eyebrow={`Tasks · ${TASKS.filter(t => !t.done && t.due==='Today').length} due today`}
          action={
            <button onClick={() => nav.go('tasks')} style={{
              background: 'none', border: 'none', color: accent,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
              fontFamily: 'inherit',
            }}>See all</button>
          }>
          <ListGroup>
            {TASKS.filter(t => !t.done).slice(0, 3).map((t, i, arr) => (
              <ListRow key={t.id}
                icon={<TaskCheck done={t.done} prio={t.prio} />}
                iconBg="transparent"
                title={t.title}
                subtitle={`${t.due}${t.contact ? ' · ' + t.contact : ''}`}
                right={<Badge label={t.prio} color={PRIO_BADGE[t.prio]} />}
                last={i === arr.length - 1}
                onClick={() => {}}
              />
            ))}
          </ListGroup>
        </Section>

        {/* Recent activity preview */}
        <Section eyebrow="Recent activity"
          action={
            <button onClick={() => nav.go('activity')} style={{
              background: 'none', border: 'none', color: accent,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
              fontFamily: 'inherit',
            }}>See all</button>
          }>
          <ListGroup>
            {ACTIVITIES.slice(0, 3).map((a, i, arr) => (
              <ActivityRow key={a.id} a={a} last={i === arr.length - 1} onClick={() => nav.go('activity')} />
            ))}
          </ListGroup>
        </Section>
      </ScreenBody>
    </>
  );
}

// ─── ACTIVITY FEED ──────────────────────────────────────────────────────────
function ActivityScreen({ nav }) {
  const [type, setType] = React.useState('all');

  const types = [
    { id: 'all',     label: 'All' },
    { id: 'call',    label: 'Calls' },
    { id: 'mail',    label: 'Email' },
    { id: 'note',    label: 'Notes' },
  ];

  const filtered = ACTIVITIES.filter(a => {
    if (type === 'all') return true;
    if (type === 'call') return a.type === 'call' || a.type === 'phone';
    return a.type === type;
  });

  // group by day-ish label
  const groups = React.useMemo(() => {
    const map = new Map();
    filtered.forEach(a => {
      const key = /ago|now/i.test(a.at) ? 'Today' : a.at;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    });
    return [...map.entries()];
  }, [filtered]);

  return (
    <>
      <MobileHeader title="Activity" large eyebrow={`${filtered.length} entries`} />
      <ScreenBody>
        <Section>
          <Segmented value={type} onChange={setType} options={types} />
        </Section>
        {groups.map(([day, items]) => (
          <Section key={day} eyebrow={day}>
            <ListGroup>
              {items.map((a, i) => (
                <ActivityRow key={a.id} a={a} last={i === items.length - 1} onClick={() => {}} />
              ))}
            </ListGroup>
          </Section>
        ))}
      </ScreenBody>
    </>
  );
}

function ActivityRow({ a, last, onClick }) {
  const t = ACTIVITY_TYPE[a.type] ?? ACTIVITY_TYPE.note;
  return (
    <div onClick={onClick} className={onClick ? 'vt-press' : ''}
      style={{
        display: 'flex', gap: 12, padding: '12px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9,
        background: `var(--${t.tone}-bg)`, color: `var(--${t.tone})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon name={t.icon} size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.contact}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{t.label}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{a.at}</span>
        </div>
        <div style={{
          fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.4,
          textWrap: 'pretty',
        }}>{a.summary}</div>
      </div>
    </div>
  );
}

// ─── TASKS ──────────────────────────────────────────────────────────────────
function TasksScreen({ nav }) {
  const [filter, setFilter] = React.useState('open');
  const filtered = TASKS.filter(t => filter === 'open' ? !t.done : filter === 'done' ? t.done : true);

  const dueGroups = React.useMemo(() => {
    const order = ['Today', 'Tomorrow', 'This week', 'Later'];
    const map = { Today: [], Tomorrow: [], 'This week': [], Later: [] };
    filtered.forEach(t => {
      const k = t.due === 'Today' ? 'Today' : t.due === 'Tomorrow' ? 'Tomorrow' : t.due === 'Fri' ? 'This week' : 'Later';
      map[k].push(t);
    });
    return order.map(k => [k, map[k]]).filter(([, v]) => v.length);
  }, [filtered]);

  return (
    <>
      <MobileHeader title="Tasks" large eyebrow={`${TASKS.filter(t=>!t.done).length} open`}
        onBack={() => nav.back()} />
      <ScreenBody>
        <Section>
          <Segmented value={filter} onChange={setFilter} options={[
            { id: 'open', label: 'Open',  count: TASKS.filter(t=>!t.done).length },
            { id: 'done', label: 'Done',  count: TASKS.filter(t=>t.done).length },
            { id: 'all',  label: 'All',   count: TASKS.length },
          ]} />
        </Section>
        {dueGroups.map(([day, items]) => (
          <Section key={day} eyebrow={day}>
            <ListGroup>
              {items.map((t, i) => (
                <ListRow key={t.id}
                  icon={<TaskCheck done={t.done} prio={t.prio} />}
                  iconBg="transparent"
                  title={t.title}
                  subtitle={t.contact ? `Linked to ${t.contact}` : 'Internal'}
                  right={<Badge label={t.prio} color={PRIO_BADGE[t.prio]} />}
                  last={i === items.length - 1}
                  onClick={() => {}}
                />
              ))}
            </ListGroup>
          </Section>
        ))}
      </ScreenBody>
    </>
  );
}

function TaskCheck({ done, prio }) {
  const color = done ? 'var(--green)' : prio === 'urgent' ? 'var(--red)' : prio === 'high' ? 'var(--amber)' : 'var(--text3)';
  return (
    <span style={{
      width: 20, height: 20, borderRadius: 6,
      border: `1.5px solid ${color}`,
      background: done ? color : 'transparent',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff',
    }}>
      {done && <Icon name="check" size={13} strokeWidth={2.4} />}
    </span>
  );
}

Object.assign(window, { HomeScreen, ActivityScreen, ActivityRow, TasksScreen, TaskCheck });
