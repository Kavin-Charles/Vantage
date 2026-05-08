import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createSchema = z.object({
  name: z.string().min(1),
  engine: z.enum(['postgres', 'mysql', 'redis', 'clickhouse', 'mongo', 'other']),
  host: z.string().optional(),
  port: z.number().int().optional(),
  version: z.string().optional(),
});

const updateSchema = createSchema.partial();

export function createInfraDatabasesRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const dbs = await db
        .selectFrom('infra_databases')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .execute();
      res.json({ data: dbs, total: dbs.length, error: null });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = createSchema.parse(req.body);
      const result = await db
        .insertInto('infra_databases')
        .values({ workspace_id: workspace.id, ...body, status: 'offline' })
        .returningAll()
        .executeTakeFirstOrThrow();
      res.status(201).json({ data: result, error: null });
    } catch (err) { next(err); }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = updateSchema.parse(req.body);
      const result = await db
        .updateTable('infra_databases')
        .set({ ...body, updated_at: new Date().toISOString() })
        .where('id', '=', req.params['id'] as string)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!result) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      res.json({ data: result, error: null });
    } catch (err) { next(err); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const deleted = await db
        .deleteFrom('infra_databases')
        .where('id', '=', req.params['id'] as string)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!deleted) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
