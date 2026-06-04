// apps/api/src/routes/workspace-modules.ts
import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { MODULE_IDS } from '../modules/registry';
import { invalidateModuleCache } from '../middleware/module';

const patchSchema = z.object({
  enabled: z.boolean(),
});

export function createWorkspaceModulesRouter(db: Kysely<Database>): Router {
  const router = Router();

  // GET /api/workspace/modules — list all modules with enabled status
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const rows = await db
        .selectFrom('workspace_modules')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .execute();
      res.json({ data: rows, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/workspace/modules/:moduleId — toggle (admin only)
  router.patch('/:moduleId', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;

      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }

      const { moduleId } = req.params;
      if (!MODULE_IDS.includes(moduleId)) {
        res.status(400).json({
          data: null,
          error: { code: 'INVALID_MODULE', message: `Unknown module: ${moduleId}` },
        });
        return;
      }

      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_BODY' } });
        return;
      }

      const result = await db
        .updateTable('workspace_modules')
        .set({
          enabled: parsed.data.enabled,
          updated_at: new Date(),
          updated_by: user.id,
        })
        .where('workspace_id', '=', workspace.id)
        .where('module_id', '=', moduleId)
        .executeTakeFirst();

      if (result.numUpdatedRows === BigInt(0)) {
        res.status(404).json({
          data: null,
          error: { code: 'MODULE_NOT_FOUND', message: `Module ${moduleId} not found for this workspace.` },
        });
        return;
      }

      // Invalidate cache so next request re-reads from DB
      invalidateModuleCache(workspace.id, moduleId);

      res.json({ data: { module_id: moduleId, enabled: parsed.data.enabled }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
