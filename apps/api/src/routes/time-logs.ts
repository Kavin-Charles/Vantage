import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'

const createLogSchema = z.object({
  minutes: z.number().int().min(1).max(1440),
  logged_at: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
})

async function verifyProjectAccess(db: Kysely<Database>, projectId: string, workspaceId: string) {
  return db.selectFrom('projects').select('id')
    .where('id', '=', projectId)
    .where('workspace_id', '=', workspaceId)
    .where('status', '!=', 'DELETED' as never)
    .executeTakeFirst()
}

export function createTimeLogsRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, taskId } = req.params as { projectId: string; taskId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const logs = await db.selectFrom('time_logs as l')
        .leftJoin('users as u', 'u.id', 'l.user_id')
        .select(['l.id', 'l.task_id', 'l.user_id', 'l.minutes', 'l.logged_at', 'l.note', 'u.name as user_name'])
        .where('l.task_id', '=', taskId)
        .orderBy('l.logged_at', 'desc')
        .execute()

      return res.json({ data: logs, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  router.post('/', async (req, res) => {
    const { user, workspace } = req as unknown as AuthenticatedRequest
    const { projectId, taskId } = req.params as { projectId: string; taskId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const parsed = createLogSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

      const log = await db.insertInto('time_logs')
        .values({
          task_id: taskId,
          user_id: user.id,
          minutes: parsed.data.minutes,
          logged_at: parsed.data.logged_at ? new Date(parsed.data.logged_at) : new Date(),
          note: parsed.data.note ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      return res.status(201).json({ data: log, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  router.delete('/:logId', async (req, res) => {
    const { user, workspace } = req as unknown as AuthenticatedRequest
    const { projectId, taskId, logId } = req.params as { projectId: string; taskId: string; logId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      await db.deleteFrom('time_logs')
        .where('id', '=', logId)
        .where('task_id', '=', taskId)
        .where('user_id', '=', user.id)
        .execute()

      return res.json({ data: { success: true }, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  return router
}
