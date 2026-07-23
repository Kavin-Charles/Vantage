import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { csvEscape, toCSV } from '../lib/csv';
import { emitCrmEvent } from '../lib/crm-events';
import { sizeBand } from '../lib/company-size';

const companyStatusEnum = z.enum(['active', 'prospect', 'churned']);

const createCompanySchema = z.object({
  name: z.string().min(1),
  industry: z.string().optional(),
  location: z.string().optional(),
  employee_count: z.number().int().positive().optional(),
  website: z.preprocess(
    v => (v === '' ? undefined : v),
    z.string().url().optional(),
  ),
  status: companyStatusEnum.default('active'),
  annual_revenue: z.coerce.number().min(0).optional(),
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
  status: companyStatusEnum.optional(),
  annual_revenue: z.coerce.number().min(0).nullable().optional(),
});

const companyViewEnum = z.enum(['all', 'active', 'enterprise', 'startup', 'partner']);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(200).optional(),
  view: companyViewEnum.default('all'),
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
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res
          .status(400)
          .json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, search, view } = parsed.data;

      const base = db
        .selectFrom('companies')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null);

      const applyFilters = <T extends typeof base>(qb: T) => {
        let q2 = qb;
        if (search) q2 = q2.where('name', 'ilike', `%${search}%`) as T;
        if (view === 'enterprise') q2 = q2.where('employee_count', '>=', 1000) as T;
        if (view === 'startup') q2 = q2.where('employee_count', '<', 20) as T;
        if (view === 'active') q2 = q2.where('status', '=', 'active') as T;
        // 'partner' has no dedicated flag on companies yet — placeholder until one exists.
        if (view === 'partner') q2 = q2.where('status', '=', 'active') as T;
        return q2;
      };

      const companies = await applyFilters(base.selectAll())
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page)
        .execute();

      const { count } = await applyFilters(
        base.select(db.fn.countAll<number>().as('count')),
      ).executeTakeFirstOrThrow();

      const withSizeBand = companies.map(c => ({ ...c, size_band: sizeBand(c.employee_count) }));

      res.json({ data: withSizeBand, total: Number(count), page, per_page, error: null });
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

      emitCrmEvent(db, workspace.id, 'crm.company@v1', 'created', company.id);
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
      emitCrmEvent(db, workspace.id, 'crm.company@v1', 'updated', company.id);
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
