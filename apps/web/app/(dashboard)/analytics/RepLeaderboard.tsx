import type { RepData } from '@/lib/analytics';

interface Props {
  reps?: RepData[];
  isLoading: boolean;
}

const COLS = '28px 1fr .7fr .8fr .7fr';

const eyebrow: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1.4,
};

function fmtRevenue(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

export function RepLeaderboard({ reps, isLoading }: Props) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '10px 16px', borderBottom: '1px solid var(--border)', gap: 12, alignItems: 'center' }}>
        <span style={eyebrow}>#</span>
        <span style={eyebrow}>Rep</span>
        <span style={{ ...eyebrow, textAlign: 'right' }}>Won</span>
        <span style={{ ...eyebrow, textAlign: 'right' }}>Revenue</span>
        <span style={{ ...eyebrow, textAlign: 'right' }}>Win Rate</span>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
      ) : !reps?.length ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No closed deals in this period</div>
      ) : reps.map((rep, i) => (
        <div key={rep.user_id} style={{
          display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center',
          padding: '11px 16px',
          borderBottom: i === reps.length - 1 ? 'none' : '1px solid var(--border)',
          fontSize: 13,
        }}>
          <span style={{ color: 'var(--text3)', fontSize: 11, fontWeight: 600 }}>{i + 1}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 600, color: 'var(--text2)', flexShrink: 0,
            }}>
              {rep.name[0].toUpperCase()}
            </span>
            <span style={{ fontWeight: i === 0 ? 600 : 400, color: 'var(--text)' }}>
              {rep.name}
              {i === 0 && (reps?.length ?? 0) > 1 && (
                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>TOP</span>
              )}
            </span>
          </span>
          <span style={{ textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{rep.deals_won}</span>
          <span style={{ textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmtRevenue(rep.revenue)}</span>
          <span style={{ textAlign: 'right', color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(rep.win_rate * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
