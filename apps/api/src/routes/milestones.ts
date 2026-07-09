import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'
import { logActivity } from '../lib/log-activity'
import { pmEvents } from '../lib/pm-events'

const createMilestoneSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  due_date: z.string(),
  client_visible: z.boolean().default(false),
})

const updateMilestoneSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  due_date: z.string().optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'MISSED']).optional(),
  client_visible: z.boolean().optional(),
})

export function createMilestonesRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  // GET /api/projects/:projectId/milestones
  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const milestones = await db.selectFrom('milestones').selectAll()
        .where('project_id', '=', projectId)
        .orderBy('due_date', 'asc')
        .execute()
      return res.json({ data: milestones, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // POST /api/projects/:projectId/milestones
  router.post('/', async (req, res) => {
    const { user, workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const parsed = createMilestoneSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const maxPos = await db.selectFrom('milestones').select(db.fn.max('position').as('max'))
        .where('project_id', '=', projectId).executeTakeFirst()

      const milestone = await db.insertInto('milestones')
        .values({
          project_id: projectId,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          due_date: parsed.data.due_date as unknown as Date,
          client_visible: parsed.data.client_visible,
          position: (Number(maxPos?.max ?? -1)) + 1,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'milestone_created',
        source_module_id: 'projects',
        body: `Created milestone "${milestone.name}"`,
        meta: { milestone_id: milestone.id, project_id: milestone.project_id },
      })

      return res.status(201).json({ data: milestone, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // PATCH /api/projects/:projectId/milestones/:milestoneId
  router.patch('/:milestoneId', async (req, res) => {
    const { user, workspace } = req as unknown as AuthenticatedRequest
    const { projectId, milestoneId } = req.params as { projectId: string; milestoneId: string }
    const parsed = updateMilestoneSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const updates: Record<string, unknown> = {}
      if (parsed.data.name !== undefined) updates.name = parsed.data.name
      if (parsed.data.description !== undefined) updates.description = parsed.data.description
      if (parsed.data.due_date !== undefined) updates.due_date = parsed.data.due_date
      if (parsed.data.status !== undefined) updates.status = parsed.data.status
      if (parsed.data.client_visible !== undefined) updates.client_visible = parsed.data.client_visible

      const prior = await db
        .selectFrom('milestones')
        .where('id', '=', milestoneId)
        .where('project_id', '=', projectId)
        .select(['status'])
        .executeTakeFirst()

      const milestone = await db.updateTable('milestones').set(updates)
        .where('id', '=', milestoneId).where('project_id', '=', projectId)
        .returningAll().executeTakeFirstOrThrow()

      if (prior?.status !== 'COMPLETED' && milestone.status === 'COMPLETED') {
        pmEvents.emit('pm', { type: 'milestone_completed', projectId: milestone.project_id, milestoneId: milestone.id })
        void logActivity(db, {
          workspace_id: workspace.id,
          user_id: user.id,
          type: 'milestone_completed',
          source_module_id: 'projects',
          body: `Completed milestone "${milestone.name}"`,
          meta: { milestone_id: milestone.id, project_id: milestone.project_id },
        })
      }

      return res.json({ data: milestone, error: null })
    } catch {
      return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Milestone not found' } })
    }
  })

  // DELETE /api/projects/:projectId/milestones/:milestoneId
  router.delete('/:milestoneId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { milestoneId, projectId } = req.params as { milestoneId: string; projectId: string }
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      await db.deleteFrom('milestones').where('id', '=', milestoneId).where('project_id', '=', projectId).execute()
      return res.json({ data: { success: true }, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  return router
}
