import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  status: z.enum(['prospect', 'customer', 'cold', 'churned']).default('prospect'),
  company_id: z.string().uuid().optional(),
});

const updateContactSchema = createContactSchema.partial();

const listQuerySchema = z.object({
  page: z.coerce.number().default(1),
  per_page: z.coerce.number().max(100).default(25),
  status: z.enum(['prospect', 'customer', 'cold', 'churned']).optional(),
  owner_id: z.string().uuid().optional(),
});

export function createContactsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { page, per_page, status, owner_id } = listQuerySchema.parse(req.query);

      let query = db
        .selectFrom('contacts')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (status) query = query.where('status', '=', status);
      if (owner_id) query = query.where('owner_id', '=', owner_id);

      const contacts = await query.execute();

      let countQuery = db
        .selectFrom('contacts')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .select(db.fn.countAll<number>().as('count'));

      if (status) countQuery = countQuery.where('status', '=', status);
      if (owner_id) countQuery = countQuery.where('owner_id', '=', owner_id);

      const { count } = await countQuery.executeTakeFirstOrThrow();

      res.json({ data: contacts, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const contact = await db
        .selectFrom('contacts')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .selectAll()
        .executeTakeFirst();

      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }
      res.json({ data: contact, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const body = createContactSchema.parse(req.body);

      const contact = await db
        .insertInto('contacts')
        .values({ ...body, workspace_id: workspace.id, owner_id: user.id })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Update workspace contact count
      await db
        .updateTable('workspaces')
        .set({ contact_count: sql`contact_count + 1` })
        .where('id', '=', workspace.id)
        .execute();

      res.status(201).json({ data: contact, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = updateContactSchema.parse(req.body);

      const contact = await db
        .updateTable('contacts')
        .set({ ...body, updated_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }
      res.json({ data: contact, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const contact = await db
        .updateTable('contacts')
        .set({ deleted_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }

      // Decrement contact count
      await db
        .updateTable('workspaces')
        .set({ contact_count: sql`contact_count - 1` })
        .where('id', '=', workspace.id)
        .execute();

      res.json({ data: { success: true }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
