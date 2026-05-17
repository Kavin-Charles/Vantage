// apps/api/src/routes/v1/contacts.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { requireScope } from '../../middleware/api-key-auth';
import { logger } from '../../lib/logger';
import { queueWebhook } from '../../lib/queue-webhook';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['prospect', 'customer', 'cold', 'churned']).optional(),
  owner_id: z.string().uuid().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  status: z.enum(['prospect', 'customer', 'cold', 'churned']).default('prospect'),
  company_id: z.string().uuid().optional(),
  owner_id: z.string().uuid(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  status: z.enum(['prospect', 'customer', 'cold', 'churned']).optional(),
  company_id: z.string().uuid().nullable().optional(),
});

export function createV1ContactsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /v1/contacts
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, status, owner_id } = parsed.data;

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

  // GET /v1/contacts/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
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

  // POST /v1/contacts [read_write]
  router.post('/', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      // Validate owner_id belongs to workspace
      const owner = await db
        .selectFrom('users')
        .where('id', '=', parsed.data.owner_id)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!owner) {
        res.status(400).json({ data: null, error: { code: 'INVALID_OWNER', message: 'owner_id not found in workspace' } });
        return;
      }

      const contact = await db
        .insertInto('contacts')
        .values({ ...parsed.data, workspace_id: workspace.id })
        .returningAll()
        .executeTakeFirstOrThrow();

      await db
        .updateTable('workspaces')
        .set({ contact_count: sql`contact_count + 1` })
        .where('id', '=', workspace.id)
        .execute();

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

  // PATCH /v1/contacts/:id [read_write]
  router.patch('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      const contact = await db
        .updateTable('contacts')
        .set({ ...parsed.data, updated_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }

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

  // DELETE /v1/contacts/:id [read_write]
  router.delete('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
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

      await db
        .updateTable('workspaces')
        .set({ contact_count: sql`contact_count - 1` })
        .where('id', '=', workspace.id)
        .execute();

      res.json({ data: { id: contact.id }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
