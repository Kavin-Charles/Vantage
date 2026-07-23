'use client'

import { useEffect } from 'react'
import { MSIcon } from '@/modules/shared/fluid/ui/MSIcon'
import { FluidButton } from '@/modules/shared/fluid/ui/FluidButton'
import type { UnifiedTask } from '../lib/types'
import { PRIORITY_COLOR, SOURCE_COLOR } from '../lib/types'

interface Props {
  task: UnifiedTask | null
  isAdmin: boolean
  onClose: () => void
  onToggle: (task: UnifiedTask) => void
  onDelete: (task: UnifiedTask) => void
}

export function TaskDetailPanel({ task, isAdmin, onClose, onToggle, onDelete }: Props) {
  useEffect(() => {
    if (!task) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [task, onClose])

  const open = task !== null

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 40,
            background: 'rgba(0,0,0,0.12)',
          }}
        />
      )}

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 380,
        background: 'var(--fl-surface-container-lowest)', borderLeft: '1px solid var(--fl-outline-variant)',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.2s ease-out',
        overflowY: 'auto',
      }}>
        {task && (
          <>
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '20px 20px 16px', borderBottom: '1px solid var(--fl-outline-variant)',
              flexShrink: 0,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: SOURCE_COLOR[task.source], flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 11, color: 'var(--fl-on-surface-variant)', fontWeight: 600, letterSpacing: '0.04em' }}>
                    {task.source.toUpperCase()}
                  </span>
                </div>
                <h2 style={{
                  margin: 0, fontFamily: 'var(--fl-font-display)', fontSize: 18, fontWeight: 600,
                  color: task.status === 'done' ? 'var(--fl-outline)' : 'var(--fl-on-surface)',
                  textDecoration: task.status === 'done' ? 'line-through' : 'none',
                  lineHeight: 1.3,
                }}>
                  {task.title}
                </h2>
              </div>
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fl-on-surface-variant)', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 'var(--fl-radius-pill)' }}
              >
                <MSIcon name="close" size={18} />
              </button>
            </div>

            <div style={{ padding: '16px 20px', flex: 1 }}>
              <Row label="Status">
                <button
                  onClick={() => onToggle(task)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                    border: 'none', cursor: 'pointer', fontFamily: 'var(--fl-font-body)',
                    background: task.status === 'done' ? 'var(--fl-success-container)' : 'var(--fl-secondary-container)',
                    color: task.status === 'done' ? 'var(--fl-on-success-container)' : 'var(--fl-on-secondary-container)',
                    transition: 'all 0.12s',
                  }}
                >
                  {task.status === 'done' ? '✓ Done' : '○ Todo'}
                </button>
              </Row>

              {task.priority !== 'NONE' && (
                <Row label="Priority">
                  <span style={{ fontSize: 12, fontWeight: 700, color: PRIORITY_COLOR[task.priority] }}>
                    {task.priority}
                  </span>
                </Row>
              )}

              {task.status_label && (
                <Row label="Project status">
                  <span style={{
                    fontSize: 12, padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                    background: task.status_color ? `${task.status_color}22` : 'var(--fl-surface-container)',
                    color: task.status_color ?? 'var(--fl-on-surface-variant)',
                  }}>
                    {task.status_label}
                  </span>
                </Row>
              )}

              {task.due_date && (
                <Row label="Due date">
                  <span style={{ fontSize: 13, color: 'var(--fl-on-surface)' }}>
                    {new Date(task.due_date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </Row>
              )}

              {task.assignee_name && (
                <Row label="Assignee">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: 'var(--fl-surface-container)', border: '1px solid var(--fl-outline-variant)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: 'var(--fl-on-surface-variant)',
                    }}>
                      {task.assignee_name[0]?.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--fl-on-surface)' }}>{task.assignee_name}</span>
                  </div>
                </Row>
              )}

              {task.contact_name && (
                <Row label="Contact">
                  <span style={{ fontSize: 13, color: 'var(--fl-on-surface)' }}>{task.contact_name}</span>
                </Row>
              )}

              {task.project_name && (
                <Row label="Project">
                  <a
                    href={task.source_url ?? '#'}
                    style={{ fontSize: 13, color: 'var(--fl-primary)', textDecoration: 'none' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none' }}
                  >
                    {task.project_name} →
                  </a>
                </Row>
              )}
            </div>

            <div style={{
              padding: '14px 20px', borderTop: '1px solid var(--fl-outline-variant)',
              display: 'flex', gap: 8, flexShrink: 0,
            }}>
              {task.source_url && (
                <FluidButton variant="ghost" onClick={() => { window.location.href = task.source_url! }}>
                  Open in Project
                </FluidButton>
              )}
              {isAdmin && (
                <FluidButton
                  variant="ghost"
                  onClick={() => { onDelete(task); onClose() }}
                  style={{ marginLeft: 'auto', color: 'var(--fl-error)', borderColor: 'var(--fl-error-container)' }}
                >
                  Delete
                </FluidButton>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '9px 0', borderBottom: '1px solid var(--fl-outline-variant)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)', width: 110, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  )
}
