import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'

const applyTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

const saveAsTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  is_public: z.boolean().default(false),
})

interface TemplateStatus {
  name: string
  color: string | null
  position: number
  is_done: boolean
}

interface TemplateTask {
  title: string
  priority: string | null
  status_name: string
}

interface TemplateData {
  statuses: TemplateStatus[]
  tasks: TemplateTask[]
}

export function createProjectTemplatesRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  // GET /api/project-templates
  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    try {
      const templates = await db.selectFrom('project_templates')
        .where(eb => eb.or([
          eb('workspace_id', '=', workspace.id),
          eb('is_public', '=', true),
        ]))
        .select(['id', 'workspace_id', 'name', 'description', 'is_public', 'created_by', 'created_at'])
        .orderBy('created_at', 'desc')
        .execute()

      return res.json({ data: templates, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // POST /api/project-templates/:templateId/apply
  router.post('/:templateId/apply', async (req, res) => {
    const { workspace, user } = req as unknown as AuthenticatedRequest
    const { templateId } = req.params as { templateId: string }
    const parsed = applyTemplateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const template = await db.selectFrom('project_templates')
        .where('id', '=', templateId)
        .where(eb => eb.or([
          eb('workspace_id', '=', workspace.id),
          eb('is_public', '=', true),
        ]))
        .selectAll()
        .executeTakeFirst()
      if (!template) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Template not found' } })

      const templateData = JSON.parse(template.template_data as unknown as string) as TemplateData

      // Create project
      const project = await db.insertInto('projects')
        .values({
          workspace_id: workspace.id,
          name: parsed.data.name,
          color: parsed.data.color ?? null,
          owner_id: user.id,
          status: 'ACTIVE',
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      // Insert statuses and build name->id map
      const statusMap: Record<string, string> = {}
      for (const s of (templateData.statuses ?? [])) {
        const inserted = await db.insertInto('project_task_statuses')
          .values({
            project_id: project.id,
            name: s.name,
            color: s.color ?? null,
            position: s.position,
            is_done: s.is_done,
          })
          .returning(['id', 'name'])
          .executeTakeFirstOrThrow()
        statusMap[s.name] = inserted.id
      }

      // Find first non-done status as default
      const defaultStatus = (templateData.statuses ?? []).find(s => !s.is_done)
      const defaultStatusId = defaultStatus ? statusMap[defaultStatus.name] : null

      // Insert tasks
      for (const t of (templateData.tasks ?? []).slice(0, 50)) {
        const statusId = t.status_name ? (statusMap[t.status_name] ?? defaultStatusId) : defaultStatusId
        if (!statusId) continue
        await db.insertInto('project_tasks')
          .values({
            project_id: project.id,
            title: t.title,
            priority: t.priority ?? null,
            status_id: statusId,
            created_by: user.id,
          })
          .execute()
      }

      return res.status(201).json({ data: project, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // DELETE /api/project-templates/:templateId
  router.delete('/:templateId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { templateId } = req.params as { templateId: string }
    try {
      const deleted = await db.deleteFrom('project_templates')
        .where('id', '=', templateId)
        .where('workspace_id', '=', workspace.id)
        .returning('id')
        .executeTakeFirst()

      if (!deleted) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Template not found' } })

      return res.json({ data: { id: deleted.id }, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  return router
}

export function createSaveAsTemplateRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  // POST /api/projects/:projectId/save-as-template
  router.post('/', async (req, res) => {
    const { workspace, user } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const parsed = saveAsTemplateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const statuses = await db.selectFrom('project_task_statuses')
        .where('project_id', '=', projectId)
        .select(['name', 'color', 'position', 'is_done'])
        .orderBy('position', 'asc')
        .execute()

      const tasks = await db.selectFrom('project_tasks as t')
        .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
        .where('t.project_id', '=', projectId)
        .select(['t.title', 't.priority', 's.name as status_name'])
        .limit(50)
        .execute()

      const templateData: TemplateData = {
        statuses: statuses.map(s => ({
          name: s.name,
          color: s.color,
          position: s.position,
          is_done: s.is_done,
        })),
        tasks: tasks.map(t => ({
          title: t.title,
          priority: t.priority,
          status_name: t.status_name,
        })),
      }

      const template = await db.insertInto('project_templates')
        .values({
          workspace_id: workspace.id,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          is_public: parsed.data.is_public,
          template_data: JSON.stringify(templateData),
          created_by: user.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      return res.status(201).json({ data: template, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  return router
}
