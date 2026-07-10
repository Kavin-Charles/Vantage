import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'

const createDocSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.record(z.unknown()).optional().default({}),
})

const updateDocSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.record(z.unknown()).optional(),
})

export function createProjectDocsRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  // GET /api/projects/:projectId/docs
  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const docs = await db.selectFrom('project_docs')
        .where('project_id', '=', projectId)
        .select(['id', 'title', 'created_by', 'created_at', 'updated_at'])
        .orderBy('updated_at', 'desc')
        .execute()

      return res.json({ data: docs, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // POST /api/projects/:projectId/docs
  router.post('/', async (req, res) => {
    const { workspace, user } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const parsed = createDocSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const doc = await db.insertInto('project_docs')
        .values({
          project_id: projectId,
          title: parsed.data.title,
          content: JSON.stringify(parsed.data.content),
          created_by: user.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      return res.status(201).json({
        data: { ...doc, content: JSON.parse(doc.content as unknown as string) },
        error: null,
      })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // GET /api/projects/:projectId/docs/:docId
  router.get('/:docId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, docId } = req.params as { projectId: string; docId: string }
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const doc = await db.selectFrom('project_docs')
        .where('id', '=', docId).where('project_id', '=', projectId)
        .selectAll()
        .executeTakeFirst()

      if (!doc) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Doc not found' } })

      return res.json({
        data: { ...doc, content: JSON.parse(doc.content as unknown as string) },
        error: null,
      })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // PATCH /api/projects/:projectId/docs/:docId
  router.patch('/:docId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, docId } = req.params as { projectId: string; docId: string }
    const parsed = updateDocSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const existing = await db.selectFrom('project_docs')
        .where('id', '=', docId).where('project_id', '=', projectId)
        .select('id')
        .executeTakeFirst()
      if (!existing) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Doc not found' } })

      const updates: Record<string, unknown> = { updated_at: new Date() }
      if (parsed.data.title !== undefined) updates.title = parsed.data.title
      if (parsed.data.content !== undefined) updates.content = JSON.stringify(parsed.data.content)

      const doc = await db.updateTable('project_docs')
        .set(updates)
        .where('id', '=', docId)
        .returningAll()
        .executeTakeFirstOrThrow()

      return res.json({
        data: { ...doc, content: JSON.parse(doc.content as unknown as string) },
        error: null,
      })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // DELETE /api/projects/:projectId/docs/:docId
  router.delete('/:docId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, docId } = req.params as { projectId: string; docId: string }
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const deleted = await db.deleteFrom('project_docs')
        .where('id', '=', docId).where('project_id', '=', projectId)
        .returning('id')
        .executeTakeFirst()

      if (!deleted) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Doc not found' } })

      return res.json({ data: { id: deleted.id }, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  return router
}
