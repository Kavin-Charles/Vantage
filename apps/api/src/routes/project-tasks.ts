import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'
import { pmEvents } from '../lib/pm-events'

const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  status_id: z.string().uuid().optional(),
  priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']).optional(),
  due_date: z.string().datetime().optional().nullable(),
  start_date: z.string().datetime().optional().nullable(),
  estimated_minutes: z.number().int().positive().optional().nullable(),
  client_visible: z.boolean().optional(),
  parent_id: z.string().uuid().optional().nullable(),
  assignee_ids: z.array(z.string().uuid()).optional(),
})

const updateTaskSchema = createTaskSchema.partial()

const bulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  status_id: z.string().uuid().optional(),
  priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']).optional(),
  assignee_ids: z.array(z.string().uuid()).optional(),
})

async function verifyProjectAccess(db: Kysely<Database>, projectId: string, workspaceId: string) {
  return db.selectFrom('projects').select('id')
    .where('id', '=', projectId)
    .where('workspace_id', '=', workspaceId)
    .where('status', '!=', 'DELETED' as any)
    .executeTakeFirst()
}

async function getDefaultStatusId(db: Kysely<Database>, projectId: string): Promise<string> {
  const first = await db.selectFrom('project_task_statuses')
    .select('id')
    .where('project_id', '=', projectId)
    .where('is_done', '=', false)
    .orderBy('position', 'asc')
    .executeTakeFirst()
  if (!first) throw new Error('No statuses found for project')
  return first.id
}

