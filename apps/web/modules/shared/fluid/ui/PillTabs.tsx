'use client';
export function PillTabs({
  tabs, active, onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{
      display: 'inline-flex', gap: 4, padding: 4,
      borderRadius: 'var(--fl-radius-pill)', background: 'var(--fl-surface-container)',
    }}>
      {tabs.map(t => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              padding: '8px 18px', borderRadius: 'var(--fl-radius-pill)', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--fl-font-body)', fontSize: 13, fontWeight: 600,
              color: on ? 'var(--fl-on-primary)' : 'var(--fl-on-surface-variant)',
              background: on ? 'var(--fl-primary)' : 'transparent', transition: 'background .2s, color .2s',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
