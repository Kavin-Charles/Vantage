import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { invalidatePermissionCache } from '../middleware/permission';
import { authorizedRoleClosure } from '../lib/rbac/closure';
import { loadInheritanceEdges, loadDsdSets } from '../lib/rbac/db';
import { checkDSD } from '../lib/rbac/constraints';

const setActiveRolesSchema = z.object({ roleIds: z.array(z.string().uuid()) });

// Self-service session-role activation. No `*:manage` gate — any authenticated
// user may call this, but every query is keyed on req.user.id so a caller can
// only ever read or mutate their own rows. Activation is further restricted to
// roles the caller is already assigned (see PUT below), which is what keeps a
// foreign/cross-tenant role id in the body from having any effect.
export function createSessionRolesRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET / — the caller's assigned roles with their current active flag
  router.get('/', async (req, res, next) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest;

      const rows = await db
        .selectFrom('user_roles as ur')
        .innerJoin('roles as r', 'r.id', 'ur.role_id')
        .leftJoin('user_session_roles as usr', join =>
          join.onRef('usr.role_id', '=', 'ur.role_id').on('usr.user_id', '=', user.id),
        )
        .where('ur.user_id', '=', user.id)
        .where('ur.workspace_id', '=', workspace.id)
        .select(['r.id', 'r.name', 'usr.active'])
        .execute();

      res.json({
        data: { assigned: rows.map(r => ({ id: r.id, name: r.name, active: r.active ?? false })) },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  });

  // PUT / — activate a subset of the caller's assigned roles, DSD-checked
  router.put('/', async (req, res, next) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest;
      const parsed = setActiveRolesSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error.flatten() } });
        return;
      }

      const assignedRows = await db
        .selectFrom('user_roles')
        .where('user_id', '=', user.id)
        .where('workspace_id', '=', workspace.id)
        .select('role_id')
        .execute();
      const assignedRoleIds = assignedRows.map(r => r.role_id);
      const assignedSet = new Set(assignedRoleIds);

      // Requested roles not in the caller's own assignments are silently dropped —
      // this is what prevents activating a foreign/cross-tenant role id from the body.
      const requested = parsed.data.roleIds.filter(id => assignedSet.has(id));

      const edges = await loadInheritanceEdges(db);
      const closure = authorizedRoleClosure(requested, edges);
      const dsdSets = await loadDsdSets(db, workspace.id);
      const violations = checkDSD(closure, dsdSets);
      if (violations.length > 0) {
        res.status(409).json({ data: null, error: { code: 'DSD_CONFLICT', conflicts: violations } });
        return;
      }

      const requestedSet = new Set(requested);
      await db.transaction().execute(async trx => {
        for (const roleId of assignedRoleIds) {
          const active = requestedSet.has(roleId);
          await trx
            .insertInto('user_session_roles')
            .values({ user_id: user.id, role_id: roleId, active })
            .onConflict(oc => oc.columns(['user_id', 'role_id']).doUpdateSet({ active }))
            .execute();
        }
      });

      invalidatePermissionCache(workspace.id, user.id);
      res.json({ data: { active: requested }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
