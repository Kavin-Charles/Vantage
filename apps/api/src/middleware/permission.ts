import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from './auth';
import { getModuleForPermission } from '@vencore/modules';
import { resolveRolePermissions } from '../lib/rbac/resolve';
import type { InheritanceEdge } from '../lib/rbac/closure';

const permCache = new Map<string, { value: { superuser: boolean; permissions: Set<string> }; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function getEnabledModuleIds(db: Kysely<Database>, workspaceId: string): Promise<string[]> {
  const rows = await db.selectFrom('workspace_modules')
    .where('workspace_id', '=', workspaceId).where('enabled', '=', true)
    .select('module_id').execute();
  return rows.map(r => r.module_id);
}

export async function resolveUserPermissions(
  db: Kysely<Database>, userId: string, workspaceId: string, enabledModuleIds: string[],
): Promise<{ superuser: boolean; permissions: Set<string> }> {
  const cacheKey = `${workspaceId}:${userId}`;
  const cached = permCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const activeRows = await db.selectFrom('user_session_roles')
    .where('user_id', '=', userId).where('active', '=', true).select('role_id').execute();
  const activeRoleIds = activeRows.map(r => r.role_id);

  const grantsAllRows = await db.selectFrom('roles')
    .where('workspace_id', '=', workspaceId).where('grants_all', '=', true).select('id').execute();
  const grantsAllRoleIds = new Set(grantsAllRows.map(r => r.id));

  const edgeRows = await db.selectFrom('role_inheritance').selectAll().execute();
  const edges: InheritanceEdge[] = edgeRows.map(e => ({ parent: e.parent_role_id, child: e.child_role_id }));

  const permRows = await db.selectFrom('role_permissions')
    .where('workspace_id', '=', workspaceId).select(['role_id', 'permission']).execute();
  const rolePermissions = new Map<string, string[]>();
  for (const r of permRows) {
    const list = rolePermissions.get(r.role_id) ?? [];
    list.push(r.permission);
    rolePermissions.set(r.role_id, list);
  }

  // 'admin' is a permission namespace (users:manage, roles:manage, etc.), not
  // a toggleable workspace_modules row — it has no nav/apiPrefixes. Force it
  // enabled so module-filtering never silently strips a granted admin perm.
  const enabled = new Set([...enabledModuleIds, 'admin']);

  const value = resolveRolePermissions({
    activeRoleIds, edges, grantsAllRoleIds, rolePermissions,
    enabledModuleIds: enabled, moduleOf: getModuleForPermission,
  });
  permCache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function userIsSuperuser(db: Kysely<Database>, userId: string, workspaceId: string): Promise<boolean> {
  const enabled = await getEnabledModuleIds(db, workspaceId);
  return (await resolveUserPermissions(db, userId, workspaceId, enabled)).superuser;
}

export async function userHasPermission(
  db: Kysely<Database>, user: { id: string }, workspaceId: string, permission: string,
): Promise<boolean> {
  const enabled = await getEnabledModuleIds(db, workspaceId);
  const resolved = await resolveUserPermissions(db, user.id, workspaceId, enabled);
  if (resolved.superuser) return true;
  const mod = getModuleForPermission(permission);
  if (mod !== null && mod !== 'admin' && !enabled.includes(mod)) return false;
  return resolved.permissions.has(permission);
}

export function invalidatePermissionCache(workspaceId: string, userId: string): void {
  permCache.delete(`${workspaceId}:${userId}`);
}
export function invalidateWorkspacePermissionCache(workspaceId: string): void {
  for (const key of permCache.keys()) if (key.startsWith(`${workspaceId}:`)) permCache.delete(key);
}
export function __clearPermCacheForTesting(): void { permCache.clear(); }

export async function invalidateRoleMemberCaches(db: Kysely<Database>, workspaceId: string, roleId: string): Promise<void> {
  const members = await db.selectFrom('user_roles')
    .where('role_id', '=', roleId).where('workspace_id', '=', workspaceId).select('user_id').execute();
  for (const m of members) invalidatePermissionCache(workspaceId, m.user_id);
}

export function createRequirePermission(db: Kysely<Database>) {
  return function requirePermission(permission: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { user, workspace } = req as AuthenticatedRequest;
        const enabled = await getEnabledModuleIds(db, workspace.id);
        const resolved = await resolveUserPermissions(db, user.id, workspace.id, enabled);
        if (resolved.superuser || resolved.permissions.has(permission)) return next();
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } });
      } catch (err) { next(err); }
    };
  };
}
