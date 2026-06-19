'use client'

import { Icon } from '@/modules/shared/components/ui/Icon'
import type { UnifiedTasksFilters } from '../lib/types'

interface Props {
  filters: UnifiedTasksFilters
  isAdmin: boolean
  onFiltersChange: (f: UnifiedTasksFilters) => void
}

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'general', label: 'General' },
  { value: 'contact', label: 'Contact' },
  { value: 'project', label: 'Project' },
] as const

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'Todo' },
  { value: 'done', label: 'Done' },
] as const

const PRIORITY_OPTIONS = [
  { value: undefined, label: 'Any Priority' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
] as const

const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px', borderRadius: 999, border: '1px solid var(--border)',
  background: active ? 'var(--text)' : 'var(--surface)',
  color: active ? '#fff' : 'var(--text2)',
  fontSize: 12, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'inherit', transition: 'all 0.12s', whiteSpace: 'nowrap',
})

const selectStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text2)', fontSize: 12,
  fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
}

export function TaskFilterBar({ filters, isAdmin, onFiltersChange }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '12px 0', marginBottom: 8,
    }}>
      <div style={{ position: 'relative', marginRight: 4 }}>
        <div style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text3)', display: 'flex' }}>
          <Icon name="search" size={13} />
        </div>
        <input
          type="text"
          value={filters.q ?? ''}
          onChange={e => onFiltersChange({ ...filters, q: e.target.value || undefined })}
          placeholder="Search tasks…"
          style={{
            paddingLeft: 28, paddingRight: 10, paddingTop: 5, paddingBottom: 5,
            borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 12,
            fontFamily: 'inherit', outline: 'none', width: 180,
          }}
        />
      </div>

      {STATUS_OPTIONS.map(opt => (
        <button
          key={opt.value}
          style={pillStyle((filters.status ?? 'all') === opt.value)}
          onClick={() => onFiltersChange({ ...filters, status: opt.value as UnifiedTasksFilters['status'] })}
        >
          {opt.label}
        </button>
      ))}

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />

      {SOURCE_OPTIONS.map(opt => (
        <button
          key={opt.value}
          style={pillStyle((filters.source ?? 'all') === opt.value)}
          onClick={() => onFiltersChange({ ...filters, source: opt.value as UnifiedTasksFilters['source'] })}
        >
          {opt.label}
        </button>
      ))}

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />

      <select
        style={selectStyle}
        value={filters.priority ?? ''}
        onChange={e => onFiltersChange({ ...filters, priority: (e.target.value || undefined) as UnifiedTasksFilters['priority'] })}
      >
        {PRIORITY_OPTIONS.map(opt => (
          <option key={opt.value ?? 'any'} value={opt.value ?? ''}>{opt.label}</option>
        ))}
      </select>

      {isAdmin && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={filters.show_all ?? false}
            onChange={e => onFiltersChange({ ...filters, show_all: e.target.checked || undefined })}
          />
          All workspace
        </label>
      )}
    </div>
  )
}
