'use client';

import { useId, useRef, useState } from 'react';

export interface ChartPoint {
  t: string;        // ISO timestamp
  value: number;    // primary (avg) series
  max?: number;     // optional max band (rollups)
}

interface Props {
  points: ChartPoint[];
  label: string;
  color: string;
  /** Unit suffix shown in tooltip/axis, e.g. "%". */
  unit?: string;
  /** Lock the Y axis to 0–100 (percentages). */
  percent?: boolean;
  /** Format a value for display. Defaults to 1-dp + unit. */
  format?: (n: number) => string;
}

const W = 560;
const H = 150;
const PAD = { l: 40, r: 12, t: 12, b: 22 };
const chartW = W - PAD.l - PAD.r;
const chartH = H - PAD.t - PAD.b;

function niceMax(n: number): number {
  if (n <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const norm = n / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

export function MetricChart({ points, label, color, unit = '', percent = false, format }: Props) {
  const gradId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const fmt = format ?? ((n: number) => `${n.toFixed(1)}${unit}`);

  if (points.length < 2) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 12 }}>
        Not enough data yet
      </div>
    );
  }

  const yMax = percent ? 100 : niceMax(Math.max(...points.map(p => p.max ?? p.value)));
  const n = points.length;

  const x = (i: number) => PAD.l + (i / (n - 1)) * chartW;
  const y = (v: number) => PAD.t + chartH - (Math.min(v, yMax) / yMax) * chartH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${x(n - 1).toFixed(1)},${(PAD.t + chartH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.t + chartH).toFixed(1)} Z`;
  const hasMax = points.some(p => p.max != null);
  const maxPath = hasMax
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.max ?? p.value).toFixed(1)}`).join(' ')
    : null;

  const gridPcts = [0, 0.5, 1];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.l) / chartW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const hp = hover != null ? points[hover] : null;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.2 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
          {fmt(points[n - 1]!.value)}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        aria-label={`${label} chart`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {gridPcts.map(pct => {
          const yy = PAD.t + chartH - pct * chartH;
          return (
            <g key={pct}>
              <line x1={PAD.l} y1={yy} x2={W - PAD.r} y2={yy} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.l - 6} y={yy + 3} textAnchor="end" fontSize={9} fill="var(--text3)">
                {percent ? `${Math.round(yMax * pct)}%` : (yMax * pct).toFixed(yMax < 10 ? 1 : 0)}
              </text>
            </g>
          );
        })}

        {maxPath && <path d={maxPath} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.35} strokeDasharray="3 3" />}
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />

        {hp && hover != null && (
          <g>
            <line x1={x(hover)} y1={PAD.t} x2={x(hover)} y2={PAD.t + chartH} stroke="var(--text3)" strokeWidth={1} strokeOpacity={0.5} />
            <circle cx={x(hover)} cy={y(hp.value)} r={3} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
          </g>
        )}
      </svg>

      {hp && hover != null && (
        <div style={{
          position: 'absolute', top: 22,
          left: `${(x(hover) / W) * 100}%`,
          transform: `translateX(${hover > n / 2 ? '-105%' : '5%'})`,
          background: 'var(--text)', color: 'var(--bg)', padding: '4px 8px',
          borderRadius: 6, fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 2,
        }}>
          <div style={{ fontWeight: 600 }}>{fmt(hp.value)}{hp.max != null ? ` · max ${fmt(hp.max)}` : ''}</div>
          <div style={{ opacity: 0.7, fontSize: 10 }}>{new Date(hp.t).toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}
