import type { SeriesPoint, Period } from '@/lib/analytics';

interface Props {
  series: SeriesPoint[];
  isLoading: boolean;
  period: Period;
}

function niceMax(n: number): number {
  if (n === 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const norm = n / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function fmtLabel(isoStr: string, period: Period): string {
  const d = new Date(isoStr);
  if (period === '12m') {
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function RevenueChart({ series, isLoading, period }: Props) {
  if (isLoading) {
    return (
      <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (!series.length) {
    return (
      <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
        No won deals in this period
      </div>
    );
  }

  const W = 600;
  const H = 180;
  const padL = 52;
  const padR = 12;
  const padT = 12;
  const padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const maxRev = Math.max(...series.map(p => p.revenue));
  const yMax = niceMax(maxRev);
  const barW = Math.max(8, (chartW / series.length) * 0.55);
  const slotW = chartW / series.length;

  const gridPcts = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      aria-label="Revenue bar chart"
    >
      {/* Grid lines + Y labels */}
      {gridPcts.map(pct => {
        const val = yMax * pct;
        const y = padT + chartH - pct * chartH;
        return (
          <g key={pct}>
            <line
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={padL - 6}
              y={y + 4}
              textAnchor="end"
              fontSize={9}
              fill="var(--text3)"
            >
              {fmtMoney(val)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {series.map((pt, i) => {
        const barH = yMax > 0 ? (pt.revenue / yMax) * chartH : 0;
        const x = padL + i * slotW + (slotW - barW) / 2;
        const y = padT + chartH - barH;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(barH, 1)}
              fill="var(--green)"
              rx={2}
            />
            <text
              x={x + barW / 2}
              y={H - padB + 14}
              textAnchor="middle"
              fontSize={9}
              fill="var(--text3)"
            >
              {fmtLabel(pt.label, period)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
