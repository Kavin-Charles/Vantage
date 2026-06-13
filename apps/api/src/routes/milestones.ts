import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'

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
    const { projectId } = req.params
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
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
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params
    const parsed = createMilestoneSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const maxPos = await db.selectFrom('milestones').select(db.fn.max('position').as('max'))
        .where('project_id', '=', projectId).executeTakeFirst()

      const milestone = await db.insertInto('milestones')
        .values({
          project_id: projectId,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          due_date: parsed.data.due_date,
          client_visible: parsed.data.client_visible,
          position: (Number(maxPos?.max ?? -1)) + 1,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      return res.status(201).json({ data: milestone, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // PATCH /api/projects/:projectId/milestones/:milestoneId
  router.patch('/:milestoneId', async (req, res) => {
    const { projectId, milestoneId } = req.params
    const parsed = updateMilestoneSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const updates: Record<string, unknown> = {}
      if (parsed.data.name !== undefined) updates.name = parsed.data.name
      if (parsed.data.description !== undefined) updates.description = parsed.data.description
      if (parsed.data.due_date !== undefined) updates.due_date = parsed.data.due_date
      if (parsed.data.status !== undefined) updates.status = parsed.data.status
      if (parsed.data.client_visible !== undefined) updates.client_visible = parsed.data.client_visible

      const milestone = await db.updateTable('milestones').set(updates)
        .where('id', '=', milestoneId).where('project_id', '=', projectId)
        .returningAll().executeTakeFirstOrThrow()
      return res.json({ data: milestone, error: null })
    } catch {
      return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Milestone not found' } })
    }
  })

  // DELETE /api/projects/:projectId/milestones/:milestoneId
  router.delete('/:milestoneId', async (req, res) => {
    const { milestoneId, projectId } = req.params
    await db.deleteFrom('milestones').where('id', '=', milestoneId).where('project_id', '=', projectId).execute()
    return res.json({ data: { success: true }, error: null })
  })

  return router
}
