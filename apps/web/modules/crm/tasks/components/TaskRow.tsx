'use client'

import { useState, useRef, useEffect } from 'react'
import { MSIcon } from '@/modules/shared/fluid/ui/MSIcon'
import type { ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu'
import type { UnifiedTask } from '../lib/types'
import { PRIORITY_COLOR, PRIORITY_BG, SOURCE_COLOR } from '../lib/types'

interface Props {
  task: UnifiedTask
  index: number
  isAdmin: boolean
  selected: boolean
  onToggle: () => void
  onDelete: () => void
  onEditTitle: (title: string) => void
  onSelect: () => void
  onOpenDetail: () => void
  onContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onChange() }}
      style={{
        width: 18, height: 18, borderRadius: 6, flexShrink: 0,
        border: '1.5px solid ' + (checked ? 'var(--fl-primary)' : 'var(--fl-outline-variant)'),
        background: checked ? 'var(--fl-primary)' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0,
        transition: 'all 0.15s, transform 0.15s',
        transform: 'scale(1)',
      }}
      onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.85)' }}
      onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
    >
      {checked && <MSIcon name="check" size={13} style={{ color: 'var(--fl-on-primary)' }} weight={700} />}
    </button>
  )
}

function SelectBox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onChange() }}
      style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        border: '1.5px solid ' + (checked ? 'var(--fl-primary)' : 'var(--fl-outline-variant)'),
        background: checked ? 'var(--fl-primary)' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, transition: 'all 0.12s',
      }}
    >
      {checked && <MSIcon name="check" size={12} style={{ color: 'var(--fl-on-primary)' }} weight={700} />}
    </button>
  )
}

export function TaskRow({
  task, index, isAdmin, selected,
  onToggle, onDelete, onEditTitle, onSelect, onOpenDetail, onContextMenu,
}: Props) {
  const [hover, setHover] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(task.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const done = task.status === 'done'

  useEffect(() => { setEditVal(task.title) }, [task.title])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditing(true)
  }

  function commitEdit() {
    setEditing(false)
    const trimmed = editVal.trim()
    if (trimmed && trimmed !== task.title) onEditTitle(trimmed)
    else setEditVal(task.title)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') { setEditing(false); setEditVal(task.title) }
  }

  const menuItems: ContextMenuItem[] = [
    done
      ? { icon: 'refresh', label: 'Mark todo', onClick: onToggle }
      : { icon: 'check', label: 'Mark done', shortcut: '⌘↵', onClick: onToggle },
    { icon: 'edit', label: 'Edit title', onClick: () => setEditing(true) },
    { type: 'separator' },
    { icon: 'external-link', label: 'Open detail', onClick: onOpenDetail },
    { icon: 'copy', label: 'Copy title', onClick: () => navigator.clipboard.writeText(task.title) },
    ...(task.source_url
      ? [{ icon: 'arrow-right', label: 'Open in Project', onClick: () => { window.location.href = task.source_url! } }]
      : []),
    ...(isAdmin
      ? [{ type: 'separator' as const }, { icon: 'trash', label: 'Delete task', danger: true, onClick: onDelete }]
      : []),
  ]

  const isOverdue = task.status === 'todo' && task.due_date && new Date(task.due_date) < new Date()

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e, menuItems) }}
      onClick={onOpenDetail}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 16px',
        borderBottom: '1px solid var(--fl-outline-variant)',
        background: selected ? 'rgba(0,72,206,0.08)' : hover ? 'var(--fl-surface-container)' : 'transparent',
        transition: 'background 0.12s',
        cursor: 'pointer',
        opacity: 0,
        transform: 'translateY(6px)',
        animation: `taskFadeIn 0.2s ease forwards`,
        animationDelay: `${Math.min(index * 30, 300)}ms`,
        fontSize: 13,
      }}
    >
      <style>{`
        @keyframes taskFadeIn {
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <SelectBox checked={selected} onChange={onSelect} />
      <Checkbox checked={done} onChange={onToggle} />

      <span style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: SOURCE_COLOR[task.source],
      }} title={task.source} />

      {editing ? (
        <input
          ref={inputRef}
          value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          onClick={e => e.stopPropagation()}
          style={{
            flex: 1, border: '1px solid var(--fl-outline-variant)', borderRadius: 6,
            padding: '2px 6px', fontSize: 13, fontFamily: 'inherit',
            background: 'var(--fl-surface-container-lowest)', color: 'var(--fl-on-surface)', outline: 'none',
          }}
        />
      ) : (
        <span
          onDoubleClick={startEdit}
          style={{
            flex: 1,
            color: done ? 'var(--fl-outline)' : 'var(--fl-on-surface)',
            textDecoration: done ? 'line-through' : 'none',
            transition: 'color 0.3s, text-decoration 0.3s',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {task.title}
        </span>
      )}

      {task.priority !== 'NONE' && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, flexShrink: 0,
          color: PRIORITY_COLOR[task.priority],
          background: PRIORITY_BG[task.priority],
          letterSpacing: '0.04em',
        }}>
          {task.priority}
        </span>
      )}

      {(task.contact_name || task.project_name) && (
        <span
          onClick={e => {
            e.stopPropagation()
            if (task.source_url) window.location.href = task.source_url
          }}
          style={{
            fontSize: 11, color: 'var(--fl-on-surface-variant)', flexShrink: 0, maxWidth: 100,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            cursor: task.source_url ? 'pointer' : 'default',
            textDecoration: task.source_url && hover ? 'underline' : 'none',
          }}
        >
          {task.contact_name ?? task.project_name}
        </span>
      )}

      {task.status_label && (
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 999, flexShrink: 0,
          background: task.status_color ? `${task.status_color}22` : 'var(--fl-surface-container)',
          color: task.status_color ?? 'var(--fl-on-surface-variant)',
          fontWeight: 600,
        }}>
          {task.status_label}
        </span>
      )}

      {task.due_date && (
        <span style={{
          fontSize: 11, flexShrink: 0,
          color: isOverdue ? 'var(--fl-error)' : 'var(--fl-on-surface-variant)',
          background: isOverdue ? 'var(--fl-error-container)' : 'transparent',
          padding: isOverdue ? '2px 7px' : undefined,
          borderRadius: isOverdue ? 999 : undefined,
          fontWeight: isOverdue ? 600 : 400,
        }}>
          {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      )}

      {task.assignee_name && (
        <span style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'var(--fl-surface-container)', border: '1px solid var(--fl-outline-variant)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 700, color: 'var(--fl-on-surface-variant)', flexShrink: 0,
        }} title={task.assignee_name}>
          {task.assignee_name[0]?.toUpperCase()}
        </span>
      )}

      {isAdmin && hover && !editing && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
            color: 'var(--fl-on-surface-variant)', borderRadius: 4, display: 'flex', alignItems: 'center',
            transition: 'color 0.12s', flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--fl-error)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--fl-on-surface-variant)' }}
        >
          <MSIcon name="delete" size={15} />
        </button>
      )}
    </div>
  )
}
