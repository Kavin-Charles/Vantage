import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { invalidateRoleMemberCaches } from '../middleware/permission';
// getDefaultPermissionsForRole is @deprecated for general use but explicitly allowed
// here as the seed template for POST /api/roles { copyDefaults: true }.
import { getDefaultPermissionsForRole } from '@vencore/modules';

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

  return router;
}
