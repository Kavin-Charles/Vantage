export function ComingSoonBadge() {
  return (
    <span
      style={{
        background: 'var(--surface2)',
        color: 'var(--text3)',
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '.04em',
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      Coming Soon
    </span>
  );
}
