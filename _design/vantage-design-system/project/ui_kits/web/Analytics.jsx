/* Analytics — KPI strip + revenue chart (gridded SVG) + pipeline-by-stage chart
   + rep leaderboard. Mirrors apps/web/app/(dashboard)/analytics/. */

const ANALYTICS_DATA = {
  '30D': {
    total_revenue: 33600, deals_won: 2, win_rate: 0.67, avg_deal_size: 16800,
    revenue: [
      { label: 'Apr 13', value: 0 },
      { label: 'Apr 20', value: 9600 },
      { label: 'Apr 27', value: 0 },
      { label: 'May 4',  value: 0 },
      { label: 'May 11', value: 24000 },
    ],
    stages: [
      { id: 'lead',       name: 'Lead',       color: '#6366f1', count: 2, value: 5790 },
      { id: 'qualifying', name: 'Qualifying', color: '#1e3a8a', count: 2, value: 73000 },
      { id: 'proposal',   name: 'Proposal',   color: '#92400e', count: 1, value: 12000 },
      { id: 'closing',    name: 'Closing',    color: '#4c1d95', count: 1, value: 36000 },
    ],
    leaderboard: [
      { id: 'u1', name: 'Nina Park',     won: 1, revenue: 24000, winRate: 0.67 },
      { id: 'u2', name: 'James Okafor',  won: 1, revenue: 9600,  winRate: 0.50 },
      { id: 'u3', name: 'Tom Weston',    won: 0, revenue: 0,     winRate: 0    },
    ],
  },
  '90D': {
    total_revenue: 184200, deals_won: 9, win_rate: 0.58, avg_deal_size: 20467,
    revenue: [
      { label: 'Feb 14', value: 12000 },
      { label: 'Feb 28', value: 20000 },
      { label: 'Mar 14', value: 24400 },
      { label: 'Mar 28', value: 36000 },
      { label: 'Apr 11', value: 28800 },
      { label: 'Apr 25', value: 49000 },
      { label: 'May 9',  value: 14000 },
    ],
    stages: [
      { id: 'lead',       name: 'Lead',       color: '#6366f1', count: 5, value: 14790 },
      { id: 'qualifying', name: 'Qualifying', color: '#1e3a8a', count: 6, value: 142000 },
      { id: 'proposal',   name: 'Proposal',   color: '#92400e', count: 3, value: 38000 },
      { id: 'closing',    name: 'Closing',    color: '#4c1d95', count: 3, value: 96000 },
    ],
    leaderboard: [
      { id: 'u1', name: 'Nina Park',     won: 4, revenue: 92500, winRate: 0.64 },
      { id: 'u2', name: 'James Okafor',  won: 3, revenue: 56400, winRate: 0.55 },
      { id: 'u3', name: 'Tom Weston',    won: 2, revenue: 35300, winRate: 0.50 },
    ],
  },
  '12M': {
    total_revenue: 928400, deals_won: 41, win_rate: 0.52, avg_deal_size: 22644,
    revenue: [
      { label: 'Jun 25', value: 38000 }, { label: 'Jul 25', value: 52000 }, { label: 'Aug 25', value: 41000 },
      { label: 'Sep 25', value: 68000 }, { label: 'Oct 25', value: 74000 }, { label: 'Nov 25', value: 56000 },
      { label: 'Dec 25', value: 88000 }, { label: 'Jan 26', value: 124000 },{ label: 'Feb 26', value: 96000 },
      { label: 'Mar 26', value: 142000 },{ label: 'Apr 26', value: 117000 },{ label: 'May 26', value: 32400 },
    ],
    stages: [
      { id: 'lead',       name: 'Lead',       color: '#6366f1', count: 18, value: 84000 },
      { id: 'qualifying', name: 'Qualifying', color: '#1e3a8a', count: 12, value: 312000 },
      { id: 'proposal',   name: 'Proposal',   color: '#92400e', count: 8,  value: 198000 },
      { id: 'closing',    name: 'Closing',    color: '#4c1d95', count: 5,  value: 184000 },
    ],
    leaderboard: [
      { id: 'u1', name: 'Nina Park',     won: 18, revenue: 412000, winRate: 0.58 },
      { id: 'u2', name: 'James Okafor',  won: 12, revenue: 286000, winRate: 0.52 },
      { id: 'u3', name: 'Tom Weston',    won: 7,  revenue: 152000, winRate: 0.47 },
      { id: 'u4', name: 'Priya Nair',    won: 4,  revenue: 78400,  winRate: 0.40 },
    ],
  },
};

