import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { csvEscape, toCSV } from '../lib/csv';
import { logActivity } from '../lib/log-activity';
import { logger } from '../lib/logger';
import { queueWebhook } from '../lib/queue-webhook';

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
  q: z.string().optional(),
});


const CONTACT_HEADERS = ['name', 'email', 'phone', 'status'];

const importContactSchema = z.object({
  rows: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    status: z.enum(['prospect', 'customer', 'cold', 'churned']).default('prospect'),
  })).min(1),
});

export function createContactsRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router();

  // GET /export — CSV download
  router.get('/export', requirePermission('contacts:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const contacts = await db
        .selectFrom('contacts')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .select(['name', 'email', 'phone', 'status'])
        .orderBy('created_at', 'desc')
        .execute();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
      res.send(toCSV(CONTACT_HEADERS, contacts));
    } catch (err) { next(err); }
  });

  // POST /import — bulk create from parsed CSV rows
  router.post('/import', requirePermission('contacts:create'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;

      const outerParsed = z.object({ rows: z.array(z.unknown()).min(1) }).safeParse(req.body);
      if (!outerParsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: outerParsed.error.message } });
        return;
      }

      const rowSchema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        status: z.enum(['prospect', 'customer', 'cold', 'churned']).default('prospect'),
      });

      type ValidRow = { name: string; email: string; phone?: string; status: 'prospect' | 'customer' | 'cold' | 'churned' };
      const validRows: ValidRow[] = [];
      const errors: string[] = [];

      for (const raw of outerParsed.data.rows) {
        const parsed = rowSchema.safeParse(raw);
        if (parsed.success) {
          validRows.push(parsed.data);
        } else {
          const email = (raw as { email?: string }).email ?? '(unknown)';
          errors.push(`${email}: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
        }
      }

      let created = 0;
      if (validRows.length > 0) {
        const result = await db
          .insertInto('contacts')
          .values(validRows.map(row => ({
            name: row.name,
            email: row.email,
            phone: row.phone ?? null,
            status: row.status,
            workspace_id: workspace.id,
            owner_id: user.id,
          })))
          .execute();
        created = result[0]?.numInsertedOrUpdatedRows ? Number(result[0].numInsertedOrUpdatedRows) : validRows.length;

        if (created > 0) {
          await db.updateTable('workspaces')
            .set({ contact_count: sql`contact_count + ${created}` })
            .where('id', '=', workspace.id).execute();
        }
      }

      res.json({ data: { created, errors }, error: null });
    } catch (err) { next(err); }
  });

  router.get('/', requirePermission('contacts:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { page, per_page, status, owner_id, q } = listQuerySchema.parse(req.query);

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

      if (q) {
        const pattern = `%${q}%`;
        query = query.where(eb =>
          eb.or([
            eb('name', 'ilike', pattern),
            eb('email', 'ilike', pattern),
          ]),
        );
      }

      const contacts = await query.execute();

      let countQuery = db
        .selectFrom('contacts')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .select(db.fn.countAll<number>().as('count'));

      if (status) countQuery = countQuery.where('status', '=', status);
      if (owner_id) countQuery = countQuery.where('owner_id', '=', owner_id);

      if (q) {
        const pattern = `%${q}%`;
        countQuery = countQuery.where(eb =>
          eb.or([
            eb('name', 'ilike', pattern),
            eb('email', 'ilike', pattern),
          ]),
        );
      }

      const { count } = await countQuery.executeTakeFirstOrThrow();

      res.json({ data: contacts, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', requirePermission('contacts:view'), async (req, res, next) => {
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

  router.post('/', requirePermission('contacts:create'), async (req, res, next) => {
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

      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'note',
        body: `Created contact ${contact.name}`,
        contact_id: contact.id,
      });

      queueWebhook(db, workspace.id, 'contact.created', {
        contact_id: contact.id,
        name: contact.name,
        email: contact.email,
        status: contact.status,
        workspace_id: workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

      res.status(201).json({ data: contact, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', requirePermission('contacts:edit'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
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

      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'note',
        body: `Updated contact ${contact.name}`,
        contact_id: contact.id,
      });

      queueWebhook(db, workspace.id, 'contact.updated', {
        contact_id: contact.id,
        name: contact.name,
        email: contact.email,
        status: contact.status,
        workspace_id: workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

      res.json({ data: contact, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requirePermission('contacts:delete'), async (req, res, next) => {
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