export function createProjectTasksRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  // List tasks for a project
  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const project = await verifyProjectAccess(db, projectId, workspace.id)
    if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

    const { status_id, priority, assignee_id, parent_id } = req.query as Record<string, string>

    let query = db.selectFrom('project_tasks')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('position', 'asc')
      .orderBy('created_at', 'asc')

    if (status_id) query = query.where('status_id', '=', status_id)
    if (priority) query = query.where('priority', '=', priority as any)
    if (parent_id === 'null') query = query.where('parent_id', 'is', null)
    else if (parent_id) query = query.where('parent_id', '=', parent_id)

    const tasks = await query.execute()

    const taskIds = tasks.map(t => t.id)
    const assignees = taskIds.length > 0
      ? await db.selectFrom('project_task_assignees as a')
          .innerJoin('users as u', 'u.id', 'a.user_id')
          .select(['a.task_id', 'u.id', 'u.name', 'u.email'])
          .where('a.task_id', 'in', taskIds)
          .execute()
      : []

    const assigneeMap: Record<string, typeof assignees> = {}
    for (const a of assignees) {
      if (!assigneeMap[a.task_id]) assigneeMap[a.task_id] = []
      assigneeMap[a.task_id]!.push(a)
    }

    const result = tasks.map(t => ({ ...t, assignees: assigneeMap[t.id] ?? [] }))

    if (assignee_id) {
      return res.json({ data: result.filter(t => t.assignees.some(a => a.id === assignee_id)), error: null })
    }

    return res.json({ data: result, error: null })
  })

  // Create task
  router.post('/', async (req, res) => {
    const { user, workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const project = await verifyProjectAccess(db, projectId, workspace.id)
    if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

    const parsed = createTaskSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

    const statusId = parsed.data.status_id ?? await getDefaultStatusId(db, projectId)

    const task = await db.insertInto('project_tasks')
      .values({
        project_id: projectId,
        created_by: user.id,
        status_id: statusId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        priority: (parsed.data.priority ?? 'NONE') as any,
        due_date: parsed.data.due_date ? new Date(parsed.data.due_date) : null,
        start_date: parsed.data.start_date ? new Date(parsed.data.start_date) : null,
        estimated_minutes: parsed.data.estimated_minutes ?? null,
        client_visible: parsed.data.client_visible ?? false,
        parent_id: parsed.data.parent_id ?? null,
        position: Date.now(),
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    if (parsed.data.assignee_ids?.length) {
      await db.insertInto('project_task_assignees')
        .values(parsed.data.assignee_ids.map(uid => ({ task_id: task.id, user_id: uid })))
        .onConflict(oc => oc.columns(['task_id', 'user_id']).doNothing())
        .execute()
    }

    return res.status(201).json({ data: task, error: null })
  })

  // Bulk update tasks — must come before /:taskId to avoid route conflict
  router.post('/bulk-update', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const project = await verifyProjectAccess(db, projectId, workspace.id)
    if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

    const parsed = bulkUpdateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

    const updates: Record<string, unknown> = { updated_at: new Date() }
    if (parsed.data.status_id) updates['status_id'] = parsed.data.status_id
    if (parsed.data.priority) updates['priority'] = parsed.data.priority

    if (Object.keys(updates).length > 1) {
      await db.updateTable('project_tasks')
        .set(updates as any)
        .where('id', 'in', parsed.data.ids)
        .where('project_id', '=', projectId)
        .execute()
    }

    return res.json({ data: { updated: parsed.data.ids.length }, error: null })
  })

  // Get single task
  router.get('/:taskId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, taskId } = req.params as { projectId: string; taskId: string }
    const project = await verifyProjectAccess(db, projectId, workspace.id)
    if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

    const task = await db.selectFrom('project_tasks')
      .selectAll()
      .where('id', '=', taskId)
      .where('project_id', '=', projectId)
      .executeTakeFirst()
    if (!task) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } })

    const assignees = await db.selectFrom('project_task_assignees as a')
      .innerJoin('users as u', 'u.id', 'a.user_id')
      .select(['u.id', 'u.name', 'u.email'])
      .where('a.task_id', '=', taskId)
      .execute()

    const subtasks = await db.selectFrom('project_tasks')
      .selectAll()
      .where('parent_id', '=', taskId)
      .orderBy('position', 'asc')
      .execute()

    const checklists = await db.selectFrom('project_task_checklists')
      .selectAll()
      .where('task_id', '=', taskId)
      .orderBy('position', 'asc')
      .execute()

    return res.json({ data: { ...task, assignees, subtasks, checklists }, error: null })
  })

  // Update task
  router.patch('/:taskId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, taskId } = req.params as { projectId: string; taskId: string }
    const project = await verifyProjectAccess(db, projectId, workspace.id)
    if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

    const parsed = updateTaskSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

    const updates: Record<string, unknown> = { updated_at: new Date() }
    if (parsed.data.title !== undefined) updates['title'] = parsed.data.title
    if (parsed.data.description !== undefined) updates['description'] = parsed.data.description
    if (parsed.data.status_id !== undefined) updates['status_id'] = parsed.data.status_id
    if (parsed.data.priority !== undefined) updates['priority'] = parsed.data.priority
    if (parsed.data.due_date !== undefined) updates['due_date'] = parsed.data.due_date ? new Date(parsed.data.due_date) : null
    if (parsed.data.start_date !== undefined) updates['start_date'] = parsed.data.start_date ? new Date(parsed.data.start_date) : null
    if (parsed.data.estimated_minutes !== undefined) updates['estimated_minutes'] = parsed.data.estimated_minutes
    if (parsed.data.client_visible !== undefined) updates['client_visible'] = parsed.data.client_visible
    if (parsed.data.parent_id !== undefined) updates['parent_id'] = parsed.data.parent_id

    try {
      const task = await db.updateTable('project_tasks')
        .set(updates as any)
        .where('id', '=', taskId)
        .where('project_id', '=', projectId)
        .returningAll()
        .executeTakeFirstOrThrow()

      if (parsed.data.assignee_ids !== undefined) {
        await db.deleteFrom('project_task_assignees').where('task_id', '=', taskId).execute()
        if (parsed.data.assignee_ids.length) {
          await db.insertInto('project_task_assignees')
            .values(parsed.data.assignee_ids.map(uid => ({ task_id: task.id, user_id: uid })))
            .execute()
        }
      }

      if (parsed.data.status_id !== undefined) {
        pmEvents.emit('pm', {
          type: 'task_status_changed',
          projectId,
          taskId: task.id,
          to_status_id: parsed.data.status_id,
        })
      }

      return res.json({ data: task, error: null })
    } catch {
      return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } })
    }
  })

  // Delete task
  router.delete('/:taskId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, taskId } = req.params as { projectId: string; taskId: string }
    const project = await verifyProjectAccess(db, projectId, workspace.id)
    if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
    await db.deleteFrom('project_tasks').where('id', '=', taskId).where('project_id', '=', projectId).execute()
    return res.json({ data: { success: true }, error: null })
  })

  // Comments sub-routes
  router.get('/:taskId/comments', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, taskId } = req.params as { projectId: string; taskId: string }
    const project = await verifyProjectAccess(db, projectId, workspace.id)
    if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
    const comments = await db.selectFrom('project_task_comments as c')
      .leftJoin('users as u', 'u.id', 'c.user_id')
      .select(['c.id', 'c.task_id', 'c.user_id', 'c.body', 'c.parent_id', 'c.created_at', 'c.updated_at', 'u.name as author_name'])
      .where('c.task_id', '=', taskId)
      .where('c.parent_id', 'is', null)
      .orderBy('c.created_at', 'asc')
      .execute()
    return res.json({ data: comments, error: null })
  })

  router.post('/:taskId/comments', async (req, res) => {
    const { user, workspace } = req as unknown as AuthenticatedRequest
    const { projectId, taskId } = req.params as { projectId: string; taskId: string }
    const project = await verifyProjectAccess(db, projectId, workspace.id)
    if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
    const { body, parent_id } = req.body as { body?: string; parent_id?: string }
    if (!body?.trim()) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: 'body required' } })
    const comment = await db.insertInto('project_task_comments')
      .values({ task_id: taskId, user_id: user.id, body, parent_id: parent_id ?? null })
      .returningAll()
      .executeTakeFirstOrThrow()
    return res.status(201).json({ data: comment, error: null })
  })

  return router
}

// Cross-project "my tasks" router
export function createMyTasksRouter(db: Kysely<Database>): Router {
  const router = Router()
  router.get('/', async (req, res) => {
    const { user } = req as unknown as AuthenticatedRequest
    const tasks = await db.selectFrom('project_task_assignees as a')
      .innerJoin('project_tasks as t', 't.id', 'a.task_id')
      .innerJoin('projects as p', 'p.id', 't.project_id')
      .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
      .select(['t.id', 't.title', 't.project_id', 'p.name as project_name', 't.due_date', 't.priority', 's.name as status_name', 's.color as status_color', 's.is_done'])
      .where('a.user_id', '=', user.id)
      .where('s.is_done', '=', false)
      .where('p.status', '!=', 'DELETED' as any)
      .orderBy('t.due_date', 'asc')
      .execute()
    return res.json({ data: tasks, error: null })
  })
  return router
}
