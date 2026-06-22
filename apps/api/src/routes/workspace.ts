import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const patchWorkspaceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  domain: z.string().min(1).max(255).nullable().optional(),
});

export function createWorkspaceRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // PATCH /api/workspace — update name/domain (mounted with requireAdmin)
  router.patch('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = patchWorkspaceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'Invalid name or domain.' } });
        return;
      }
      if (Object.keys(parsed.data).length === 0) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'No fields to update.' } });
        return;
      }

      const updated = await db
        .updateTable('workspaces')
        .set(parsed.data)
        .where('id', '=', workspace.id)
        .returning(['id', 'name', 'domain'])
        .executeTakeFirstOrThrow();

      res.json({ data: updated, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
