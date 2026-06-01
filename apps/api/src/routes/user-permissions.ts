import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { invalidatePermissionCache } from '../middleware/permission';
import { MODULE_REGISTRY, getDefaultPermissionsForRole, getModuleForPermission } from '@vantage/modules';

const upsertSchema = z.object({
  permission: z.string().min(1),
  granted: z.boolean(),
});

export function createUserPermissionsRouter(db: Kysely<Database>): Router {
  const router = Router({ mergeParams: true });

  // GET /api/users/:id/permissions
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const { id: userId } = req.params as { id: string };

      const targetUser = await db
        .selectFrom('users')
        .where('id', '=', userId)
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'role'])
        .executeTakeFirst();

      if (!targetUser) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      const enabledModules = await db
        .selectFrom('workspace_modules')
        .where('workspace_id', '=', workspace.id)
        .where('enabled', '=', true)
        .select('module_id')
        .execute();
      const enabledModuleIds = new Set(enabledModules.map(r => r.module_id));

      const overrides = await db
        .selectFrom('user_permissions')
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '=', userId)
        .select(['permission', 'granted'])
        .execute();
      const overrideMap = new Map(overrides.map(o => [o.permission, o.granted]));

      const roleDefaults = new Set(getDefaultPermissionsForRole(targetUser.role));

      const permissions = MODULE_REGISTRY.flatMap(mod =>
        mod.permissions.map(p => {
          const moduleEnabled = enabledModuleIds.has(mod.id);
          const roleDefault = roleDefaults.has(p.key);
          const override = overrideMap.get(p.key);
          const effectivelyGranted =
            targetUser.role === 'admin'
              ? true
              : override !== undefined
              ? override
              : roleDefault;

          return {
            key: p.key,
            label: p.label,
            moduleId: mod.id,
            moduleName: mod.name,
            effectivelyGranted,
            isOverride: override !== undefined,
            moduleEnabled,
          };
        }),
      );

      res.json({ data: { permissions }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/users/:id/permissions
  router.put('/', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const { id: userId } = req.params as { id: string };

      const parsed = upsertSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
        return;
      }

      const targetUser = await db
        .selectFrom('users')
        .where('id', '=', userId)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();

      if (!targetUser) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      const moduleId = getModuleForPermission(parsed.data.permission);
      if (!moduleId) {
        res.status(400).json({ data: null, error: { code: 'INVALID_PERMISSION' } });
        return;
      }

      await db
        .insertInto('user_permissions')
        .values({
          workspace_id: workspace.id,
          user_id: userId,
          permission: parsed.data.permission,
          granted: parsed.data.granted,
        })
        .onConflict(oc =>
          oc.columns(['workspace_id', 'user_id', 'permission']).doUpdateSet({
            granted: parsed.data.granted,
          }),
        )
        .execute();

      invalidatePermissionCache(workspace.id, userId);
      res.json({ data: { permission: parsed.data.permission, granted: parsed.data.granted }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/users/:id/permissions/:permission
  router.delete('/:permission', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { id: userId, permission } = req.params as { id: string; permission: string };

      await db
        .deleteFrom('user_permissions')
        .where('workspace_id', '=', workspace.id)
        .where('user_id', '=', userId)
        .where('permission', '=', permission)
        .execute();

      invalidatePermissionCache(workspace.id, userId);
      res.json({ data: null, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
