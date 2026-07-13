// apps/api/src/routes/workspace-modules.ts
import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { MODULE_IDS } from '../modules/registry';
import { CRM_SUBMODULE_IDS } from '@vencore/modules';
import { invalidateModuleCache } from '../middleware/module';

// Built-in modules that act as hook providers when enabled
const MODULE_PROVIDER_MAP: Record<string, { providerId: string; name: string } | null> = {
  'crm':        { providerId: 'vencore-crm',       name: 'Vencore CRM' },
  'messaging':  { providerId: 'vencore-messaging', name: 'Vencore Messaging' },
  'servers':    { providerId: 'vencore-infra',     name: 'Vencore Infra' },
  'databases':  { providerId: 'vencore-infra',     name: 'Vencore Infra' },
  'analytics':  null,
  'activity':   null,
  'websites':   null,
  'dashboard':  null,
  'projects':   null,
  'alerts':     null,
};

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
      if (!MODULE_IDS.includes(moduleId) && !CRM_SUBMODULE_IDS.includes(moduleId)) {
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

      // Upsert: CRM child rows (crm:*) may not exist yet for legacy workspaces,
      // and toggling one must create it rather than 404.
      await db
        .insertInto('workspace_modules')
        .values({
          workspace_id: workspace.id,
          module_id: moduleId,
          enabled: parsed.data.enabled,
          updated_by: user.id,
        })
        .onConflict(oc =>
          oc.columns(['workspace_id', 'module_id']).doUpdateSet({
            enabled: parsed.data.enabled,
            updated_at: new Date(),
            updated_by: user.id,
          }),
        )
        .execute();

      // Invalidate cache so next request re-reads from DB
      invalidateModuleCache(workspace.id, moduleId);

      // Register/deregister as a hook provider if this module supplies one
      const providerDef = MODULE_PROVIDER_MAP[moduleId];
      if (providerDef) {
        if (parsed.data.enabled) {
          await db
            .insertInto('hook_providers')
            .values({
              workspace_id: workspace.id,
              provider_id: providerDef.providerId,
              name: providerDef.name,
              source: 'builtin',
              enabled: true,
            })
            .onConflict(oc =>
              oc.columns(['workspace_id', 'provider_id']).doUpdateSet({
                enabled: true,
                updated_at: new Date(),
              }),
            )
            .execute();
        } else {
          // Disable provider and any hook configs that used it
          const providerRow = await db
            .updateTable('hook_providers')
            .set({ enabled: false, updated_at: new Date() })
            .where('workspace_id', '=', workspace.id)
            .where('provider_id', '=', providerDef.providerId)
            .returning('id')
            .executeTakeFirst();

          if (providerRow) {
            await db
              .updateTable('workspace_hook_configs')
              .set({ enabled: false, updated_at: new Date() })
              .where('workspace_id', '=', workspace.id)
              .where('provider_id', '=', providerRow.id)
              .execute();
          }
        }
      }

      res.json({ data: { module_id: moduleId, enabled: parsed.data.enabled }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
