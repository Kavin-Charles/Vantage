import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { invalidatePermissionCache } from '../middleware/permission';
import { buildGroupedPermissions, loadInheritanceEdges, loadSsdSets } from '../lib/rbac/db';
import { authorizedRoleClosure } from '../lib/rbac/closure';
import { checkSSD, checkCardinality } from '../lib/rbac/constraints';

const setRolesSchema = z.object({ roleIds: z.array(z.string().uuid()) });

export function createUserRolesRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
): ExpressRouter {
  const router = Router({ mergeParams: true });
  router.use(requirePermission('users:manage'));

  // GET /api/users/:id/roles — assigned roles + resolved effective permission matrix
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const userId = (req.params as { id: string }).id;

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

      const assigned = await db
        .selectFrom('user_roles')
        .where('user_id', '=', userId)
        .where('workspace_id', '=', workspace.id)
        .select('role_id')
        .execute();
      const roleIds = assigned.map(r => r.role_id);

      const edges = await loadInheritanceEdges(db);
      const closure = authorizedRoleClosure(roleIds, edges);

      const grantsAllRows = await db
        .selectFrom('roles')
        .where('workspace_id', '=', workspace.id)
        .where('grants_all', '=', true)
        .select('id')
        .execute();
      const isAdmin = grantsAllRows.some(r => closure.has(r.id));

      const permRows = closure.size > 0
        ? await db.selectFrom('role_permissions').where('role_id', 'in', [...closure]).select('permission').execute()
        : [];
      const grantedKeys = new Set(permRows.map(r => r.permission));

      res.json({
        data: { roleIds, isAdmin, modules: buildGroupedPermissions(grantedKeys, new Set()) },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/users/:id/roles — set-assignment, SSD- and cardinality-checked
  router.put('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const userId = (req.params as { id: string }).id;
      const parsed = setRolesSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error.flatten() } });
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

      const roleIds = [...new Set(parsed.data.roleIds)];

      // Every role ID must belong to the caller's workspace before it's assigned —
      // user_roles.workspace_id alone doesn't stop a caller passing a role ID from
      // another workspace, which would grant cross-tenant permissions.
      if (roleIds.length > 0) {
        const owned = await db
          .selectFrom('roles')
          .where('workspace_id', '=', workspace.id)
          .where('id', 'in', roleIds)
          .select('id')
          .execute();
        if (owned.length !== roleIds.length) {
          res.status(400).json({ data: null, error: { code: 'INVALID_ROLE', message: 'One or more roles do not belong to this workspace.' } });
          return;
        }
      }

      const edges = await loadInheritanceEdges(db);
      const closure = authorizedRoleClosure(roleIds, edges);
      const ssdSets = await loadSsdSets(db, workspace.id);
      const ssdViolations = checkSSD(closure, ssdSets);
      if (ssdViolations.length > 0) {
        res.status(409).json({ data: null, error: { code: 'SSD_CONFLICT', conflicts: ssdViolations } });
        return;
      }

      const existingRows = await db
        .selectFrom('user_roles')
        .where('user_id', '=', userId)
        .where('workspace_id', '=', workspace.id)
        .select('role_id')
        .execute();
      const existingRoleIds = new Set(existingRows.map(r => r.role_id));
      const roleIdSet = new Set(roleIds);
      const toAdd = roleIds.filter(id => !existingRoleIds.has(id));
      const toRemove = [...existingRoleIds].filter(id => !roleIdSet.has(id));

      // Cardinality: only roles newly gaining this user need to be checked against their cap.
      if (toAdd.length > 0) {
        const roleRows = await db
          .selectFrom('roles')
          .where('workspace_id', '=', workspace.id)
          .where('id', 'in', toAdd)
          .select(['id', 'max_members'])
          .execute();
        for (const role of roleRows) {
          const countRow = await db
            .selectFrom('user_roles')
            .where('role_id', '=', role.id)
            .select(db.fn.countAll<number>().as('count'))
            .executeTakeFirst();
          if (!checkCardinality(role, Number(countRow?.count ?? 0))) {
            res.status(409).json({ data: null, error: { code: 'CARDINALITY', roleId: role.id } });
            return;
          }
        }
      }

      await db.transaction().execute(async trx => {
        await trx.deleteFrom('user_roles').where('user_id', '=', userId).where('workspace_id', '=', workspace.id).execute();
        if (roleIds.length > 0) {
          await trx
            .insertInto('user_roles')
            .values(roleIds.map(roleId => ({ workspace_id: workspace.id, role_id: roleId, user_id: userId })))
            .execute();
        }
        if (toAdd.length > 0) {
          await trx
            .insertInto('user_session_roles')
            .values(toAdd.map(roleId => ({ user_id: userId, role_id: roleId, active: true })))
            .onConflict(oc => oc.columns(['user_id', 'role_id']).doUpdateSet({ active: true }))
            .execute();
        }
        if (toRemove.length > 0) {
          await trx
            .deleteFrom('user_session_roles')
            .where('user_id', '=', userId)
            .where('role_id', 'in', toRemove)
            .execute();
        }
      });

      invalidatePermissionCache(workspace.id, userId);
      res.json({ data: { roleIds }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
