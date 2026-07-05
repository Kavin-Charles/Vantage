import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'

const createRuleSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  status_id: z.string().uuid().optional(),
  priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']).optional(),
  assignee_ids: z.array(z.string().uuid()).optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  interval: z.number().int().min(1).max(365).default(1),
})

const updateRuleSchema = createRuleSchema.partial().extend({
  is_active: z.boolean().optional(),
})

async function verifyProjectAccess(db: Kysely<Database>, projectId: string, workspaceId: string) {
  return db.selectFrom('projects').select('id')
    .where('id', '=', projectId)
    .where('workspace_id', '=', workspaceId)
    .where('status', '!=', 'DELETED')
    .executeTakeFirst()
}

export function computeNextRun(from: Date, frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY', interval: number): Date {
  const next = new Date(from)
  if (frequency === 'DAILY') next.setUTCDate(next.getUTCDate() + interval)
  else if (frequency === 'WEEKLY') next.setUTCDate(next.getUTCDate() + interval * 7)
  else next.setUTCMonth(next.getUTCMonth() + interval)
  return next
}

export function createRecurringRulesRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  // GET /api/projects/:projectId/recurring-rules
  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const rules = await db.selectFrom('recurring_task_rules')
        .selectAll()
        .where('project_id', '=', projectId)
        .orderBy('created_at', 'asc')
        .execute()

      return res.json({ data: rules, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // POST /api/projects/:projectId/recurring-rules
  router.post('/', async (req, res) => {
    const { user, workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    const parsed = createRuleSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const nextRunAt = computeNextRun(new Date(), parsed.data.frequency, parsed.data.interval)

      const rule = await db.insertInto('recurring_task_rules')
        .values({
          project_id: projectId,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          status_id: parsed.data.status_id ?? null,
          priority: parsed.data.priority ?? 'NONE',
          assignee_ids: (parsed.data.assignee_ids ? JSON.stringify(parsed.data.assignee_ids) : null) as unknown as string[] | null,
          frequency: parsed.data.frequency,
          interval: parsed.data.interval,
          next_run_at: nextRunAt,
          created_by: user.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      return res.status(201).json({ data: rule, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // PATCH /api/projects/:projectId/recurring-rules/:ruleId
  router.patch('/:ruleId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, ruleId } = req.params as { projectId: string; ruleId: string }
    const parsed = updateRuleSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const existing = await db.selectFrom('recurring_task_rules')
        .selectAll()
        .where('id', '=', ruleId)
        .where('project_id', '=', projectId)
        .executeTakeFirst()
      if (!existing) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Rule not found' } })

      const updates: Record<string, unknown> = { updated_at: new Date() }
      if (parsed.data.title !== undefined) updates.title = parsed.data.title
      if (parsed.data.description !== undefined) updates.description = parsed.data.description
      if (parsed.data.status_id !== undefined) updates.status_id = parsed.data.status_id
      if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority
      if (parsed.data.assignee_ids !== undefined) updates.assignee_ids = JSON.stringify(parsed.data.assignee_ids)
      if (parsed.data.frequency !== undefined) updates.frequency = parsed.data.frequency
      if (parsed.data.interval !== undefined) updates.interval = parsed.data.interval
      if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active

      if (parsed.data.frequency !== undefined || parsed.data.interval !== undefined) {
        const freq = (parsed.data.frequency ?? existing.frequency) as 'DAILY' | 'WEEKLY' | 'MONTHLY'
        const intv = parsed.data.interval ?? existing.interval
        updates.next_run_at = computeNextRun(new Date(), freq, intv)
      }

      const rule = await db.updateTable('recurring_task_rules')
        .set(updates as never)
        .where('id', '=', ruleId)
        .where('project_id', '=', projectId)
        .returningAll()
        .executeTakeFirst()

      if (!rule) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Rule not found' } })
      return res.json({ data: rule, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  // DELETE /api/projects/:projectId/recurring-rules/:ruleId
  router.delete('/:ruleId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, ruleId } = req.params as { projectId: string; ruleId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      await db.deleteFrom('recurring_task_rules')
        .where('id', '=', ruleId)
        .where('project_id', '=', projectId)
        .execute()

      return res.json({ data: { success: true }, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  return router
}
