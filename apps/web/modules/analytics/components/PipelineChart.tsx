import type { StageData } from '@/modules/analytics/lib/analytics';

interface Props {
  stages: StageData[];
  isLoading: boolean;
}

export function PipelineChart({ stages, isLoading }: Props) {
  if (isLoading) {
    return (
      <div style={{ padding: '24px 0', color: 'var(--text3)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (!stages.length) {
    return (
      <div style={{ padding: '24px 0', color: 'var(--text3)', fontSize: 13 }}>
        No deal data for this period
      </div>
    );
  }

  const maxValue = Math.max(...stages.map(s => s.value), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {stages.map(s => (
        <div key={s.stage_id}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 5,
              fontSize: 12,
            }}
          >
            <span style={{ color: 'var(--text)', fontWeight: 500 }}>
              {s.stage_name}
            </span>
            <span style={{ color: 'var(--text2)' }}>
              {s.count} deal{s.count !== 1 ? 's' : ''} ·{' '}
              {s.value >= 1_000
                ? `$${(s.value / 1_000).toFixed(1)}K`
                : `$${s.value}`}
            </span>
          </div>
          <div
            style={{
              height: 8,
              background: 'var(--surface2)',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(s.value / maxValue) * 100}%`,
                background: s.stage_color || '#2d6a4f',
                borderRadius: 4,
                transition: 'width .3s ease',
                minWidth: s.value > 0 ? 4 : 0,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
