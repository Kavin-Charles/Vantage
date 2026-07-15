import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'

const inviteMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['OWNER', 'MANAGER', 'MEMBER', 'VIEWER']).default('MEMBER'),
})

const updateMemberSchema = z.object({
  role: z.enum(['OWNER', 'MANAGER', 'MEMBER', 'VIEWER']),
})

export function createProjectMembersRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  // GET /api/projects/:projectId/members
  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await db.selectFrom('projects').select('id')
        .where('id', '=', projectId).where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'DELETED')
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const members = await db.selectFrom('project_members as pm')
        .leftJoin('users as u', 'u.id', 'pm.user_id')
        .select(['pm.id', 'pm.project_id', 'pm.user_id', 'pm.role', 'pm.joined_at', 'u.name', 'u.email'])
        .where('pm.project_id', '=', projectId)
        .execute()
      return res.json({ data: members, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // POST /api/projects/:projectId/members/invite
  router.post('/invite', async (req, res) => {
    const { projectId } = req.params as { projectId: string }
    const parsed = inviteMemberSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const member = await db.insertInto('project_members')
        .values({ project_id: projectId, user_id: parsed.data.user_id, role: parsed.data.role })
        .onConflict(oc => oc.columns(['project_id', 'user_id']).doUpdateSet({ role: parsed.data.role }))
        .returningAll().executeTakeFirstOrThrow()
      return res.status(201).json({ data: member, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // PATCH /api/projects/:projectId/members/:memberId
  router.patch('/:memberId', async (req, res) => {
    const { memberId, projectId } = req.params as { memberId: string; projectId: string }
    const parsed = updateMemberSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const member = await db.updateTable('project_members').set({ role: parsed.data.role })
        .where('id', '=', memberId).where('project_id', '=', projectId)
        .returningAll().executeTakeFirstOrThrow()
      return res.json({ data: member, error: null })
    } catch {
      return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Member not found' } })
    }
  })

  // DELETE /api/projects/:projectId/members/:memberId
  router.delete('/:memberId', async (req, res) => {
    const { memberId, projectId } = req.params as { memberId: string; projectId: string }
    await db.deleteFrom('project_members').where('id', '=', memberId).where('project_id', '=', projectId).execute()
    return res.json({ data: { success: true }, error: null })
  })

  return router
}
