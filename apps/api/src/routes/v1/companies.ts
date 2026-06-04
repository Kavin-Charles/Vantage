import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { requireScope } from '../../middleware/api-key-auth';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});

const createSchema = z.object({
  name: z.string().min(1),
  industry: z.string().optional(),
  location: z.string().optional(),
  employee_count: z.number().int().min(0).optional(),
  website: z.string().url().optional(),
});

const updateSchema = createSchema.partial();

export function createV1CompaniesRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /v1/companies
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page } = parsed.data;

      const companies = await db
        .selectFrom('companies')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page)
        .execute();

      const { count } = await db
        .selectFrom('companies')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

      res.json({ data: companies, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/companies/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const company = await db
        .selectFrom('companies')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .executeTakeFirst();

      if (!company) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Company not found' } });
        return;
      }
      res.json({ data: company, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /v1/companies [read_write]
  router.post('/', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      const company = await db
        .insertInto('companies')
        .values({ ...parsed.data, workspace_id: workspace.id })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: company, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /v1/companies/:id [read_write]
  router.patch('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      const company = await db
        .updateTable('companies')
        .set({ ...parsed.data, updated_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      if (!company) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Company not found' } });
        return;
      }
      res.json({ data: company, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