function Analytics() {
  const [period, setPeriod] = React.useState('30D');
  const d = ANALYTICS_DATA[period];

  return (
    <div style={{ padding: 24 }}>
      {/* Topbar action mirror — period selector floats top-right of analytics body */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
          {d.deals_won} deals won · {fmtCurrencyShort(d.total_revenue)} this period
        </span>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <Kpi label="Total revenue"  value={fmtCurrencyShort(d.total_revenue)}    delta="+18%" deltaUp />
        <Kpi label="Deals won"      value={String(d.deals_won)}                  delta="+1"   deltaUp />
        <Kpi label="Win rate"       value={`${Math.round(d.win_rate * 100)}%`}   delta="+4pp" deltaUp />
        <Kpi label="Avg deal size"  value={fmtCurrencyShort(d.avg_deal_size)}    delta="-3%"  deltaUp={false} />
      </div>

      {/* Revenue chart */}
      <ChartCard title="Revenue over time" right={`max ${fmtCurrencyShort(Math.max(...d.revenue.map(r => r.value)))}`}>
        <RevenueChart series={d.revenue} />
      </ChartCard>

      {/* Pipeline by stage */}
      <ChartCard title="Pipeline by stage" right={`${d.stages.reduce((s, x) => s + x.count, 0)} deals · ${fmtCurrencyShort(d.stages.reduce((s, x) => s + x.value, 0))}`}>
        <PipelineStageChart stages={d.stages} />
      </ChartCard>

      {/* Leaderboard */}
      <ChartCard title="Rep leaderboard">
        <RepLeaderboard reps={d.leaderboard} />
      </ChartCard>
    </div>
  );
}

// ── KPI card ────────────────────────────────────────────────────────────────
function Kpi({ label, value, delta, deltaUp }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '16px 20px',
    }}>
      <Eyebrow style={{ display: 'block', marginBottom: 8 }}>{label}</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600,
          letterSpacing: '-0.6px', color: 'var(--text)', lineHeight: 1.05,
        }}>{value}</div>
        <div style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
          color: deltaUp ? 'var(--green)' : 'var(--red)',
          background: deltaUp ? 'var(--green-bg)' : 'var(--red-bg)',
          display: 'inline-flex', alignItems: 'center', gap: 3,
        }}>
          <span style={{ transform: deltaUp ? 'none' : 'rotate(180deg)', display: 'inline-flex' }}>
            <Icon name="activity" size={9} />
          </span>
          {delta}
        </div>
      </div>
    </div>
  );
}

