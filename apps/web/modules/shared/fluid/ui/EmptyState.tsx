import { MSIcon } from './MSIcon';

export function EmptyState({
  icon, title, message, action,
}: {
  icon: string;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 48, textAlign: 'center', color: 'var(--fl-on-surface-variant)' }}>
      <MSIcon name={icon} size={40} />
      <p style={{ margin: 0, fontFamily: 'var(--fl-font-display)', fontWeight: 600, fontSize: 18, color: 'var(--fl-on-surface)' }}>{title}</p>
      {message ? <p style={{ margin: 0, fontSize: 14 }}>{message}</p> : null}
      {action}
    </div>
  );
}
