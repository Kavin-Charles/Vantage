export function GlassCard({
  children, style, className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`glass-card${className ? ` ${className}` : ''}`}
      style={{ padding: 24, boxShadow: 'var(--fl-shadow-float)', ...style }}
    >
      {children}
    </div>
  );
}
