import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { csvEscape, toCSV } from '../lib/csv';

const createCompanySchema = z.object({
  name: z.string().min(1),
  industry: z.string().optional(),
  location: z.string().optional(),
  employee_count: z.number().int().positive().optional(),
  website: z.preprocess(
    v => (v === '' ? undefined : v),
    z.string().url().optional(),
  ),
});

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  industry: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  employee_count: z.number().int().positive().nullable().optional(),
  website: z.preprocess(
    v => (v === '' ? null : v),
    z.string().url().nullable().optional(),
  ),
});


const COMPANY_HEADERS = ['name', 'industry', 'location', 'employee_count', 'website'];

const importCompanySchema = z.object({
  rows: z.array(z.object({
    name: z.string().min(1),
    industry: z.string().optional(),
    location: z.string().optional(),
    employee_count: z.coerce.number().int().positive().optional(),
    website: z.string().optional(),
  })).min(1),
});

export function createCompaniesRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router();

  router.get('/export', requirePermission('companies:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const companies = await db
        .selectFrom('companies')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .select(['name', 'industry', 'location', 'employee_count', 'website'])
        .orderBy('created_at', 'desc')
        .execute();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="companies.csv"');
      res.send(toCSV(COMPANY_HEADERS, companies));
    } catch (err) { next(err); }
  });

  router.post('/import', requirePermission('companies:create'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { rows } = importCompanySchema.parse(req.body);
      let created = 0;
      const errors: string[] = [];
      for (const row of rows) {
        try {
          await db.insertInto('companies')
            .values({ ...row, workspace_id: workspace.id })
            .execute();
          created++;
        } catch (e) {
          errors.push(`${row.name}: ${(e as Error).message}`);
        }
      }
      res.json({ data: { created, errors }, error: null });
    } catch (err) { next(err); }
  });

  router.get('/', requirePermission('companies:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const page = Number(req.query['page'] ?? 1);
      const per_page = Math.min(Number(req.query['per_page'] ?? 25), 100);
      const search = req.query['search'] as string | undefined;

      let query = db
        .selectFrom('companies')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (search) query = query.where('name', 'ilike', `%${search}%`);

      const companies = await query.execute();

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

  router.get('/:id', requirePermission('companies:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
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

  router.post('/', requirePermission('companies:create'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = createCompanySchema.parse(req.body);

      const company = await db
        .insertInto('companies')
        .values({ ...body, workspace_id: workspace.id })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: company, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', requirePermission('companies:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = updateCompanySchema.parse(req.body);

      const company = await db
        .updateTable('companies')
        .set({ ...body, updated_at: new Date() })
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

import { bridgeRegistry } from '@vencore/plugin-runtime';

export function registerCompaniesBridgeMethods(): void {
  bridgeRegistry
    .register('companies.list', 'companies:read', async (ctx, p, db) => {
      const filter = (p.filter ?? {}) as Record<string, unknown>;
      let q = db.selectFrom('companies').selectAll()
        .where('workspace_id', '=', ctx.workspaceId)
        .where('deleted_at', 'is', null);
      if (filter.limit) q = q.limit(Number(filter.limit));
      if (filter.offset) q = q.offset(Number(filter.offset));
      return q.execute();
    })
    .register('companies.get', 'companies:read', async (ctx, p, db) => {
      const row = await db.selectFrom('companies').selectAll()
        .where('workspace_id', '=', ctx.workspaceId)
        .where('id', '=', p.id as string)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!row) throw { code: 'NOT_FOUND', message: 'Company not found' };
      return row;
    })
    .register('companies.create', 'companies:write', async (ctx, p, db) => {
      const data = p.data as Record<string, unknown>;
      const [row] = await db.insertInto('companies')
        .values({ ...data, workspace_id: ctx.workspaceId } as any)
        .returningAll().execute();
      return row;
    })
    .register('companies.update', 'companies:write', async (ctx, p, db) => {
      const data = p.data as Record<string, unknown>;
      const [row] = await db.updateTable('companies')
        .set({ ...data, updated_at: new Date() } as any)
        .where('workspace_id', '=', ctx.workspaceId)
        .where('id', '=', p.id as string)
        .returningAll().execute();
      if (!row) throw { code: 'NOT_FOUND', message: 'Company not found' };
      return row;
    })
    .register('companies.delete', 'companies:write', async (ctx, p, db) => {
      await db.deleteFrom('companies')
        .where('workspace_id', '=', ctx.workspaceId)
        .where('id', '=', p.id as string)
        .execute();
      return null;
    });
}
