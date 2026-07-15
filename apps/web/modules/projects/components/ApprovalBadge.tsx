'use client';

interface Props {
  pending: number;
  total: number;
}

export function ApprovalBadge({ pending, total }: Props) {
  if (total === 0) return null;
  return (
    <span
      style={{
        fontFamily: 'DM Sans',
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 20,
        background: pending > 0 ? 'var(--amber-bg, #fef3c7)' : 'var(--green-bg, #d8f3dc)',
        color: pending > 0 ? 'var(--amber, #92400e)' : 'var(--green, #2d6a4f)',
        flexShrink: 0,
      }}
    >
      {pending > 0 ? `${pending} pending` : `${total} done`}
    </span>
  );
}
