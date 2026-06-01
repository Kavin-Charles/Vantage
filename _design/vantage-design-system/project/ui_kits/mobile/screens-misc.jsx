/* Misc screens — Analytics, More, Settings. */

// ─── ANALYTICS ──────────────────────────────────────────────────────────────
function AnalyticsScreen({ nav }) {
  const [range, setRange] = React.useState('30d');

  return (
    <>
      <MobileHeader title="Analytics" large eyebrow="Last 30 days" onBack={() => nav.back()} />
      <ScreenBody>
        <Section>
          <Segmented value={range} onChange={setRange} options={[
            { id: '7d',  label: '7d' },
            { id: '30d', label: '30d' },
            { id: '90d', label: '90d' },
            { id: 'ytd', label: 'YTD' },
          ]} />
        </Section>

        <Section eyebrow="Pipeline">
          <Card style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
                  textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4,
                }}>Pipeline value</div>
                <div className="vt-display" style={{ fontSize: 30, color: 'var(--text)' }}>$129.8K</div>
              </div>
              <Badge label="+12.4%" color="green" size="md" />
            </div>
            <BigChart data={KPIS.pipeline.spark} color="var(--text)" />
            <div style={{
              display: 'flex', justifyContent: 'space-between', marginTop: 8,
              fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)',
            }}>
              <span>Apr 28</span><span>May 12</span><span>May 28</span>
            </div>
          </Card>
        </Section>

        <Section eyebrow="Stage breakdown">
          <Card>
            {STAGES.filter(s => s.id !== 'won' && s.id !== 'lost').map((s, i, arr) => {
              const deals = DEALS.filter(d => d.stage === s.id);
              const val = deals.reduce((sum, d) => sum + d.value, 0);
              const max = 60000;
              const pct = Math.min(100, (val / max) * 100);
              return (
                <div key={s.id} style={{ marginBottom: i === arr.length - 1 ? 0 : 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Badge label={s.name} color={s.badge} />
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{deals.length}</span>
                    </span>
                    <span className="vt-display" style={{ fontSize: 15, color: 'var(--text)' }}>{fmtMoneyShort(val)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: `var(--${s.badge === 'gray' ? 'text2' : s.badge})`,
                      borderRadius: 3,
                    }} />
                  </div>
                </div>
              );
            })}
          </Card>
        </Section>

        <Section eyebrow="Infrastructure">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <KpiTile label="Uptime"   value="99.92%" delta="−0.04%" deltaTone="red"
              sparkline={<Sparkline data={KPIS.uptime.spark.map(v => v * 10)} />} />
            <KpiTile label="Avg ping" value="14ms"   delta="+2ms" deltaTone="red"
              sparkline={<Sparkline data={[10,11,12,11,13,12,14,15,13,14,15,14,14]} />} />
            <KpiTile label="Servers"  value="6"      delta="online 4"
              sparkline={<Sparkline data={[6,6,6,6,5,6,6,6,5,6,6,4,4]} />} />
            <KpiTile label="Alerts"   value="6"      delta="2 critical" deltaTone="red"
              sparkline={<Sparkline data={[2,3,3,4,3,4,5,4,5,4,6,7,6]} />} />
          </div>
        </Section>
      </ScreenBody>
    </>
  );
}

function BigChart({ data, color = 'var(--text)' }) {
  const w = 332, h = 96;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * stepX).toFixed(1)},${(h - ((v - min) / range) * (h - 4) - 2).toFixed(1)}`);
  const linePath = `M ${pts.join(' L ')}`;
  const areaPath = `${linePath} L ${w},${h} L 0,${h} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="vt-chart-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#vt-chart-grad)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── MORE ────────────────────────────────────────────────────────────────────
