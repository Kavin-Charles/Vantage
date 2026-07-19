'use client';

interface Props {
  label: string;
  value: string;
  sub?: string;
  isLoading?: boolean;
}

export function OverviewTile({ label, value, sub, isLoading }: Props) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, lineHeight: 1.1, color: 'var(--text)' }}>
        {isLoading ? '—' : value}
      </div>
      {sub && !isLoading && (
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}