// ── Chart shell ─────────────────────────────────────────────────────────────
function ChartCard({ title, right, children }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '18px 22px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
        {right && <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{right}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Period toggle ───────────────────────────────────────────────────────────
function PeriodToggle({ value, onChange }) {
  return (
    <div style={{
      display: 'inline-flex', background: 'var(--bg)',
      border: '1px solid var(--border)', borderRadius: 10, padding: 2,
    }}>
      {['30D', '90D', '12M'].map(p => {
        const on = value === p;
        return (
          <button key={p} onClick={() => onChange(p)}
            style={{
              padding: '5px 14px', borderRadius: 8, border: 'none',
              background: on ? 'var(--surface)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--text2)',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
              cursor: 'pointer',
              boxShadow: on ? '0 1px 2px rgba(0,0,0,.04)' : 'none',
              transition: 'all .15s',
            }}>{p}</button>
        );
      })}
    </div>
  );
}

// ── Revenue chart (SVG with grid + Y axis) ──────────────────────────────────
function niceMax(n) {
  if (n === 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const norm = n / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}
function fmtMoney(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function RevenueChart({ series }) {
  const W = 880, H = 220;
  const padL = 56, padR = 16, padT = 16, padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxRev = Math.max(...series.map(p => p.value));
  const yMax = niceMax(maxRev);
  const slotW = chartW / series.length;
  const barW = Math.max(10, slotW * 0.5);
  const gridPcts = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} aria-label="Revenue bar chart">
      {gridPcts.map(pct => {
        const val = yMax * pct;
        const y = padT + chartH - pct * chartH;
        return (
          <g key={pct}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeWidth={1} strokeDasharray={pct === 0 ? '0' : '3 3'}/>
            <text x={padL - 8} y={y + 4} textAnchor="end" fontSize={10} fill="var(--text3)" fontFamily="var(--font-mono)">{fmtMoney(val)}</text>
          </g>
        );
      })}

      {series.map((pt, i) => {
        const barH = yMax > 0 ? (pt.value / yMax) * chartH : 0;
        const x = padL + i * slotW + (slotW - barW) / 2;
        const y = padT + chartH - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 1)} fill="var(--green)" rx={4}/>
            {pt.value > 0 && (
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize={10} fill="var(--text2)" fontFamily="var(--font-mono)">{fmtMoney(pt.value)}</text>
            )}
            <text x={x + barW / 2} y={H - padB + 16} textAnchor="middle" fontSize={10} fill="var(--text3)">{pt.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Pipeline by stage (horizontal bars) ─────────────────────────────────────
function PipelineStageChart({ stages }) {
  const maxValue = Math.max(...stages.map(s => s.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {stages.map(s => (
        <div key={s.id}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                background: s.color + '1a', color: s.color,
                borderRadius: 6, padding: '2px 9px', fontSize: 11, fontWeight: 600,
              }}>{s.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{s.count} deal{s.count !== 1 ? 's' : ''}</span>
            </span>
            <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
              {fmtMoney(s.value)}
            </span>
          </div>
          <div style={{ height: 10, background: 'var(--surface2)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${(s.value / maxValue) * 100}%`,
              background: s.color, borderRadius: 999,
              transition: 'width .35s ease',
            }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Rep leaderboard table ───────────────────────────────────────────────────
function RepLeaderboard({ reps }) {
  const maxRev = Math.max(...reps.map(r => r.revenue), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '32px 1.4fr 1.4fr .6fr .7fr',
        gap: 12, padding: '8px 4px', borderBottom: '1px solid var(--border)', alignItems: 'center',
      }}>
        <span/>
        <Eyebrow>Rep</Eyebrow>
        <Eyebrow>Revenue</Eyebrow>
        <Eyebrow>Won</Eyebrow>
        <Eyebrow>Win rate</Eyebrow>
      </div>
      {reps.map((r, i) => (
        <div key={r.id} style={{
          display: 'grid', gridTemplateColumns: '32px 1.4fr 1.4fr .6fr .7fr',
          gap: 12, padding: '12px 4px', alignItems: 'center',
          borderBottom: i === reps.length - 1 ? 'none' : '1px solid var(--border)',
          fontSize: 13,
        }}>
          <Avatar name={r.name} size={28} dark={i === 0} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)' }}>
            <span style={{ fontWeight: i === 0 ? 600 : 500 }}>{r.name}</span>
            {i === 0 && reps.length > 1 && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: 'var(--green)',
                background: 'var(--green-bg)', padding: '2px 7px', borderRadius: 999,
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>Top</span>
            )}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 8, background: 'var(--surface2)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${(r.revenue / maxRev) * 100}%`,
                background: i === 0 ? 'var(--text)' : 'var(--text2)',
                borderRadius: 999, transition: 'width .35s ease',
              }}/>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text2)', minWidth: 56, textAlign: 'right' }}>
              {fmtCurrencyShort(r.revenue)}
            </span>
          </div>
          <span style={{ color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{r.won}</span>
          <span style={{ color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(r.winRate * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

window.Analytics = Analytics;
