import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'
import { logActivity } from '../lib/log-activity'
import { pmEvents } from '../lib/pm-events'

const createSprintSchema = z.object({
  name: z.string().min(1).max(255),
  start_date: z.string(),
  end_date: z.string(),
  goal: z.string().max(1000).optional(),
})

const updateSprintSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED']).optional(),
  goal: z.string().nullable().optional(),
})

const addSprintTaskSchema = z.object({
  task_id: z.string().uuid(),
  points: z.number().int().min(0).optional(),
})

export function createSprintsRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  // GET /api/projects/:projectId/sprints
  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const sprints = await db.selectFrom('sprints').selectAll()
        .where('project_id', '=', projectId)
        .orderBy('start_date', 'desc')
        .execute()
      return res.json({ data: sprints, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // POST /api/projects/:projectId/sprints
  router.post('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const parsed = createSprintSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const sprint = await db.insertInto('sprints')
        .values({
          project_id: projectId,
          name: parsed.data.name,
          start_date: parsed.data.start_date as unknown as Date,
          end_date: parsed.data.end_date as unknown as Date,
          goal: parsed.data.goal ?? null,
        })
        .returningAll().executeTakeFirstOrThrow()
      return res.status(201).json({ data: sprint, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // PATCH /api/projects/:projectId/sprints/:sprintId
  router.patch('/:sprintId', async (req, res) => {
    const { user, workspace } = req as unknown as AuthenticatedRequest
    const { sprintId, projectId } = req.params as { sprintId: string; projectId: string }
    const parsed = updateSprintSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const updates: Record<string, unknown> = {}
      if (parsed.data.name !== undefined) updates.name = parsed.data.name
      if (parsed.data.start_date !== undefined) updates.start_date = parsed.data.start_date
      if (parsed.data.end_date !== undefined) updates.end_date = parsed.data.end_date
      if (parsed.data.status !== undefined) updates.status = parsed.data.status
      if (parsed.data.goal !== undefined) updates.goal = parsed.data.goal

      const prior = await db
        .selectFrom('sprints')
        .where('id', '=', sprintId)
        .where('project_id', '=', projectId)
        .select(['status'])
        .executeTakeFirst()

      const sprint = await db.updateTable('sprints').set(updates)
        .where('id', '=', sprintId).where('project_id', '=', projectId)
        .returningAll().executeTakeFirstOrThrow()

      if (prior?.status !== 'ACTIVE' && sprint.status === 'ACTIVE') {
        pmEvents.emit('pm', { type: 'sprint_started', projectId: sprint.project_id, sprintId: sprint.id })
        void logActivity(db, {
          workspace_id: workspace.id,
          user_id: user.id,
          type: 'sprint_started',
          source_module_id: 'projects',
          body: `Started sprint "${sprint.name}"`,
          meta: { sprint_id: sprint.id, project_id: sprint.project_id },
        })
      }

      if (prior?.status !== 'COMPLETED' && sprint.status === 'COMPLETED') {
        pmEvents.emit('pm', { type: 'sprint_ended', projectId: sprint.project_id, sprintId: sprint.id })
        void logActivity(db, {
          workspace_id: workspace.id,
          user_id: user.id,
          type: 'sprint_ended',
          source_module_id: 'projects',
          body: `Ended sprint "${sprint.name}"`,
          meta: { sprint_id: sprint.id, project_id: sprint.project_id },
        })
      }

      return res.json({ data: sprint, error: null })
    } catch {
      return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Sprint not found' } })
    }
  })

  // GET /api/projects/:projectId/sprints/:sprintId/tasks
  router.get('/:sprintId/tasks', async (req, res) => {
    const { sprintId } = req.params as { sprintId: string }
    const tasks = await db.selectFrom('sprint_tasks as st')
      .innerJoin('project_tasks as t', 't.id', 'st.task_id')
      .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
      .select(['t.id', 't.title', 't.priority', 't.status_id', 's.name as status_name', 's.is_done', 'st.points'])
      .where('st.sprint_id', '=', sprintId)
      .execute()
    return res.json({ data: tasks, error: null })
  })

  // POST /api/projects/:projectId/sprints/:sprintId/tasks
  router.post('/:sprintId/tasks', async (req, res) => {
    const { sprintId } = req.params as { sprintId: string }
    const parsed = addSprintTaskSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    await db.insertInto('sprint_tasks')
      .values({ sprint_id: sprintId, task_id: parsed.data.task_id, points: parsed.data.points ?? null })
      .onConflict(oc => oc.columns(['sprint_id', 'task_id']).doUpdateSet({ points: parsed.data.points ?? null }))
      .execute()
    return res.json({ data: { success: true }, error: null })
  })

  // DELETE /api/projects/:projectId/sprints/:sprintId/tasks/:taskId
  router.delete('/:sprintId/tasks/:taskId', async (req, res) => {
    const { sprintId, taskId } = req.params as { sprintId: string; taskId: string }
    await db.deleteFrom('sprint_tasks').where('sprint_id', '=', sprintId).where('task_id', '=', taskId).execute()
    return res.json({ data: { success: true }, error: null })
  })

  return router
}
