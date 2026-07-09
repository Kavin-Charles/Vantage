import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { csvEscape, toCSV } from '../lib/csv';
import { logActivity } from '../lib/log-activity';
import { logger } from '../lib/logger';
import { queueWebhook } from '../lib/queue-webhook';

const contactStatusEnum = z.enum(['prospect', 'customer', 'cold', 'churned']);

const createContactSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional(),
  status: contactStatusEnum.default('prospect'),
  company_id: z.string().uuid().optional(),
});

const updateContactSchema = createContactSchema.partial();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  status: contactStatusEnum.optional(),
  owner_id: z.string().uuid().optional(),
  tag_id: z.string().uuid().optional(),
  q: z.string().max(200).optional(),
  sort: z.enum(['name', 'created_at', 'last_contacted_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const attachTagSchema = z.object({ tag_id: z.string().uuid() });

/** Fetch tags for a set of contact ids in one query and group them by contact_id. */
async function tagsByContactId(
  db: Kysely<Database>,
  workspaceId: string,
  contactIds: string[],
): Promise<Map<string, { id: string; name: string; color: string }[]>> {
  const map = new Map<string, { id: string; name: string; color: string }[]>();
  if (contactIds.length === 0) return map;

  const rows = await db
    .selectFrom('contact_tag_links')
    .innerJoin('contact_tags', 'contact_tags.id', 'contact_tag_links.tag_id')
    .where('contact_tags.workspace_id', '=', workspaceId)
    .where('contact_tag_links.contact_id', 'in', contactIds)
    .select(['contact_tag_links.contact_id', 'contact_tags.id', 'contact_tags.name', 'contact_tags.color'])
    .execute();

  for (const row of rows) {
    const list = map.get(row.contact_id) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    map.set(row.contact_id, list);
  }
  return map;
}

const CONTACT_HEADERS = ['name', 'email', 'phone', 'status'];
const IMPORT_MAX_ROWS = 1000;

const importRowSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional(),
  status: contactStatusEnum.default('prospect'),
});

type ValidRow = z.infer<typeof importRowSchema>;

async function validateCompanyScope(
  db: Kysely<Database>,
  companyId: string,
  workspaceId: string,
): Promise<boolean> {
  const company = await db
    .selectFrom('companies')
    .where('id', '=', companyId)
    .where('workspace_id', '=', workspaceId)
    .where('deleted_at', 'is', null)
    .select('id')
    .executeTakeFirst();
  return !!company;
}

