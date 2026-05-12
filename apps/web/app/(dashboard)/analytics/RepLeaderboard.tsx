import type { RepData } from '@/lib/analytics';

interface Props {
  reps?: RepData[];
  isLoading: boolean;
}

const th: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text3)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  borderBottom: '1px solid var(--border)',
};

const td: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 13,
  color: 'var(--text)',
  borderBottom: '1px solid var(--border)',
};

function fmtRevenue(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

export function RepLeaderboard({ reps, isLoading }: Props) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={th}>Rep</th>
          <th style={{ ...th, textAlign: 'right' }}>Deals Won</th>
          <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
          <th style={{ ...th, textAlign: 'right' }}>Win Rate</th>
        </tr>
      </thead>
      <tbody>
        {isLoading ? (
          <tr>
            <td
              colSpan={4}
              style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}
            >
              Loading…
            </td>
          </tr>
        ) : !reps?.length ? (
          <tr>
            <td
              colSpan={4}
              style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}
            >
              No closed deals in this period
            </td>
          </tr>
        ) : (
          reps.map((rep, i) => (
            <tr key={rep.user_id}>
              <td style={td}>
                <span style={{ fontWeight: i === 0 ? 600 : 400 }}>{rep.name}</span>
                {i === 0 && reps.length > 1 && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--green)' }}>
                    ★ Top
                  </span>
                )}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>{rep.deals_won}</td>
              <td style={{ ...td, textAlign: 'right' }}>{fmtRevenue(rep.revenue)}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                {Math.round(rep.win_rate * 100)}%
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
