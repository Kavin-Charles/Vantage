import { MSIcon } from './MSIcon';

export function MetricPill({
  icon, label, value, trend,
}: {
  icon: string;
  label: string;
  value: string;
  trend?: string;
}) {
  return (
    <div className="glass-panel" style={{
      display: 'inline-flex', alignItems: 'center', gap: 14,
      padding: '12px 22px', borderRadius: 'var(--fl-radius-pill)',
    }}>
      <span style={{
        width: 40, height: 40, borderRadius: 'var(--fl-radius-pill)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', background: 'var(--fl-surface-container)',
        color: 'var(--fl-outline)',
      }}>
        <MSIcon name={icon} size={22} />
      </span>
      <div>
        <p style={{ margin: 0, fontFamily: 'var(--fl-font-display)', fontWeight: 700, fontSize: 18, color: 'var(--fl-on-surface)' }}>{value}</p>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fl-on-surface-variant)' }}>{trend ?? label}</span>
      </div>
    </div>
  );
}
