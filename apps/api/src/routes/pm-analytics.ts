import { Router } from 'express'
import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'

export function createPmAnalyticsRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  // GET /api/projects/:projectId/analytics/health
  router.get('/health', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const stats = await db.selectFrom('project_tasks as t')
        .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
        .where('t.project_id', '=', projectId)
        .select([
          db.fn.count('t.id').as('total_tasks'),
          db.fn.count(sql<string>`CASE WHEN s.is_done THEN t.id END`).as('done_tasks'),
          db.fn.count(sql<string>`CASE WHEN t.due_date < NOW() AND NOT s.is_done THEN t.id END`).as('overdue_tasks'),
          db.fn.count(sql<string>`CASE WHEN NOT s.is_done THEN t.id END`).as('open_tasks'),
        ])
        .executeTakeFirst()

      const memberCount = await db.selectFrom('project_members')
        .where('project_id', '=', projectId)
        .select(db.fn.count('id').as('count'))
        .executeTakeFirst()

      const total = Number(stats?.total_tasks ?? 0)
      const done = Number(stats?.done_tasks ?? 0)
      const completion_rate = total > 0 ? Math.round((done / total) * 100) : 0

      return res.json({
        data: {
          total_tasks: total,
          done_tasks: done,
          overdue_tasks: Number(stats?.overdue_tasks ?? 0),
          open_tasks: Number(stats?.open_tasks ?? 0),
          member_count: Number(memberCount?.count ?? 0),
          completion_rate,
        },
        error: null,
      })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // GET /api/projects/:projectId/analytics/by-status
  router.get('/by-status', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const rows = await db.selectFrom('project_task_statuses as s')
        .leftJoin('project_tasks as t', 't.status_id', 's.id')
        .where('s.project_id', '=', projectId)
        .groupBy(['s.id', 's.name', 's.color'])
        .select([
          's.id',
          's.name',
          's.color',
          db.fn.count('t.id').as('count'),
        ])
        .orderBy('s.position', 'asc')
        .execute()

      return res.json({ data: rows.map(r => ({ ...r, count: Number(r.count) })), error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // GET /api/projects/:projectId/analytics/velocity
  router.get('/velocity', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const sprints = await db.selectFrom('sprints')
        .where('project_id', '=', projectId)
        .where('status', 'in', ['COMPLETED', 'ACTIVE'])
        .select(['id', 'name', 'velocity', 'start_date', 'end_date', 'status'])
        .orderBy('end_date', 'desc')
        .limit(8)
        .execute()

      return res.json({ data: sprints, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // GET /api/projects/:projectId/analytics/burndown?sprint_id=
  router.get('/burndown', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const { sprint_id } = req.query as { sprint_id?: string }
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      if (sprint_id) {
        const sprint = await db.selectFrom('sprints').select(['start_date', 'end_date'])
          .where('id', '=', sprint_id).where('project_id', '=', projectId)
          .executeTakeFirst()
        if (!sprint) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Sprint not found' } })

        const rows = await db.selectFrom('project_tasks as t')
          .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
          .innerJoin('sprint_tasks as st', 'st.task_id', 't.id')
          .where('st.sprint_id', '=', sprint_id)
          .where('s.is_done', '=', true)
          .where(sql`t.updated_at`, '>=', sprint.start_date as unknown as string)
          .where(sql`t.updated_at`, '<=', sprint.end_date as unknown as string)
          .select([
            sql<string>`DATE(t.updated_at)`.as('date'),
            db.fn.count('t.id').as('completed'),
          ])
          .groupBy(sql`DATE(t.updated_at)`)
          .orderBy(sql`DATE(t.updated_at)`, 'asc')
          .execute()

        return res.json({ data: rows.map(r => ({ ...r, completed: Number(r.completed) })), error: null })
      }

      // Rolling 30-day completion
      const rows = await db.selectFrom('project_tasks as t')
        .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
        .where('t.project_id', '=', projectId)
        .where('s.is_done', '=', true)
        .where(sql`t.updated_at`, '>=', sql`NOW() - INTERVAL '30 days'`)
        .select([
          sql<string>`DATE(t.updated_at)`.as('date'),
          db.fn.count('t.id').as('completed'),
        ])
        .groupBy(sql`DATE(t.updated_at)`)
        .orderBy(sql`DATE(t.updated_at)`, 'asc')
        .execute()

      return res.json({ data: rows.map(r => ({ ...r, completed: Number(r.completed) })), error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // GET /api/projects/:projectId/analytics/workload
  router.get('/workload', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const rows = await db.selectFrom('project_task_assignees as a')
        .innerJoin('project_tasks as t', 't.id', 'a.task_id')
        .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
        .innerJoin('users as u', 'u.id', 'a.user_id')
        .where('t.project_id', '=', projectId)
        .groupBy(['a.user_id', 'u.name', 'u.email'])
        .select([
          'a.user_id',
          'u.name',
          'u.email',
          db.fn.count('t.id').as('total'),
          db.fn.count(sql<string>`CASE WHEN s.is_done THEN t.id END`).as('done'),
          db.fn.count(sql<string>`CASE WHEN t.due_date < NOW() AND NOT s.is_done THEN t.id END`).as('overdue'),
        ])
        .execute()

      return res.json({
        data: rows.map(r => ({
          user_id: r.user_id,
          name: r.name,
          email: r.email,
          total: Number(r.total),
          done: Number(r.done),
          overdue: Number(r.overdue),
        })),
        error: null,
      })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  return router
}