export function createContactsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
): ExpressRouter {
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
    } catch (err) {
      next(err);
    }
  });

  // POST /import — bulk create from parsed CSV rows
  router.post('/import', requirePermission('contacts:create'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;

      const outerParsed = z
        .object({ rows: z.array(z.unknown()).min(1).max(IMPORT_MAX_ROWS) })
        .safeParse(req.body);
      if (!outerParsed.success) {
        res
          .status(400)
          .json({ data: null, error: { code: 'INVALID_INPUT', message: outerParsed.error.message } });
        return;
      }

      const validRows: ValidRow[] = [];
      const errors: string[] = [];

      for (const raw of outerParsed.data.rows) {
        const parsed = importRowSchema.safeParse(raw);
        if (parsed.success) {
          validRows.push(parsed.data);
        } else {
          const email = (raw as { email?: string }).email ?? '(unknown)';
          errors.push(`${email}: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
        }
      }

      let created = 0;

      if (validRows.length > 0) {
        // Dedupe against existing emails in this workspace
        const existingEmails = await db
          .selectFrom('contacts')
          .where('workspace_id', '=', workspace.id)
          .where('deleted_at', 'is', null)
          .select('email')
          .execute();
        const existingSet = new Set(existingEmails.map(r => r.email.toLowerCase()));

        const newRows = validRows.filter(r => {
          if (existingSet.has(r.email.toLowerCase())) {
            errors.push(`${r.email}: already exists`);
            return false;
          }
          return true;
        });

        if (newRows.length > 0) {
          // Atomic: insert + count update in one transaction
          await db.transaction().execute(async trx => {
            const result = await trx
              .insertInto('contacts')
              .values(
                newRows.map(row => ({
                  name: row.name,
                  email: row.email,
                  phone: row.phone ?? null,
                  status: row.status,
                  workspace_id: workspace.id,
                  owner_id: user.id,
                })),
              )
              .execute();
            created = result[0]?.numInsertedOrUpdatedRows
              ? Number(result[0].numInsertedOrUpdatedRows)
              : newRows.length;

            if (created > 0) {
              await trx
                .updateTable('workspaces')
                .set({ contact_count: sql`contact_count + ${created}` })
                .where('id', '=', workspace.id)
                .execute();
            }
          });
        }
      }

      logger.info({ workspace_id: workspace.id, created, errors: errors.length }, 'contacts.import');
      res.json({ data: { created, errors }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET / — list contacts with search, filter, sort, pagination
  router.get('/', requirePermission('contacts:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res
          .status(400)
          .json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, status, owner_id, tag_id, q, sort, order } = parsed.data;

      const base = db
        .selectFrom('contacts')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null);

      const applyFilters = <T extends typeof base>(qb: T) => {
        let q2 = qb;
        if (status) q2 = q2.where('status', '=', status) as T;
        if (owner_id) q2 = q2.where('owner_id', '=', owner_id) as T;
        if (tag_id) {
          q2 = q2.where('id', 'in',
            db.selectFrom('contact_tag_links').select('contact_id').where('tag_id', '=', tag_id),
          ) as T;
        }
        if (q) {
          const pattern = `%${q}%`;
          q2 = q2.where(eb =>
            eb.or([eb('name', 'ilike', pattern), eb('email', 'ilike', pattern)]),
          ) as T;
        }
        return q2;
      };

      const contacts = await applyFilters(base.selectAll())
        .orderBy(sort, order)
        .limit(per_page)
        .offset((page - 1) * per_page)
        .execute();

      const { count } = await applyFilters(
        base.select(db.fn.countAll<number>().as('count')),
      ).executeTakeFirstOrThrow();

      const tagMap = await tagsByContactId(db, workspace.id, contacts.map(c => c.id));
      const withTags = contacts.map(c => ({ ...c, tags: tagMap.get(c.id) ?? [] }));

      res.json({ data: withTags, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /:id — single contact
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
      const tagMap = await tagsByContactId(db, workspace.id, [contact.id]);
      res.json({ data: { ...contact, tags: tagMap.get(contact.id) ?? [] }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /:id/tags — attach a tag to a contact
  router.post('/:id/tags', requirePermission('contacts:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = attachTagSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const contactId = req.params['id']!;

      const [contact, tag] = await Promise.all([
        db.selectFrom('contacts').select('id').where('id', '=', contactId).where('workspace_id', '=', workspace.id).where('deleted_at', 'is', null).executeTakeFirst(),
        db.selectFrom('contact_tags').select('id').where('id', '=', parsed.data.tag_id).where('workspace_id', '=', workspace.id).executeTakeFirst(),
      ]);
      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }
      if (!tag) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Tag not found' } });
        return;
      }

      await db
        .insertInto('contact_tag_links')
        .values({ contact_id: contactId, tag_id: parsed.data.tag_id })
        .onConflict(oc => oc.columns(['contact_id', 'tag_id']).doNothing())
        .execute();

      res.status(201).json({ data: { id: contactId }, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /:id/tags/:tagId — detach a tag from a contact
  router.delete('/:id/tags/:tagId', requirePermission('contacts:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const contactId = req.params['id']!;
      const tagId = req.params['tagId']!;

      const contact = await db
        .selectFrom('contacts')
        .select('id')
        .where('id', '=', contactId)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }

      await db
        .deleteFrom('contact_tag_links')
        .where('contact_id', '=', contactId)
        .where('tag_id', '=', tagId)
        .execute();

      res.json({ data: { id: contactId }, error: null });
    } catch (err) { next(err); }
  });

  // POST / — create contact
  router.post('/', requirePermission('contacts:create'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const parsed = createContactSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const body = parsed.data;

      // Validate company_id belongs to this workspace
      if (body.company_id) {
        const valid = await validateCompanyScope(db, body.company_id, workspace.id);
        if (!valid) {
          res.status(400).json({ data: null, error: { code: 'INVALID_COMPANY', message: 'company_id not found in workspace' } });
          return;
        }
      }

      // Check for duplicate email
      const dupe = await db
        .selectFrom('contacts')
        .where('workspace_id', '=', workspace.id)
        .where(eb => eb(eb.fn('lower', ['email']), '=', body.email.toLowerCase()))
        .where('deleted_at', 'is', null)
        .select('id')
        .executeTakeFirst();
      if (dupe) {
        res.status(409).json({ data: null, error: { code: 'DUPLICATE_EMAIL', message: 'A contact with this email already exists' } });
        return;
      }

      // Atomic: insert + count update
      const contact = await db.transaction().execute(async trx => {
        const row = await trx
          .insertInto('contacts')
          .values({ ...body, workspace_id: workspace.id, owner_id: user.id })
          .returningAll()
          .executeTakeFirstOrThrow();

        await trx
          .updateTable('workspaces')
          .set({ contact_count: sql`contact_count + 1` })
          .where('id', '=', workspace.id)
          .execute();

        return row;
      });

      logger.info({ workspace_id: workspace.id, contact_id: contact.id }, 'contacts.create');

      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'contact_created',
        source_module_id: 'contacts',
        body: `Contact ${contact.name} created`,
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

  // PATCH /:id — update contact
  router.patch('/:id', requirePermission('contacts:edit'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const parsed = updateContactSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const body = parsed.data;

      // Validate company_id belongs to this workspace
      if (body.company_id) {
        const valid = await validateCompanyScope(db, body.company_id, workspace.id);
        if (!valid) {
          res.status(400).json({ data: null, error: { code: 'INVALID_COMPANY', message: 'company_id not found in workspace' } });
          return;
        }
      }

      // Check email uniqueness if email is being changed
      if (body.email) {
        const dupe = await db
          .selectFrom('contacts')
          .where('workspace_id', '=', workspace.id)
          .where(eb => eb(eb.fn('lower', ['email']), '=', body.email!.toLowerCase()))
          .where('id', '!=', req.params['id']!)
          .where('deleted_at', 'is', null)
          .select('id')
          .executeTakeFirst();
        if (dupe) {
          res.status(409).json({ data: null, error: { code: 'DUPLICATE_EMAIL', message: 'A contact with this email already exists' } });
          return;
        }
      }

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

      logger.info({ workspace_id: workspace.id, contact_id: contact.id }, 'contacts.update');

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

  // DELETE /:id — soft delete
  router.delete('/:id', requirePermission('contacts:delete'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      // Atomic: soft-delete + count decrement
      const contact = await db.transaction().execute(async trx => {
        const row = await trx
          .updateTable('contacts')
          .set({ deleted_at: new Date() })
          .where('id', '=', req.params['id']!)
          .where('workspace_id', '=', workspace.id)
          .where('deleted_at', 'is', null)
          .returningAll()
          .executeTakeFirst();

        if (row) {
          await trx
            .updateTable('workspaces')
            .set({ contact_count: sql`GREATEST(contact_count - 1, 0)` })
            .where('id', '=', workspace.id)
            .execute();
        }

        return row;
      });

      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }

      logger.info({ workspace_id: workspace.id, contact_id: contact.id }, 'contacts.delete');
      res.json({ data: { success: true }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

import { bridgeRegistry } from '@vencore/plugin-runtime';

const bridgeCreateSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional(),
  status: z.enum(['prospect', 'customer', 'cold', 'churned']).default('prospect'),
  company_id: z.string().uuid().optional(),
  owner_id: z.string().uuid(),
});

const bridgeUpdateSchema = bridgeCreateSchema.omit({ owner_id: true }).partial();

export function registerContactsBridgeMethods(): void {
  bridgeRegistry
    .register('contacts.list', 'contacts:read', async (ctx, p, db) => {
      const filter = (p.filter ?? {}) as Record<string, unknown>;
      let q = db
        .selectFrom('contacts')
        .selectAll()
        .where('workspace_id', '=', ctx.workspaceId)
        .where('deleted_at', 'is', null);
      if (filter.status) q = q.where('status', '=', filter.status as string);
      if (filter.company_id) q = q.where('company_id', '=', filter.company_id as string);
      if (filter.limit) q = q.limit(Number(filter.limit));
      if (filter.offset) q = q.offset(Number(filter.offset));
      return q.execute();
    })
    .register('contacts.get', 'contacts:read', async (ctx, p, db) => {
      const row = await db
        .selectFrom('contacts')
        .selectAll()
        .where('workspace_id', '=', ctx.workspaceId)
        .where('id', '=', p.id as string)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!row) throw { code: 'NOT_FOUND', message: 'Contact not found' };
      return row;
    })
    .register('contacts.create', 'contacts:write', async (ctx, p, db) => {
      const parsed = bridgeCreateSchema.safeParse(p.data);
      if (!parsed.success) throw { code: 'INVALID_INPUT', message: parsed.error.message };

      return db.transaction().execute(async trx => {
        const row = await trx
          .insertInto('contacts')
          .values({ ...parsed.data, workspace_id: ctx.workspaceId })
          .returningAll()
          .executeTakeFirstOrThrow();

        await trx
          .updateTable('workspaces')
          .set({ contact_count: sql`contact_count + 1` })
          .where('id', '=', ctx.workspaceId)
          .execute();

        return row;
      });
    })
    .register('contacts.update', 'contacts:write', async (ctx, p, db) => {
      const parsed = bridgeUpdateSchema.safeParse(p.data);
      if (!parsed.success) throw { code: 'INVALID_INPUT', message: parsed.error.message };

      const row = await db
        .updateTable('contacts')
        .set({ ...parsed.data, updated_at: new Date() })
        .where('workspace_id', '=', ctx.workspaceId)
        .where('id', '=', p.id as string)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();
      if (!row) throw { code: 'NOT_FOUND', message: 'Contact not found' };
      return row;
    })
    .register('contacts.delete', 'contacts:write', async (ctx, p, db) => {
      await db.transaction().execute(async trx => {
        const row = await trx
          .updateTable('contacts')
          .set({ deleted_at: new Date() })
          .where('workspace_id', '=', ctx.workspaceId)
          .where('id', '=', p.id as string)
          .where('deleted_at', 'is', null)
          .returningAll()
          .executeTakeFirst();

        if (row) {
          await trx
            .updateTable('workspaces')
            .set({ contact_count: sql`GREATEST(contact_count - 1, 0)` })
            .where('id', '=', ctx.workspaceId)
            .execute();
        }
      });
      return null;
    });
}
