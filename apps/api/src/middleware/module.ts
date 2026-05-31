import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from './auth';

const CACHE_TTL_MS = 60_000;

type CacheEntry = { enabled: boolean; expiresAt: number };

/**
 * Invalidate a cached module-enabled result for a specific workspace+module pair.
 * Pass the same cache map returned by the factory (see createRequireModule).
 * Useful after toggling a module in the DB to avoid waiting for TTL expiry.
 */
export function invalidateModuleCache(
  cache: Map<string, CacheEntry>,
  workspaceId: string,
  moduleId: string,
): void {
  cache.delete(`${workspaceId}:${moduleId}`);
}

export function createRequireModule(db: Kysely<Database>) {
  // In-memory cache per factory instance: key = `{workspaceId}:{moduleId}`
  const cache = new Map<string, CacheEntry>();
  async function isModuleEnabled(workspaceId: string, moduleId: string): Promise<boolean> {
    const cacheKey = `${workspaceId}:${moduleId}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.enabled;
    }

    const row = await db
      .selectFrom('workspace_modules')
      .where('workspace_id', '=', workspaceId)
      .where('module_id', '=', moduleId)
      .select('enabled')
      .executeTakeFirst();

    const enabled = row?.enabled ?? false;
    cache.set(cacheKey, { enabled, expiresAt: Date.now() + CACHE_TTL_MS });
    return enabled;
  }

  return function requireModule(moduleId: string) {
    return async function (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      const { workspace } = req as AuthenticatedRequest;
      const enabled = await isModuleEnabled(workspace.id, moduleId);
      if (!enabled) {
        res.status(403).json({
          data: null,
          error: {
            code: 'MODULE_DISABLED',
            message: `${moduleId} module is disabled for this workspace.`,
          },
        });
        return;
      }
      next();
    };
  };
}
