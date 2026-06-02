import type { RevenueData } from '@/modules/analytics/lib/analytics';

interface Props {
  data?: RevenueData;
  isLoading: boolean;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function KpiCards({ data, isLoading }: Props) {
  const cards = [
    {
      label: 'Total Revenue',
      value: data ? fmt(data.total_revenue) : '—',
    },
    {
      label: 'Deals Won',
      value: data ? String(data.deals_won) : '—',
    },
    {
      label: 'Win Rate',
      value: data ? `${Math.round(data.win_rate * 100)}%` : '—',
    },
    {
      label: 'Avg Deal Size',
      value: data ? fmt(data.avg_deal_size) : '—',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
      {cards.map(card => (
        <div
          key={card.label}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: 'var(--text3)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1.4,
              marginBottom: 8,
            }}
          >
            {card.label}
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              fontFamily: 'var(--font-display)',
              color: 'var(--text)',
              letterSpacing: '-0.6px',
              lineHeight: 1.05,
            }}
          >
            {isLoading ? '—' : card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
