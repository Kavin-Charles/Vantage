import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'

const createFieldSchema = z.object({
  name: z.string().min(1).max(100),
  field_type: z.enum(['TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX', 'URL']),
  options: z.array(z.string()).optional(),
})

const upsertValueSchema = z.object({
  custom_field_id: z.string().uuid(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
})

async function verifyProjectAccess(db: Kysely<Database>, projectId: string, workspaceId: string) {
  return db.selectFrom('projects').select('id')
    .where('id', '=', projectId)
    .where('workspace_id', '=', workspaceId)
    .where('status', '!=', 'DELETED' as never)
    .executeTakeFirst()
}

export function createCustomFieldsRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const fields = await db.selectFrom('custom_fields')
        .selectAll()
        .where('project_id', '=', projectId)
        .orderBy('created_at', 'asc')
        .execute()

      return res.json({ data: fields, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  router.post('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId } = req.params as { projectId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const parsed = createFieldSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

      const count = await db.selectFrom('custom_fields')
        .select(db.fn.count<number>('id').as('n'))
        .where('project_id', '=', projectId)
        .executeTakeFirstOrThrow()

      if (Number(count.n) >= 20) {
        return res.status(400).json({ data: null, error: { code: 'LIMIT_REACHED', message: 'Maximum 20 custom fields per project' } })
      }

      const field = await db.insertInto('custom_fields')
        .values({
          project_id: projectId,
          name: parsed.data.name,
          field_type: parsed.data.field_type,
          options: parsed.data.options ? JSON.stringify(parsed.data.options) : null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      return res.status(201).json({ data: field, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  router.delete('/:fieldId', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, fieldId } = req.params as { projectId: string; fieldId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      await db.deleteFrom('custom_fields')
        .where('id', '=', fieldId)
        .where('project_id', '=', projectId)
        .execute()

      return res.json({ data: { success: true }, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  return router
}

export function createTaskFieldValuesRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, taskId } = req.params as { projectId: string; taskId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const values = await db.selectFrom('custom_field_values as v')
        .innerJoin('custom_fields as f', 'f.id', 'v.custom_field_id')
        .select(['v.task_id', 'v.custom_field_id', 'v.value', 'f.name', 'f.field_type'])
        .where('v.task_id', '=', taskId)
        .execute()

      return res.json({ data: values, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  router.post('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { projectId, taskId } = req.params as { projectId: string; taskId: string }
    try {
      const project = await verifyProjectAccess(db, projectId, workspace.id)
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const parsed = upsertValueSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

      const strValue = parsed.data.value === null ? null : String(parsed.data.value)

      const row = await db.insertInto('custom_field_values')
        .values({ task_id: taskId, custom_field_id: parsed.data.custom_field_id, value: strValue })
        .onConflict(oc => oc.columns(['task_id', 'custom_field_id']).doUpdateSet({ value: strValue }))
        .returningAll()
        .executeTakeFirstOrThrow()

      return res.status(201).json({ data: row, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
  })

  return router
}
