'use client';

type View = 'kanban' | 'table' | 'list';

interface Props {
  current: View;
  onChange: (v: View) => void;
}

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: 'kanban', label: 'Board', icon: '⊞' },
  { id: 'table', label: 'Table', icon: '☰' },
];

export function ViewSwitcher({ current, onChange }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 3,
        gap: 2,
      }}
    >
      {VIEWS.map(v => {
        const active = current === v.id;
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              border: 'none',
              borderRadius: 8,
              background: active ? 'var(--surface)' : 'transparent',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              color: active ? 'var(--text)' : 'var(--text3)',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'var(--font-sans)',
              fontWeight: active ? 600 : 400,
              transition: 'var(--transition)',
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>{v.icon}</span>
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
