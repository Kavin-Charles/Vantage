'use client'

import { Icon } from '@/modules/shared/components/ui/Icon'

interface Props {
  count: number
  onMarkDone: () => void
  onMarkTodo: () => void
  onDelete: () => void
  onClear: () => void
}

export function BulkActionBar({ count, onMarkDone, onMarkTodo, onDelete, onClear }: Props) {
  if (count === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--text)', color: '#fff',
      borderRadius: 12, padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 8,
      boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      zIndex: 100,
      animation: 'bulkBarIn 0.15s ease-out forwards',
    }}>
      <style>{`
        @keyframes bulkBarIn {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <span style={{ fontSize: 13, fontWeight: 600, marginRight: 4 }}>{count} selected</span>

      {[
        { label: 'Mark done', icon: 'check', onClick: onMarkDone, danger: false },
        { label: 'Mark todo', icon: 'refresh', onClick: onMarkTodo, danger: false },
        { label: 'Delete', icon: 'trash', onClick: onDelete, danger: true },
      ].map(action => (
        <button
          key={action.label}
          onClick={action.onClick}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(255,255,255,0.12)', border: 'none',
            borderRadius: 7, padding: '5px 10px', cursor: 'pointer',
            fontSize: 12, fontWeight: 500,
            color: action.danger ? '#fca5a5' : '#fff',
            fontFamily: 'inherit', transition: 'background 0.1s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.2)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)' }}
        >
          <Icon name={action.icon} size={12} />
          {action.label}
        </button>
      ))}

      <button
        onClick={onClear}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.6)', padding: '4px', marginLeft: 4,
          display: 'flex', alignItems: 'center', borderRadius: 4,
          transition: 'color 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)' }}
        title="Clear selection"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}
