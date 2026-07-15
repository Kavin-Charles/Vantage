import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'

function parseRuleFields(rule: { trigger: unknown; actions: unknown }) {
  const triggerParsed = triggerSchema.safeParse(
    typeof rule.trigger === 'string' ? JSON.parse(rule.trigger) : rule.trigger,
  )
  const actionsParsed = z.array(actionSchema).safeParse(
    typeof rule.actions === 'string' ? JSON.parse(rule.actions as string) : rule.actions,
  )
  if (!triggerParsed.success || !actionsParsed.success) return null
  return { trigger: triggerParsed.data, actions: actionsParsed.data }
}

export const triggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('task_status_changed'), to_status_id: z.string().uuid().optional() }),
  z.object({ type: z.literal('task_overdue') }),
  z.object({ type: z.literal('task_assigned') }),
  z.object({ type: z.literal('milestone_completed') }),
  z.object({ type: z.literal('client_approved') }),
  z.object({ type: z.literal('client_rejected') }),
  z.object({ type: z.literal('sprint_started') }),
  z.object({ type: z.literal('sprint_ended') }),
])

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('send_notification'), user_ids: z.array(z.string().uuid()), message: z.string() }),
  z.object({ type: z.literal('change_task_status'), status_id: z.string().uuid() }),
  z.object({ type: z.literal('assign_task'), user_id: z.string().uuid() }),
  z.object({ type: z.literal('mark_milestone_complete'), milestone_id: z.string().uuid() }),
  z.object({ type: z.literal('send_webhook'), url: z.string().url(), payload: z.record(z.unknown()).optional() }),
  z.object({
    type: z.literal('create_task'),
    title: z.string().min(1).max(500),
    status_id: z.string().uuid().optional(),
    assignee_ids: z.array(z.string().uuid()).optional(),
  }),
  z.object({
    type: z.literal('set_custom_field'),
    custom_field_id: z.string().uuid(),
    value: z.string(),
  }),
])

export const createRuleSchema = z.object({
  name: z.string().min(1).max(255),
  trigger: triggerSchema,
  actions: z.array(actionSchema).min(1).max(10),
  is_active: z.boolean().default(true),
})

const updateRuleSchema = createRuleSchema.partial()

async function verifyProjectAccess(db: Kysely<Database>, projectId: string, workspaceId: string) {
  return db
    .selectFrom('projects')
    .selectAll()
    .where('id', '=', projectId)
    .where('workspace_id', '=', workspaceId)
    .where('status', '!=', 'DELETED' as 'DELETED')
    .executeTakeFirst()
}

export function createAutomationRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const rules = await db
        .selectFrom('automation_rules')
        .selectAll()
        .where('project_id', '=', projectId)
        .orderBy('created_at', 'asc')
        .execute()

      const parsed = rules.map(r => {
        const fields = parseRuleFields(r)
        if (!fields) return null
        return { ...r, ...fields }
      }).filter(Boolean)

      return res.json({ data: parsed, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  router.post('/', async (req, res) => {
    const { user, workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const count = await db
        .selectFrom('automation_rules')
        .select(db.fn.countAll<number>().as('count'))
        .where('project_id', '=', projectId)
        .executeTakeFirst()
      if (Number(count?.count ?? 0) >= 20) {
        return res.status(400).json({ data: null, error: { code: 'LIMIT_EXCEEDED', message: 'Maximum 20 automation rules per project' } })
      }

      const parsed = createRuleSchema.safeParse(req.body)
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
      }

      const rule = await db.insertInto('automation_rules').values({
        project_id: projectId,
        name: parsed.data.name,
        trigger: JSON.stringify(parsed.data.trigger),
        actions: JSON.stringify(parsed.data.actions),
        is_active: parsed.data.is_active,
        created_by: user.id,
      }).returningAll().executeTakeFirstOrThrow()

      const ruleFields = parseRuleFields(rule)
      if (!ruleFields) return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })

      return res.status(201).json({
        data: { ...rule, ...ruleFields },
        error: null,
      })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  router.patch('/:ruleId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, ruleId } = req.params as { projectId: string; ruleId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const parsed = updateRuleSchema.safeParse(req.body)
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
      }

      const updates: {
        name?: string
        is_active?: boolean
        trigger?: string
        actions?: string
        updated_at: string
      } = { updated_at: new Date().toISOString() }
      if (parsed.data.name !== undefined) updates.name = parsed.data.name
      if (parsed.data.trigger !== undefined) updates.trigger = JSON.stringify(parsed.data.trigger)
      if (parsed.data.actions !== undefined) updates.actions = JSON.stringify(parsed.data.actions)
      if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active

      const hasChanges = parsed.data.name !== undefined || parsed.data.trigger !== undefined ||
        parsed.data.actions !== undefined || parsed.data.is_active !== undefined
      if (!hasChanges) {
        const existing = await db
          .selectFrom('automation_rules')
          .selectAll()
          .where('id', '=', ruleId)
          .where('project_id', '=', projectId)
          .executeTakeFirst()
        if (!existing) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Rule not found' } })
        return res.json({ data: existing, error: null })
      }

      const rule = await db
        .updateTable('automation_rules')
        .set(updates)
        .where('id', '=', ruleId)
        .where('project_id', '=', projectId)
        .returningAll()
        .executeTakeFirst()

      if (!rule) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Rule not found' } })

      const updatedFields = parseRuleFields(rule)
      if (!updatedFields) return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })

      return res.json({
        data: { ...rule, ...updatedFields },
        error: null,
      })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  router.delete('/:ruleId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, ruleId } = req.params as { projectId: string; ruleId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      await db
        .deleteFrom('automation_rules')
        .where('id', '=', ruleId)
        .where('project_id', '=', projectId)
        .execute()

      return res.json({ data: { success: true }, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  return router
}

export function createAutomationLogsRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const logs = await db.selectFrom('automation_logs as l')
        .innerJoin('automation_rules as r', 'r.id', 'l.rule_id')
        .select(['l.id', 'l.rule_id', 'r.name as rule_name', 'l.triggered_at', 'l.success', 'l.detail'])
        .where('r.project_id', '=', projectId)
        .orderBy('l.triggered_at', 'desc')
        .limit(100)
        .execute()

      return res.json({ data: logs, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  return router
}
