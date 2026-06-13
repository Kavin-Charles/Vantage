import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
})

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  health: z.enum(['ON_TRACK', 'AT_RISK', 'OFF_TRACK']).optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
})

async function seedDefaultStatuses(db: Kysely<Database>, projectId: string) {
  const statuses = [
    { name: 'Backlog', color: '#9e998f', position: 0, is_done: false },
    { name: 'In Progress', color: '#1e3a8a', position: 1, is_done: false },
    { name: 'In Review', color: '#92400e', position: 2, is_done: false },
    { name: 'Done', color: '#2d6a4f', position: 3, is_done: true },
  ]
  await db.insertInto('project_task_statuses')
    .values(statuses.map(s => ({ ...s, project_id: projectId })))
    .execute()
}

export function createProjectsRouter(db: Kysely<Database>): Router {
  const router = Router()

  // List projects
  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { status, search } = req.query as { status?: string; search?: string }
    try {
      let query = db.selectFrom('projects')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED' as 'ACTIVE')
        .orderBy('created_at', 'desc')
      if (status) query = query.where('status', '=', status as 'ACTIVE' | 'ARCHIVED')
      if (search) query = query.where('name', 'ilike', `%${search}%`)
      const projects = await query.execute()
      return res.json({ data: projects, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // Create project
  router.post('/', async (req, res) => {
    const { user, workspace } = req as unknown as AuthenticatedRequest
    const parsed = createProjectSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const project = await db.insertInto('projects')
        .values({
          workspace_id: workspace.id,
          created_by: user.id,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          color: parsed.data.color ?? null,
          start_date: parsed.data.start_date ? new Date(parsed.data.start_date) : null,
          end_date: parsed.data.end_date ? new Date(parsed.data.end_date) : null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      await seedDefaultStatuses(db, project.id)
      return res.status(201).json({ data: project, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // Get project by ID (with progress)
  router.get('/:id', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    try {
      const project = await db.selectFrom('projects')
        .selectAll()
        .where('id', '=', req.params.id!)
        .where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED' as 'ACTIVE')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const allTasks = await db.selectFrom('project_tasks as t')
        .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
        .select(['s.is_done'])
        .where('t.project_id', '=', project.id)
        .where('t.parent_id', 'is', null)
        .execute()
      const total = allTasks.length
      const done = allTasks.filter(t => t.is_done).length
      const progress = total === 0 ? 0 : Math.round((done / total) * 100)

      return res.json({ data: { ...project, progress }, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // Update project
  router.patch('/:id', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const parsed = updateProjectSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const updates: Record<string, unknown> = { updated_at: new Date() }
      if (parsed.data.name !== undefined) updates.name = parsed.data.name
      if (parsed.data.description !== undefined) updates.description = parsed.data.description
      if (parsed.data.color !== undefined) updates.color = parsed.data.color
      if (parsed.data.status !== undefined) updates.status = parsed.data.status
      if (parsed.data.health !== undefined) updates.health = parsed.data.health
      if (parsed.data.start_date !== undefined) updates.start_date = parsed.data.start_date ? new Date(parsed.data.start_date) : null
      if (parsed.data.end_date !== undefined) updates.end_date = parsed.data.end_date ? new Date(parsed.data.end_date) : null

      const project = await db.updateTable('projects')
        .set(updates)
        .where('id', '=', req.params.id!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirstOrThrow()
      return res.json({ data: project, error: null })
    } catch {
      return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
    }
  })

  // Delete (soft) project
  router.delete('/:id', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    try {
      await db.updateTable('projects')
        .set({ status: 'DELETED', updated_at: new Date() })
        .where('id', '=', req.params.id!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirstOrThrow()
      return res.json({ data: { success: true }, error: null })
    } catch {
      return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
    }
  })

  return router
}

export function createProjectStatusesRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const project = await db.selectFrom('projects').select('id')
      .where('id', '=', (req.params as { projectId: string }).projectId)
      .where('workspace_id', '=', workspace.id)
      .executeTakeFirst()
    if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
    const statuses = await db.selectFrom('project_task_statuses')
      .selectAll()
      .where('project_id', '=', (req.params as { projectId: string }).projectId)
      .orderBy('position', 'asc')
      .execute()
    return res.json({ data: statuses, error: null })
  })

  return router
}
