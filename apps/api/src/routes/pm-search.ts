import { Router } from 'express'
import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'

export function createPmSearchRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true })

  // GET /api/pm/search?q=...
  router.get('/', async (req, res) => {
    const { workspace } = req as unknown as AuthenticatedRequest
    const { q } = req.query as { q?: string }

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: 'Query must be at least 2 characters' } })
    }

    try {
      const words = q.trim().split(/\s+/).filter(Boolean)
      const tsQuery = words.map(w => `${w}:*`).join(' & ')

      const tasks = await db.selectFrom('project_tasks as t')
        .innerJoin('projects as p', 'p.id', 't.project_id')
        .where('p.workspace_id', '=', workspace.id)
        .where('p.status', '!=', 'DELETED' as never)
        .where(sql`to_tsvector('english', t.title)`, '@@', sql`to_tsquery('english', ${tsQuery})`)
        .select(['t.id', 't.title', 't.project_id', 't.priority', 't.due_date'])
        .limit(10)
        .execute()

      const projects = await db.selectFrom('projects as p')
        .where('p.workspace_id', '=', workspace.id)
        .where('p.status', '!=', 'DELETED' as never)
        .where(sql`to_tsvector('english', p.name)`, '@@', sql`to_tsquery('english', ${tsQuery})`)
        .select(['p.id', 'p.name', 'p.color', 'p.status'])
        .limit(5)
        .execute()

      const docs = await db.selectFrom('project_docs as d')
        .innerJoin('projects as p', 'p.id', 'd.project_id')
        .where('p.workspace_id', '=', workspace.id)
        .where('p.status', '!=', 'DELETED' as never)
        .where(sql`to_tsvector('english', d.title)`, '@@', sql`to_tsquery('english', ${tsQuery})`)
        .select(['d.id', 'd.title', 'd.project_id', 'd.updated_at'])
        .limit(5)
        .execute()

      return res.json({ data: { tasks, projects, docs }, error: null })
    } catch {
      return res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal error' } })
    }
  })

  return router
}
