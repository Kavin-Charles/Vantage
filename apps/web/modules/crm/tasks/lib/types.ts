// apps/web/modules/tasks/lib/types.ts

export interface UnifiedTask {
  id: string
  source: 'general' | 'contact' | 'project'
  title: string
  status: 'todo' | 'done'
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  due_date: string | null
  assignee_id: string | null
  assignee_name: string | null
  contact_id: string | null
  contact_name: string | null
  project_id: string | null
  project_name: string | null
  status_label: string | null
  status_color: string | null
  done_status_id: string | null
  todo_status_id: string | null
  source_url: string | null
  created_at: string
  updated_at: string
}

export interface UnifiedTasksBuckets {
  overdue: UnifiedTask[]
  today: UnifiedTask[]
  this_week: UnifiedTask[]
  later: UnifiedTask[]
  no_due_date: UnifiedTask[]
}

export type DueBucket = keyof UnifiedTasksBuckets

export interface UnifiedTasksFilters {
  status?: 'todo' | 'done' | 'all'
  source?: 'general' | 'contact' | 'project' | 'all'
  priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  show_all?: boolean
  q?: string
  owner_id?: string
}

export const BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: 'Overdue',
  today: 'Due Today',
  this_week: 'This Week',
  later: 'Later',
  no_due_date: 'No Due Date',
}

export const BUCKET_ORDER: DueBucket[] = ['overdue', 'today', 'this_week', 'later', 'no_due_date']

export const PRIORITY_COLOR: Record<UnifiedTask['priority'], string> = {
  URGENT: 'var(--red)',
  HIGH: 'var(--amber)',
  MEDIUM: 'var(--blue)',
  LOW: 'var(--text3)',
  NONE: 'var(--text3)',
}

export const PRIORITY_BG: Record<UnifiedTask['priority'], string> = {
  URGENT: 'var(--red-bg)',
  HIGH: 'var(--amber-bg)',
  MEDIUM: 'var(--blue-bg)',
  LOW: 'transparent',
  NONE: 'transparent',
}

export const SOURCE_COLOR: Record<UnifiedTask['source'], string> = {
  general: 'var(--text3)',
  contact: '#3b82f6',
  project: '#8b5cf6',
}
