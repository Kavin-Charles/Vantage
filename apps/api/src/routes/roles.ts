import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { invalidateRoleMemberCaches, invalidatePermissionCache } from '../middleware/permission';
// getDefaultPermissionsForRole is @deprecated for general use but explicitly allowed
// here as the seed template for POST /api/roles { copyDefaults: true }.
import { getDefaultPermissionsForRole, getModuleForPermission } from '@vencore/modules';
import { buildGroupedPermissions, loadInheritanceEdges, loadSsdSets } from '../lib/rbac/db';
import { authorizedRoleClosure, wouldCreateCycle } from '../lib/rbac/closure';
import { checkSSD } from '../lib/rbac/constraints';

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  copyDefaults: z.boolean().optional(),
});

const updateRoleSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    max_members: z.number().int().positive().nullable().optional(),
  })
  .refine(o => Object.keys(o).length > 0, { message: 'No fields to update' });

const permissionsBodySchema = z.union([
  z.object({ permissions: z.array(z.string().min(1)) }),
  z.object({ permission: z.string().min(1), granted: z.boolean() }),
]);

const memberBodySchema = z.object({ userId: z.string().uuid() });

const inheritBodySchema = z.object({ childRoleId: z.string().uuid() });

export function createRolesRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
): ExpressRouter {
  const router = Router();
  router.use(requirePermission('roles:manage'));

  // GET /api/roles — list roles with member counts
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const roles = await db
        .selectFrom('roles')
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'name', 'description', 'color', 'is_system', 'grants_all', 'is_default', 'max_members', 'rank'])
        .orderBy('rank', 'desc')
        .orderBy('name', 'asc')
        .execute();

      const counts = await db
        .selectFrom('user_roles')
        .where('workspace_id', '=', workspace.id)
        .select(['role_id', db.fn.countAll<number>().as('count')])
        .groupBy('role_id')
        .execute();
      const countByRoleId = new Map(counts.map(c => [c.role_id, Number(c.count)]));

      const data = roles.map(r => ({ ...r, member_count: countByRoleId.get(r.id) ?? 0 }));
      res.json({ data, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/roles — create a custom role, optionally seeded from the member template
  router.post('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error.flatten() } });
        return;
      }

      const duplicate = await db
        .selectFrom('roles')
        .where('workspace_id', '=', workspace.id)
        .where('name', '=', parsed.data.name)
        .select('id')
        .executeTakeFirst();
      if (duplicate) {
        res.status(409).json({ data: null, error: { code: 'DUPLICATE_NAME', message: 'A role with this name already exists.' } });
        return;
      }

      const role = await db
        .insertInto('roles')
        .values({
          workspace_id: workspace.id,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          ...(parsed.data.color ? { color: parsed.data.color } : {}),
        })
        .returning(['id', 'name', 'description', 'color', 'is_system', 'grants_all', 'is_default', 'max_members', 'rank'])
        .executeTakeFirstOrThrow();

      if (parsed.data.copyDefaults) {
        const keys = getDefaultPermissionsForRole('member');
        if (keys.length > 0) {
          await db
            .insertInto('role_permissions')
            .values(keys.map(permission => ({ workspace_id: workspace.id, role_id: role.id, permission })))
            .execute();
        }
      }

      res.status(201).json({ data: role, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/roles/:id — update role metadata (name locked for system roles)
  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = updateRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error.flatten() } });
        return;
      }

      const existing = await db
        .selectFrom('roles')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'is_system'])
        .executeTakeFirst();
      if (!existing) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      if (existing.is_system && parsed.data.name !== undefined) {
        res.status(400).json({ data: null, error: { code: 'SYSTEM_ROLE', message: 'System role name is locked.' } });
        return;
      }

      if (parsed.data.name !== undefined) {
        const duplicate = await db
          .selectFrom('roles')
          .where('workspace_id', '=', workspace.id)
          .where('name', '=', parsed.data.name)
          .where('id', '!=', existing.id)
          .select('id')
          .executeTakeFirst();
        if (duplicate) {
          res.status(409).json({ data: null, error: { code: 'DUPLICATE_NAME', message: 'A role with this name already exists.' } });
          return;
        }
      }

      const updated = await db
        .updateTable('roles')
        .set({ ...parsed.data, updated_at: new Date() })
        .where('id', '=', existing.id)
        .where('workspace_id', '=', workspace.id)
        .returning(['id', 'name', 'description', 'color', 'is_system', 'grants_all', 'is_default', 'max_members', 'rank'])
        .executeTakeFirst();

      res.json({ data: updated, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/roles/:id — blocked for system roles or roles with members
  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const existing = await db
        .selectFrom('roles')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'is_system'])
        .executeTakeFirst();
      if (!existing) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      if (existing.is_system) {
        res.status(400).json({ data: null, error: { code: 'SYSTEM_ROLE', message: 'System roles cannot be deleted.' } });
        return;
      }

      const memberCount = await db
        .selectFrom('user_roles')
        .where('role_id', '=', existing.id)
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirst();
      if (Number(memberCount?.count ?? 0) > 0) {
        res.status(400).json({ data: null, error: { code: 'HAS_MEMBERS', message: 'Role still has members assigned.' } });
        return;
      }

      await invalidateRoleMemberCaches(db, workspace.id, existing.id);
      await db.deleteFrom('roles').where('id', '=', existing.id).where('workspace_id', '=', workspace.id).execute();

      res.json({ data: null, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/roles/:id — role detail: metadata, members, grouped permission matrix, inheritance
  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const role = await db
        .selectFrom('roles')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'name', 'description', 'color', 'is_system', 'grants_all', 'is_default', 'max_members'])
        .executeTakeFirst();
      if (!role) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      const own = await db
        .selectFrom('role_permissions')
        .where('role_id', '=', role.id)
        .select('permission')
        .execute();
      const grantedKeys = new Set(own.map(r => r.permission));

      // Inherited = union of role_permissions across this role's inheritance
      // descendants (children, grandchildren, ...), minus the role itself.
      const edges = await loadInheritanceEdges(db);
      const descendants = authorizedRoleClosure([role.id], edges);
      descendants.delete(role.id);
      const inheritedKeys = new Set<string>();
      if (descendants.size > 0) {
        const rows = await db
          .selectFrom('role_permissions')
          .where('role_id', 'in', [...descendants])
          .select('permission')
          .execute();
        for (const r of rows) inheritedKeys.add(r.permission);
      }

      const members = await db
        .selectFrom('user_roles as ur')
        .innerJoin('users as u', 'u.id', 'ur.user_id')
        .where('ur.role_id', '=', role.id)
        .select(['u.id', 'u.name', 'u.email'])
        .execute();

      const parents = await db
        .selectFrom('role_inheritance')
        .where('child_role_id', '=', role.id)
        .select('parent_role_id')
        .execute();
      const children = await db
        .selectFrom('role_inheritance')
        .where('parent_role_id', '=', role.id)
        .select('child_role_id')
        .execute();

      res.json({
        data: {
          ...role,
          members,
          modules: buildGroupedPermissions(grantedKeys, inheritedKeys),
          inheritance: {
            parents: parents.map(p => p.parent_role_id),
            children: children.map(c => c.child_role_id),
          },
        },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/roles/:id/permissions — replace the full grant set, or toggle one key
  router.put('/:id/permissions', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = permissionsBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error.flatten() } });
        return;
      }

      const role = await db
        .selectFrom('roles')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!role) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      if ('permissions' in parsed.data) {
        for (const key of parsed.data.permissions) {
          if (!getModuleForPermission(key)) {
            res.status(400).json({ data: null, error: { code: 'INVALID_PERMISSION', key } });
            return;
          }
        }
        const keys = parsed.data.permissions;
        await db.transaction().execute(async trx => {
          await trx.deleteFrom('role_permissions').where('role_id', '=', role.id).execute();
          for (const permission of keys) {
            await trx
              .insertInto('role_permissions')
              .values({ workspace_id: workspace.id, role_id: role.id, permission })
              .onConflict(oc => oc.columns(['role_id', 'permission']).doNothing())
              .execute();
          }
        });
      } else {
        const { permission, granted } = parsed.data;
        if (!getModuleForPermission(permission)) {
          res.status(400).json({ data: null, error: { code: 'INVALID_PERMISSION', key: permission } });
          return;
        }
        if (granted) {
          await db
            .insertInto('role_permissions')
            .values({ workspace_id: workspace.id, role_id: role.id, permission })
            .onConflict(oc => oc.columns(['role_id', 'permission']).doNothing())
            .execute();
        } else {
          await db
            .deleteFrom('role_permissions')
            .where('role_id', '=', role.id)
            .where('permission', '=', permission)
            .execute();
        }
      }

      await invalidateRoleMemberCaches(db, workspace.id, role.id);
      res.json({ data: null, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/roles/:id/members — add a user to this role (direct add; SSD-checked
  // assignment is centralized in the shared assign helper used by PUT /api/users/:id/roles)
  router.post('/:id/members', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = memberBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error.flatten() } });
        return;
      }
      const roleId = req.params['id']!;

      const role = await db
        .selectFrom('roles')
        .where('id', '=', roleId)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!role) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      await db
        .insertInto('user_roles')
        .values({ workspace_id: workspace.id, role_id: roleId, user_id: parsed.data.userId })
        .onConflict(oc => oc.columns(['role_id', 'user_id']).doNothing())
        .execute();
      await db
        .insertInto('user_session_roles')
        .values({ user_id: parsed.data.userId, role_id: roleId, active: true })
        .onConflict(oc => oc.columns(['user_id', 'role_id']).doNothing())
        .execute();

      invalidatePermissionCache(workspace.id, parsed.data.userId);
      res.status(201).json({ data: null, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/roles/:id/members/:userId — remove a user from this role
  router.delete('/:id/members/:userId', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const roleId = req.params['id']!;
      const userId = req.params['userId']!;

      const role = await db
        .selectFrom('roles')
        .where('id', '=', roleId)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!role) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      await db.deleteFrom('user_roles').where('role_id', '=', roleId).where('user_id', '=', userId).execute();
      await db.deleteFrom('user_session_roles').where('role_id', '=', roleId).where('user_id', '=', userId).execute();

      invalidatePermissionCache(workspace.id, userId);
      res.json({ data: null, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/roles/:id/inherit — parent (:id) inherits child; rejects cycles and SSD conflicts
  router.post('/:id/inherit', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = inheritBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error.flatten() } });
        return;
      }
      const parent = req.params['id']!;
      const child = parsed.data.childRoleId;
      if (parent === child) {
        res.status(400).json({ data: null, error: { code: 'CYCLE' } });
        return;
      }

      // Both roles must belong to the caller's workspace — role_inheritance has
      // no workspace_id and its FK only checks existence, so without this an
      // admin could create a cross-tenant edge.
      const owned = await db
        .selectFrom('roles')
        .where('workspace_id', '=', workspace.id)
        .where('id', 'in', [parent, child])
        .select('id')
        .execute();
      if (owned.length !== 2) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      const edges = await loadInheritanceEdges(db);
      if (wouldCreateCycle(edges, { parent, child })) {
        res.status(400).json({ data: null, error: { code: 'CYCLE' } });
        return;
      }

      // SSD: with the new edge in place, re-check every member of `parent`'s authorized closure.
      const newEdges = [...edges, { parent, child }];
      const ssdSets = await loadSsdSets(db, workspace.id);
      const members = await db
        .selectFrom('user_roles')
        .where('role_id', '=', parent)
        .where('workspace_id', '=', workspace.id)
        .select('user_id')
        .execute();

      const conflicts: { userId: string; sets: { setId: string; name: string }[] }[] = [];
      for (const m of members) {
        const assigned = await db
          .selectFrom('user_roles')
          .where('user_id', '=', m.user_id)
          .where('workspace_id', '=', workspace.id)
          .select('role_id')
          .execute();
        const closure = authorizedRoleClosure(assigned.map(r => r.role_id), newEdges);
        const violations = checkSSD(closure, ssdSets);
        if (violations.length > 0) conflicts.push({ userId: m.user_id, sets: violations });
      }
      if (conflicts.length > 0) {
        res.status(409).json({ data: null, error: { code: 'SSD_CONFLICT', conflicts } });
        return;
      }

      await db
        .insertInto('role_inheritance')
        .values({ parent_role_id: parent, child_role_id: child })
        .onConflict(oc => oc.columns(['parent_role_id', 'child_role_id']).doNothing())
        .execute();
      await invalidateRoleMemberCaches(db, workspace.id, parent);
      res.status(201).json({ data: null, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/roles/:id/inherit/:childId — remove an inheritance edge
  router.delete('/:id/inherit/:childId', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parent = req.params['id']!;
      const child = req.params['childId']!;

      // Both roles must belong to the caller's workspace (see POST above).
      const owned = await db
        .selectFrom('roles')
        .where('workspace_id', '=', workspace.id)
        .where('id', 'in', [parent, child])
        .select('id')
        .execute();
      if (owned.length !== 2) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      await db
        .deleteFrom('role_inheritance')
        .where('parent_role_id', '=', parent)
        .where('child_role_id', '=', child)
        .execute();
      await invalidateRoleMemberCaches(db, workspace.id, parent);
      res.json({ data: null, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