function MoreScreen({ nav }) {
  return (
    <>
      <MobileHeader title="More" large />
      <ScreenBody>
        {/* User card */}
        <Card style={{ marginBottom: 20, padding: 14 }}
          onClick={() => nav.go('settings')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={ACTIVE_USER.name} size={44} tone="ink" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{ACTIVE_USER.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{ACTIVE_USER.role} · {ACTIVE_USER.email}</div>
            </div>
            <Icon name="chevronRight" size={16} color="var(--text3)" />
          </div>
        </Card>

        <Section eyebrow="CRM">
          <ListGroup>
            <ListRow icon="contacts"  iconBg="var(--blue-bg)"   title="Contacts"  subtitle="47 people"      onClick={() => nav.go('contacts')} />
            <ListRow icon="companies" iconBg="var(--purple-bg)" title="Companies" subtitle="12 accounts"    onClick={() => {}} />
            <ListRow icon="tasks"     iconBg="var(--amber-bg)"  title="Tasks"     subtitle="4 open"         onClick={() => nav.go('tasks')} />
            <ListRow icon="mail"      iconBg="var(--green-bg)"  title="Mail"      subtitle="Inbox empty"    onClick={() => {}} last />
          </ListGroup>
        </Section>

        <Section eyebrow="Infrastructure">
          <ListGroup>
            <ListRow icon="databases" iconBg="var(--blue-bg)"   title="Databases" subtitle="4 instances"    onClick={() => {}} />
            <ListRow icon="websites"  iconBg="var(--purple-bg)" title="Websites"  subtitle="8 monitored"    onClick={() => {}} />
            <ListRow icon="files"     iconBg="var(--green-bg)"  title="Files"     subtitle="2.3 GB"         onClick={() => {}} last />
          </ListGroup>
        </Section>

        <Section eyebrow="General">
          <ListGroup>
            <ListRow icon="analytics" iconBg="var(--surface2)"  title="Analytics" subtitle="Reports + KPIs" onClick={() => nav.go('analytics')} />
            <ListRow icon="alerts"    iconBg="var(--red-bg)"
              title="Alerts" subtitle="6 active · 2 critical"
              right={<Badge label="2" color="red" />}
              onClick={() => nav.go('alerts')} />
            <ListRow icon="settings"  iconBg="var(--surface2)"  title="Settings"  subtitle="Profile, theme" onClick={() => nav.go('settings')} last />
          </ListGroup>
        </Section>

        <div style={{ textAlign: 'center', marginTop: 14, marginBottom: 8 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 4,
          }}>Vantage</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
            v2.4.1 · build 18293
          </div>
        </div>
      </ScreenBody>
    </>
  );
}

// ─── SETTINGS ───────────────────────────────────────────────────────────────
function SettingsScreen({ nav }) {
  const [push, setPush] = React.useState(true);
  const [biometric, setBiometric] = React.useState(true);
  const [criticalOnly, setCriticalOnly] = React.useState(false);

  return (
    <>
      <MobileHeader title="Settings" onBack={() => nav.back()} />
      <ScreenBody>
        {/* Profile card */}
        <Card style={{ marginBottom: 18, padding: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Avatar name={ACTIVE_USER.name} size={64} tone="ink" />
            <div className="vt-display" style={{ fontSize: 19, color: 'var(--text)' }}>{ACTIVE_USER.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>{ACTIVE_USER.email}</div>
            <Badge label={ACTIVE_USER.role} color="blue" size="md" />
          </div>
        </Card>

        <Section eyebrow="Account">
          <ListGroup>
            <ListRow icon="contacts"  title="Profile"       subtitle="Name, email, avatar"     onClick={() => {}} />
            <ListRow icon="companies" title="Workspace"     subtitle="Vantage · 8 members"     onClick={() => {}} />
            <ListRow icon="settings"  title="API & tokens"  subtitle="Personal access tokens"  onClick={() => {}} last />
          </ListGroup>
        </Section>

        <Section eyebrow="Notifications">
          <ListGroup>
            <ToggleRow label="Push notifications" subtitle="Alerts, mentions, task reminders" value={push} onChange={setPush} />
            <ToggleRow label="Critical only"      subtitle="Mute everything but red alerts"   value={criticalOnly} onChange={setCriticalOnly} last />
          </ListGroup>
        </Section>

        <Section eyebrow="Security">
          <ListGroup>
            <ToggleRow label="Face ID"      subtitle="Unlock with biometrics" value={biometric} onChange={setBiometric} />
            <ListRow   icon="settings"      title="Change password"           subtitle="Last changed 3 months ago" onClick={() => {}} />
            <ListRow   icon="settings"      title="Active sessions"           subtitle="3 devices"                 onClick={() => {}} last />
          </ListGroup>
        </Section>

        <Section eyebrow="About">
          <ListGroup>
            <ListRow icon="files"  title="Documentation"  onClick={() => {}} right={<Icon name="external" size={14} />} />
            <ListRow icon="alerts" title="Status page"    onClick={() => {}} right={<Icon name="external" size={14} />} />
            <ListRow icon="note"   title="What's new"     subtitle="v2.4.1 — 3 days ago" onClick={() => {}} last />
          </ListGroup>
        </Section>

        <div style={{ marginTop: 8 }}>
          <Btn variant="danger" style={{ width: '100%' }} leading="logout">Sign out</Btn>
        </div>

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <LogoMark size={28} />
          <div style={{
            fontSize: 10, fontWeight: 600, color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: 1.4, marginTop: 6,
          }}>Vantage Mobile</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>v2.4.1</div>
        </div>
      </ScreenBody>
    </>
  );
}

function ToggleRow({ label, subtitle, value, onChange, last }) {
  const { accent } = useTheme();
  return (
    <div onClick={() => onChange(!value)} className="vt-press"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        minHeight: 52, boxSizing: 'border-box',
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{subtitle}</div>}
      </div>
      <Toggle value={value} onChange={onChange} accent={accent} />
    </div>
  );
}

function Toggle({ value, onChange, accent }) {
  return (
    <div onClick={(e) => { e.stopPropagation(); onChange(!value); }}
      style={{
        width: 44, height: 26, borderRadius: 999,
        background: value ? accent : 'var(--border2)',
        position: 'relative', cursor: 'pointer',
        transition: 'background .15s',
        flexShrink: 0,
      }}>
      <div style={{
        position: 'absolute', top: 2, left: value ? 20 : 2,
        width: 22, height: 22, borderRadius: 999, background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        transition: 'left .15s',
      }} />
    </div>
  );
}

Object.assign(window, {
  AnalyticsScreen, BigChart,
  MoreScreen, SettingsScreen,
  ToggleRow, Toggle,
});
