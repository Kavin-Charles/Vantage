'use client'

import { FluidInput, FluidChip, FluidSelect } from '@/modules/shared/fluid/ui'
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

export function TaskFilterBar({ filters, isAdmin, onFiltersChange }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '4px 0 16px',
    }}>
      <div style={{ width: 200 }}>
        <FluidInput
          value={filters.q ?? ''}
          onChange={v => onFiltersChange({ ...filters, q: v || undefined })}
          placeholder="Search tasks…"
          icon="search"
        />
      </div>

      {STATUS_OPTIONS.map(opt => (
        <FluidChip
          key={opt.value}
          active={(filters.status ?? 'all') === opt.value}
          onClick={() => onFiltersChange({ ...filters, status: opt.value as UnifiedTasksFilters['status'] })}
        >
          {opt.label}
        </FluidChip>
      ))}

      <div style={{ width: 1, height: 20, background: 'var(--fl-outline-variant)', margin: '0 2px' }} />

      {SOURCE_OPTIONS.map(opt => (
        <FluidChip
          key={opt.value}
          active={(filters.source ?? 'all') === opt.value}
          onClick={() => onFiltersChange({ ...filters, source: opt.value as UnifiedTasksFilters['source'] })}
        >
          {opt.label}
        </FluidChip>
      ))}

      <div style={{ width: 1, height: 20, background: 'var(--fl-outline-variant)', margin: '0 2px' }} />

      <FluidSelect
        value={filters.priority ?? ''}
        onChange={v => onFiltersChange({ ...filters, priority: (v || undefined) as UnifiedTasksFilters['priority'] })}
        options={PRIORITY_OPTIONS.map(opt => ({ label: opt.label, value: opt.value ?? '' }))}
      />

      {isAdmin && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fl-on-surface-variant)', cursor: 'pointer' }}>
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
