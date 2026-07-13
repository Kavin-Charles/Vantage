'use client'

import { useState } from 'react'
import { Icon } from '@/modules/shared/components/ui/Icon'
import type { UnifiedTask } from '../lib/types'
import { TaskRow } from './TaskRow'
import type { ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu'

interface Props {
  label: string
  tasks: UnifiedTask[]
  isOverdue?: boolean
  isAdmin: boolean
  selectedIds: Set<string>
  onToggle: (task: UnifiedTask) => void
  onDelete: (task: UnifiedTask) => void
  onEditTitle: (task: UnifiedTask, title: string) => void
  onSelect: (task: UnifiedTask) => void
  onOpenDetail: (task: UnifiedTask) => void
  onContextMenu: (e: React.MouseEvent, items: ContextMenuItem[]) => void
}

export function TaskGroup({
  label, tasks, isOverdue = false, isAdmin,
  selectedIds, onToggle, onDelete, onEditTitle, onSelect, onOpenDetail, onContextMenu,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)

  if (tasks.length === 0) return null

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '8px 16px', textAlign: 'left',
          color: isOverdue ? 'var(--red)' : 'var(--text2)',
          fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', fontFamily: 'inherit',
        }}
      >
        <span style={{
          display: 'inline-block',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }}>
          <Icon name="chevron-down" size={13} />
        </span>
        {label.toUpperCase()}
        <span style={{
          fontSize: 11, fontWeight: 700,
          background: isOverdue ? 'var(--red-bg)' : 'var(--surface2)',
          color: isOverdue ? 'var(--red)' : 'var(--text3)',
          padding: '1px 7px', borderRadius: 999,
        }}>
          {tasks.length}
        </span>
      </button>

      <div style={{
        overflow: 'hidden',
        maxHeight: collapsed ? 0 : `${tasks.length * 60}px`,
        transition: 'max-height 0.2s ease',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
      }}>
        {tasks.map((task, i) => (
          <TaskRow
            key={task.id}
            task={task}
            index={i}
            isAdmin={isAdmin}
            selected={selectedIds.has(task.id)}
            onToggle={() => onToggle(task)}
            onDelete={() => onDelete(task)}
            onEditTitle={title => onEditTitle(task, title)}
            onSelect={() => onSelect(task)}
            onOpenDetail={() => onOpenDetail(task)}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    </div>
  )
}
