// apps/api/src/routes/tasks-unified.ts
import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'

const querySchema = z.object({
  status: z.enum(['todo', 'done', 'all']).default('all'),
  source: z.enum(['general', 'contact', 'project', 'all']).default('all'),
  priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']).optional(),
  show_all: z.coerce.boolean().default(false),
  q: z.string().optional(),
  owner_id: z.string().uuid().optional(),
})

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

type DueBucket = keyof UnifiedTasksBuckets

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4,
}

function getBucket(dueDate: string | null): DueBucket {
  if (!dueDate) return 'no_due_date'
  const now = new Date()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const d = new Date(dueDate)
  const dueUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const diff = dueUtc - todayUtc
  const DAY = 86_400_000
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 7 * DAY) return 'this_week'
  return 'later'
}

function sortByPriority(tasks: UnifiedTask[]): UnifiedTask[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 4
    const pb = PRIORITY_ORDER[b.priority] ?? 4
    if (pa !== pb) return pa - pb
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

export function createUnifiedTasksRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): Router {
  const router = Router()

  router.get('/', requirePermission('tasks:view'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest
      const parsed = querySchema.safeParse(req.query)
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } })
        return
      }
      const { status, source, priority, show_all, q, owner_id } = parsed.data
      const showAll = show_all && user.role === 'admin'

      // ── 1. CRM tasks ────────────────────────────────────────────────────────
      let crmQ = db
        .selectFrom('tasks as t')
        .leftJoin('contacts as c', 'c.id', 't.contact_id')
        .leftJoin('users as u', 'u.id', 't.assignee_id')
        .select([
          't.id', 't.title', 't.status', 't.due_date',
          't.assignee_id', 't.contact_id', 't.created_at', 't.updated_at',
          'c.name as contact_name',
          'u.name as assignee_name',
        ])
        .where('t.workspace_id', '=', workspace.id)

      if (owner_id) {
        crmQ = crmQ.where('t.assignee_id', '=', owner_id)
      } else if (!showAll) {
        crmQ = crmQ.where('t.assignee_id', '=', user.id)
      }
      if (status !== 'all') crmQ = crmQ.where('t.status', '=', status as 'todo' | 'done')

      const crmRows = await crmQ.execute()

      // ── 2. Project tasks (assigned to user, or all if showAll) ──────────────
      let ptQ = db
        .selectFrom('project_tasks as t')
        .innerJoin('projects as p', 'p.id', 't.project_id')
        .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
        .leftJoin('project_task_assignees as a', 'a.task_id', 't.id')
        .leftJoin('users as u', 'u.id', 'a.user_id')
        .select([
          't.id', 't.title', 't.project_id', 't.due_date', 't.priority',
          't.created_at', 't.updated_at',
          'p.name as project_name',
          's.name as status_name', 's.color as status_color', 's.is_done',
          'a.user_id as assignee_id', 'u.name as assignee_name',
        ])
        .where('p.workspace_id', '=', workspace.id)
        .where('p.status', '!=', 'DELETED' as never)

      if (owner_id) {
        ptQ = ptQ.where('t.id', 'in', db
          .selectFrom('project_task_assignees')
          .select('task_id')
          .where('user_id', '=', owner_id))
      } else if (!showAll) {
        ptQ = ptQ.where('t.id', 'in', db
          .selectFrom('project_task_assignees')
          .select('task_id')
          .where('user_id', '=', user.id))
      }
      if (status === 'done') ptQ = ptQ.where('s.is_done', '=', true)
      if (status === 'todo') ptQ = ptQ.where('s.is_done', '=', false)

      const ptRowsRaw = await ptQ.execute()
      // Deduplicate by task ID (safety guard against multiple assignee rows)
      const seenPtIds = new Set<string>()
      const ptRows = ptRowsRaw.filter(r => {
        if (seenPtIds.has(r.id)) return false
        seenPtIds.add(r.id)
        return true
      })

      // ── 3. Resolve done/todo status IDs per project ─────────────────────────
      const projectIds = [...new Set(ptRows.map(r => r.project_id))]
      const allStatuses = projectIds.length > 0
        ? await db
            .selectFrom('project_task_statuses')
            .select(['project_id', 'id', 'is_done', 'position'])
            .where('project_id', 'in', projectIds)
            .orderBy('position', 'asc')
            .execute()
        : []

      const doneStatusMap: Record<string, string> = {}
      const todoStatusMap: Record<string, string> = {}
      for (const s of allStatuses) {
        if (s.is_done && !doneStatusMap[s.project_id]) doneStatusMap[s.project_id] = s.id
        if (!s.is_done && !todoStatusMap[s.project_id]) todoStatusMap[s.project_id] = s.id
      }

      // ── 4. Normalize ─────────────────────────────────────────────────────────
      const unified: UnifiedTask[] = []

      for (const t of crmRows) {
        unified.push({
          id: t.id,
          source: t.contact_id ? 'contact' : 'general',
          title: t.title,
          status: t.status as 'todo' | 'done',
          priority: 'NONE',
          due_date: t.due_date ? new Date(t.due_date).toISOString() : null,
          assignee_id: t.assignee_id ?? null,
          assignee_name: (t as Record<string, unknown>)['assignee_name'] as string | null ?? null,
          contact_id: t.contact_id ?? null,
          contact_name: (t as Record<string, unknown>)['contact_name'] as string | null ?? null,
          project_id: null,
          project_name: null,
          status_label: null,
          status_color: null,
          done_status_id: null,
          todo_status_id: null,
          source_url: null,
          created_at: (t.created_at as Date).toISOString(),
          updated_at: (t.updated_at as Date).toISOString(),
        })
      }

      for (const t of ptRows) {
        const r = t as Record<string, unknown>
        unified.push({
          id: t.id,
          source: 'project',
          title: t.title,
          status: t.is_done ? 'done' : 'todo',
          priority: (t.priority as UnifiedTask['priority']) ?? 'NONE',
          due_date: t.due_date ? new Date(t.due_date).toISOString() : null,
          assignee_id: t.assignee_id ?? null,
          assignee_name: r['assignee_name'] as string | null ?? null,
          contact_id: null,
          contact_name: null,
          project_id: t.project_id,
          project_name: r['project_name'] as string | null ?? null,
          status_label: r['status_name'] as string | null ?? null,
          status_color: r['status_color'] as string | null ?? null,
          done_status_id: doneStatusMap[t.project_id] ?? null,
          todo_status_id: todoStatusMap[t.project_id] ?? null,
          source_url: `/projects/${t.project_id}/tasks`,
          created_at: (t.created_at as Date).toISOString(),
          updated_at: (t.updated_at as Date).toISOString(),
        })
      }

      // ── 5. Client-side filters ───────────────────────────────────────────────
      let filtered = unified
      if (source !== 'all') filtered = filtered.filter(t => t.source === source)
      if (priority) filtered = filtered.filter(t => t.priority === priority)
      if (q) {
        const lower = q.toLowerCase()
        filtered = filtered.filter(t => t.title.toLowerCase().includes(lower))
      }

      // ── 6. Bucket + sort ─────────────────────────────────────────────────────
      const buckets: UnifiedTasksBuckets = {
        overdue: [], today: [], this_week: [], later: [], no_due_date: [],
      }
      for (const t of filtered) buckets[getBucket(t.due_date)].push(t)
      for (const key of Object.keys(buckets) as DueBucket[]) {
        buckets[key] = sortByPriority(buckets[key])
      }

      res.json({ data: buckets, total: filtered.length, error: null })
    } catch (err) {
      next(err)
    }
  })

  return router
}
