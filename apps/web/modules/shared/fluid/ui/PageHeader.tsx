export function PageHeader({
  title, subtitle, actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 24 }}>
      <div>
        <h2 style={{ margin: 0, fontFamily: 'var(--fl-font-display)', fontWeight: 600, fontSize: 40, letterSpacing: '-0.02em', color: 'var(--fl-on-surface)' }}>{title}</h2>
        {subtitle ? <p style={{ margin: '8px 0 0', fontFamily: 'var(--fl-font-body)', fontSize: 16, color: 'var(--fl-on-surface-variant)' }}>{subtitle}</p> : null}
      </div>
      {actions ? <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>{actions}</div> : null}
    </div>
  );
}
