import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../lib/logger';

const createTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().max(20).optional(),
});

const DEFAULT_COLORS = ['var(--blue)', 'var(--green)', 'var(--amber)', 'var(--red)', 'var(--purple)', 'var(--text2)'];

export function createContactTagsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
): ExpressRouter {
  const router = Router();

  // GET /api/contact-tags — list all tags for the workspace
  router.get('/', requirePermission('contacts:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const tags = await db
        .selectFrom('contact_tags')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .orderBy('name', 'asc')
        .execute();
      res.json({ data: tags, error: null });
    } catch (err) { next(err); }
  });

  // POST /api/contact-tags — create a tag (409 if name already exists, case-insensitive)
  router.post('/', requirePermission('contacts:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = createTagSchema.parse(req.body);
      const color = body.color ?? DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]!;

      const existing = await db
        .selectFrom('contact_tags')
        .select('id')
        .where('workspace_id', '=', workspace.id)
        .where(sql`lower(name)`, '=', body.name.toLowerCase())
        .executeTakeFirst();

      if (existing) {
        res.status(409).json({ data: null, error: { code: 'DUPLICATE_TAG', message: 'A tag with this name already exists.' } });
        return;
      }

      const tag = await db
        .insertInto('contact_tags')
        .values({ workspace_id: workspace.id, name: body.name, color })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: tag, error: null });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: err.errors[0]?.message ?? 'Invalid input' } });
        return;
      }
      next(err);
    }
  });

  // DELETE /api/contact-tags/:id — delete a tag (cascades link rows via FK)
  router.delete('/:id', requirePermission('contacts:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const deleted = await db
        .deleteFrom('contact_tags')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id'])
        .executeTakeFirst();

      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Tag not found' } });
        return;
      }

      logger.info({ tagId: deleted.id, workspaceId: workspace.id }, 'contact tag deleted');
      res.json({ data: { id: deleted.id }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
