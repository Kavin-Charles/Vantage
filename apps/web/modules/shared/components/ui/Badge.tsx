const colorMap = {
  green: { background: 'var(--green-bg)', color: 'var(--green)' },
  amber: { background: 'var(--amber-bg)', color: 'var(--amber)' },
  red: { background: 'var(--red-bg)', color: 'var(--red)' },
  blue: { background: 'var(--blue-bg)', color: 'var(--blue)' },
  purple: { background: 'var(--purple-bg)', color: 'var(--purple)' },
  gray: { background: 'var(--surface2)', color: 'var(--text2)' },
};

type BadgeColor = keyof typeof colorMap;

export function Badge({ label, color = 'gray' }: { label: string; color?: BadgeColor }) {
  return (
    <span style={{
      ...colorMap[color],
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 20,
      display: 'inline-block',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

export const statusColor: Record<string, BadgeColor> = {
  prospect: 'blue',
  customer: 'green',
  cold: 'gray',
  churned: 'red',
  lead: 'gray',
  qualifying: 'blue',
  proposal: 'amber',
  closing: 'purple',
  won: 'green',
  lost: 'red',
  todo: 'amber',
  done: 'green',
  online: 'green',
  degraded: 'amber',
  offline: 'red',
  stopped: 'gray',
  healthy: 'green',
};
