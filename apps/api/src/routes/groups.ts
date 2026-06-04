import { Router } from 'express';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { invalidatePermissionCache, invalidateGroupMemberCaches } from '../middleware/permission';
import { getModuleForPermission, MODULE_REGISTRY } from '@vencore/modules';
import { pluginPermissionKey } from '@vencore/plugin-runtime';

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const updateGroupSchema = createGroupSchema.partial();

const addMemberSchema = z.object({
  userId: z.string().uuid(),
});

const setPermissionSchema = z.object({
  permission: z.string().min(1),
  granted: z.boolean(),
});

export function createGroupsRouter(db: Kysely<Database>): Router {
  const router = Router();

  // GET /api/groups — list groups with member count
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const groups = await db
        .selectFrom('groups as g')
        .leftJoin('group_members as gm', 'gm.group_id', 'g.id')
        .where('g.workspace_id', '=', workspace.id)
        .select([
          'g.id', 'g.name', 'g.description', 'g.color', 'g.created_at',
          sql<number>`count(gm.id)`.as('member_count'),
        ])
        .groupBy(['g.id', 'g.name', 'g.description', 'g.color', 'g.created_at'])
        .orderBy('g.created_at', 'asc')
        .execute();
      res.json({ data: groups, error: null });
    } catch (err) { next(err); }
  });

  // POST /api/groups — create group
  router.post('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
        return;
      }
      const group = await db
        .insertInto('groups')
        .values({
          workspace_id: workspace.id,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          color: parsed.data.color ?? '#6b665c',
        })
        .returning(['id', 'name', 'description', 'color', 'created_at'])
        .executeTakeFirstOrThrow();
      res.status(201).json({ data: group, error: null });
    } catch (err) { next(err); }
  });

  // GET /api/groups/:id — group with members + permissions
  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const group = await db
        .selectFrom('groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .executeTakeFirst();
      if (!group) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      const members = await db
        .selectFrom('group_members as gm')
        .innerJoin('users as u', 'u.id', 'gm.user_id')
        .where('gm.group_id', '=', group.id)
        .select(['u.id', 'u.name', 'u.email', 'u.role', 'gm.created_at as joined_at'])
        .execute();

      const groupPermRows = await db
        .selectFrom('group_permissions')
        .where('group_id', '=', group.id)
        .select(['permission', 'granted'])
        .execute();
      const grantMap = new Map(groupPermRows.map((r) => [r.permission, r.granted]));

      const modulePermissions = MODULE_REGISTRY.flatMap((mod) =>
        mod.permissions.map((p) => ({
          key: p.key,
          label: p.label,
          moduleId: mod.id,
          moduleName: mod.name,
          granted: grantMap.get(p.key) ?? false,
        })),
      );

      const installedPlugins = await db
        .selectFrom('workspace_plugins')
        .select(['plugin_id', 'name', 'manifest'])
        .where('workspace_id', '=', workspace.id)
        .where('enabled', '=', true)
        .execute();

      const pluginPermissions = installedPlugins.map((p) => {
        const manifest = p.manifest as unknown as import('@vencore/plugin-types').PluginManifest;
        const perms = (manifest.permissions ?? []).map((perm) => {
          const key = pluginPermissionKey(p.plugin_id, perm.key);
          return { key, label: perm.label, granted: grantMap.get(key) ?? false };
        });
        return { id: p.plugin_id, name: p.name, icon: (manifest.icon ?? null), permissions: perms };
      });

      res.json({ data: { ...group, members, permissions: { modules: modulePermissions, plugins: pluginPermissions } }, error: null });
    } catch (err) { next(err); }
  });

  // PATCH /api/groups/:id — update group
  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = updateGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }
      if (Object.keys(parsed.data).length === 0) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'No fields to update' } });
        return;
      }
      const updated = await db
        .updateTable('groups')
        .set({ ...parsed.data, updated_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id', 'name', 'description', 'color', 'updated_at'])
        .executeTakeFirst();
      if (!updated) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      res.json({ data: updated, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:id — delete group
  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      await invalidateGroupMemberCaches(db, workspace.id, req.params['id']!);
      const deleted = await db
        .deleteFrom('groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id'])
        .executeTakeFirst();
      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  // POST /api/groups/:id/members — add user
  router.post('/:id/members', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = addMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }
      const group = await db
        .selectFrom('groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!group) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      const user = await db
        .selectFrom('users')
        .where('id', '=', parsed.data.userId)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!user) {
        res.status(404).json({ data: null, error: { code: 'USER_NOT_FOUND' } });
        return;
      }
      await db
        .insertInto('group_members')
        .values({
          workspace_id: workspace.id,
          group_id: group.id,
          user_id: parsed.data.userId,
        })
        .onConflict(oc => oc.columns(['group_id', 'user_id']).doNothing())
        .execute();
      invalidatePermissionCache(workspace.id, parsed.data.userId);
      res.status(201).json({ data: { groupId: group.id, userId: parsed.data.userId }, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:id/members/:userId — remove user
  router.delete('/:id/members/:userId', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      await db
        .deleteFrom('group_members')
        .where('group_id', '=', req.params['id']!)
        .where('user_id', '=', req.params['userId']!)
        .execute();
      invalidatePermissionCache(workspace.id, req.params['userId']!);
      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  // PUT /api/groups/:id/permissions — upsert permission
  router.put('/:id/permissions', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = setPermissionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }
      if (!getModuleForPermission(parsed.data.permission)) {
        res.status(400).json({ data: null, error: { code: 'INVALID_PERMISSION' } });
        return;
      }
      const group = await db
        .selectFrom('groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!group) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      await db
        .insertInto('group_permissions')
        .values({
          workspace_id: workspace.id,
          group_id: group.id,
          permission: parsed.data.permission,
          granted: parsed.data.granted,
        })
        .onConflict(oc =>
          oc.columns(['group_id', 'permission']).doUpdateSet({ granted: parsed.data.granted }),
        )
        .execute();
      await invalidateGroupMemberCaches(db, workspace.id, group.id);
      res.json({ data: { permission: parsed.data.permission, granted: parsed.data.granted }, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:id/permissions/:perm — remove permission
  router.delete('/:id/permissions/:perm', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const perm = req.params['perm']!;
      if (!getModuleForPermission(perm)) {
        res.status(400).json({ data: null, error: { code: 'INVALID_PERMISSION' } });
        return;
      }
      const group = await db
        .selectFrom('groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!group) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      await db
        .deleteFrom('group_permissions')
        .where('group_id', '=', group.id)
        .where('permission', '=', perm)
        .execute();
      await invalidateGroupMemberCaches(db, workspace.id, group.id);
      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
