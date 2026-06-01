import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from './auth';
import { getDefaultPermissionsForRole, getModuleForPermission } from '@vantage/modules';

const ADMIN_SENTINEL = new Proxy(new Set<string>(), {
  get(target, prop) {
    if (prop === 'has') return () => true;
    return Reflect.get(target, prop);
  },
});

const permCache = new Map<string, { perms: Set<string>; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

async function getEnabledModuleIds(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom('workspace_modules')
    .where('workspace_id', '=', workspaceId)
    .where('enabled', '=', true)
    .select('module_id')
    .execute();
  return rows.map(r => r.module_id);
}

export async function resolvePermissions(
  db: Kysely<Database>,
  userId: string,
  workspaceId: string,
  role: 'admin' | 'member',
  enabledModuleIds: string[],
): Promise<Set<string>> {
  if (role === 'admin') return ADMIN_SENTINEL as unknown as Set<string>;

  const cacheKey = `${workspaceId}:${userId}`;
  const cached = permCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.perms;

  const defaults = new Set(
    getDefaultPermissionsForRole('member').filter(key => {
      const modId = getModuleForPermission(key);
      return modId !== null && enabledModuleIds.includes(modId);
    }),
  );

  const overrides = await db
    .selectFrom('user_permissions')
    .select(['permission', 'granted'])
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', userId)
    .execute();

  for (const o of overrides) {
    if (o.granted) defaults.add(o.permission);
    else defaults.delete(o.permission);
  }

  permCache.set(cacheKey, { perms: defaults, expiresAt: Date.now() + CACHE_TTL_MS });
  return defaults;
}

export function invalidatePermissionCache(workspaceId: string, userId: string): void {
  permCache.delete(`${workspaceId}:${userId}`);
}

export function invalidateWorkspacePermissionCache(workspaceId: string): void {
  for (const key of permCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) permCache.delete(key);
  }
}

export function __clearPermCacheForTesting(): void {
  permCache.clear();
}

export function createRequirePermission(db: Kysely<Database>) {
  return function requirePermission(permission: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { user, workspace } = req as AuthenticatedRequest;
        if (user.role === 'admin') return next();
        const enabledModuleIds = await getEnabledModuleIds(db, workspace.id);
        const perms = await resolvePermissions(db, user.id, workspace.id, user.role, enabledModuleIds);
        if (!perms.has(permission)) {
          res.status(403).json({
            data: null,
            error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' },
          });
          return;
        }
        next();
      } catch (err) {
        next(err);
      }
    };
  };
}
