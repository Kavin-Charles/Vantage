import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'
import { resolveHook } from '../lib/hooks-runtime'

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  source_item_id: z.string().uuid().optional(),
})

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  health: z.enum(['ON_TRACK', 'AT_RISK', 'OFF_TRACK']).optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  source_item_id: z.string().uuid().nullable().optional(),
})

async function seedDefaultStatuses(db: Kysely<Database>, projectId: string) {
  const statuses = [
    { name: 'Backlog',     color: '#9e998f', position: 0, is_done: false },
    { name: 'In Progress', color: '#1e3a8a', position: 1, is_done: false },
    { name: 'In Review',   color: '#92400e', position: 2, is_done: false },
    { name: 'Done',        color: '#2d6a4f', position: 3, is_done: true  },
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
          contact_id: parsed.data.contact_id ?? null,
          company_id: parsed.data.company_id ?? null,
          source_item_id: parsed.data.source_item_id ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      await seedDefaultStatuses(db, project.id)
      return res.status(201).json({ data: project, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // Get project by ID (with progress + CRM enrichment)
  router.get('/:id', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    try {
      const project = await db.selectFrom('projects')
        .selectAll()
        .where('id', '=', req.params['id']!)
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

      // CRM enrichment — only fetch data when the respective hook is active
      const [customerHook, revenueHook] = await Promise.all([
        resolveHook(db, workspace.id, 'projects', 'customer_sync'),
        resolveHook(db, workspace.id, 'projects', 'revenue_attribution'),
      ])

      let crm_contact: Record<string, unknown> | null = null
      let crm_company: Record<string, unknown> | null = null
      let crm_item: Record<string, unknown> | null = null

      if (customerHook && project.contact_id) {
        const contact = await db.selectFrom('contacts')
          .select(['id', 'name', 'email', 'phone', 'status', 'last_contacted_at'])
          .where('id', '=', project.contact_id)
          .where('workspace_id', '=', workspace.id)
          .where('deleted_at', 'is', null)
          .executeTakeFirst()
        if (contact) crm_contact = contact as Record<string, unknown>
      }

      if (customerHook && project.company_id) {
        const company = await db.selectFrom('companies')
          .select(['id', 'name', 'industry', 'location', 'website', 'employee_count'])
          .where('id', '=', project.company_id)
          .where('workspace_id', '=', workspace.id)
          .where('deleted_at', 'is', null)
          .executeTakeFirst()
        if (company) crm_company = company as Record<string, unknown>
      }

      if (revenueHook && project.source_item_id) {
        const item = await db.selectFrom('pipeline_items')
          .select(['id', 'field_values', 'stage_id', 'pipeline_id'])
          .where('id', '=', project.source_item_id)
          .where('workspace_id', '=', workspace.id)
          .where('deleted_at', 'is', null)
          .executeTakeFirst()
        if (item) crm_item = item as Record<string, unknown>
      }

      return res.json({
        data: { ...project, progress, crm_contact, crm_company, crm_item },
        error: null,
      })
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
      if (parsed.data.name !== undefined) updates['name'] = parsed.data.name
      if (parsed.data.description !== undefined) updates['description'] = parsed.data.description
      if (parsed.data.color !== undefined) updates['color'] = parsed.data.color
      if (parsed.data.status !== undefined) updates['status'] = parsed.data.status
      if (parsed.data.health !== undefined) updates['health'] = parsed.data.health
      if (parsed.data.start_date !== undefined) updates['start_date'] = parsed.data.start_date ? new Date(parsed.data.start_date) : null
      if (parsed.data.end_date !== undefined) updates['end_date'] = parsed.data.end_date ? new Date(parsed.data.end_date) : null
      if (parsed.data.contact_id !== undefined) updates['contact_id'] = parsed.data.contact_id
      if (parsed.data.company_id !== undefined) updates['company_id'] = parsed.data.company_id
      if (parsed.data.source_item_id !== undefined) updates['source_item_id'] = parsed.data.source_item_id

      const project = await db.updateTable('projects')
        .set(updates)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirstOrThrow()
      return res.json({ data: project, error: null })
    } catch {
      return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
    }
  })

  // CRM activity timeline for a project's linked contact
  router.get('/:id/crm-activity', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    try {
      const hook = await resolveHook(db, workspace.id, 'projects', 'client_activity_timeline')
      if (!hook) {
        return res.status(403).json({ data: null, error: { code: 'HOOK_DISABLED', message: 'client_activity_timeline hook is not enabled' } })
      }

      const project = await db.selectFrom('projects')
        .select(['id', 'contact_id'])
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED' as 'ACTIVE')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
      if (!project.contact_id) return res.json({ data: [], error: null })

      const page = Math.max(1, Number(req.query['page'] ?? 1))
      const limit = Math.min(50, Math.max(1, Number(req.query['limit'] ?? 20)))

      const activities = await db.selectFrom('activities')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('contact_id', '=', project.contact_id)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset((page - 1) * limit)
        .execute()

      return res.json({ data: activities, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // Delete (soft) project
  router.delete('/:id', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    try {
      await db.updateTable('projects')
        .set({ status: 'DELETED', updated_at: new Date() })
        .where('id', '=', req.params['id']!)
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

export function createProjectLabelsRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })
  const labelSchema = z.object({
    name: z.string().min(1).max(100),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })

  async function verifyProject(projectId: string, workspaceId: string) {
    return db.selectFrom('projects').select('id')
      .where('id', '=', projectId)
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst()
  }

  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    if (!await verifyProject(projectId, workspace.id)) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
    try {
      const labels = await db.selectFrom('task_labels').selectAll()
        .where('project_id', '=', projectId)
        .orderBy('name', 'asc')
        .execute()
      return res.json({ data: labels, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  router.post('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const parsed = labelSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    if (!await verifyProject(projectId, workspace.id)) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
    try {
      const label = await db.insertInto('task_labels')
        .values({ project_id: projectId, name: parsed.data.name, color: parsed.data.color })
        .returningAll().executeTakeFirstOrThrow()
      return res.status(201).json({ data: label, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  router.patch('/:labelId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, labelId } = req.params as { projectId: string; labelId: string }
    const parsed = labelSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    if (!await verifyProject(projectId, workspace.id)) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
    try {
      const label = await db.updateTable('task_labels')
        .set({ name: parsed.data.name, color: parsed.data.color })
        .where('id', '=', labelId)
        .where('project_id', '=', projectId)
        .returningAll().executeTakeFirstOrThrow()
      return res.json({ data: label, error: null })
    } catch {
      return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Label not found' } })
    }
  })

  router.delete('/:labelId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, labelId } = req.params as { projectId: string; labelId: string }
    if (!await verifyProject(projectId, workspace.id)) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })
    try {
      await db.deleteFrom('task_labels')
        .where('id', '=', labelId)
        .where('project_id', '=', projectId)
        .executeTakeFirstOrThrow()
      return res.json({ data: { success: true }, error: null })
    } catch {
      return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Label not found' } })
    }
  })

  return router
}
