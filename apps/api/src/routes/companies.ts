import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createCompanySchema = z.object({
  name: z.string().min(1),
  industry: z.string().optional(),
  location: z.string().optional(),
  employee_count: z.number().int().positive().optional(),
  website: z.string().url().optional(),
});

const updateCompanySchema = createCompanySchema.partial();

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCSV(headers: string[], rows: Record<string, unknown>[]): string {
  return [headers.join(','), ...rows.map(r => headers.map(h => csvEscape(r[h])).join(','))].join('\n');
}

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

export function createCompaniesRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/export', async (req, res, next) => {
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

  router.post('/import', async (req, res, next) => {
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

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const page = Number(req.query['page'] ?? 1);
      const per_page = Math.min(Number(req.query['per_page'] ?? 25), 100);

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

  router.get('/:id', async (req, res, next) => {
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

  router.post('/', async (req, res, next) => {
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

  router.patch('/:id', async (req, res, next) => {
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
