// apps/api/src/middleware/module.ts
import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from './auth';

// In-memory cache: key = `{workspaceId}:{moduleId}`, value = { enabled, expiresAt }
const moduleCache = new Map<string, { enabled: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

async function isModuleEnabled(
  db: Kysely<Database>,
  workspaceId: string,
  moduleId: string,
): Promise<boolean> {
  const cacheKey = `${workspaceId}:${moduleId}`;
  const cached = moduleCache.get(cacheKey);
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
  moduleCache.set(cacheKey, { enabled, expiresAt: Date.now() + CACHE_TTL_MS });
  return enabled;
}

export function invalidateModuleCache(workspaceId: string, moduleId: string): void {
  moduleCache.delete(`${workspaceId}:${moduleId}`);
}

export function createRequireModule(db: Kysely<Database>) {
  // Clear cache on factory creation so each call starts fresh.
  moduleCache.clear();

  return function requireModule(moduleId: string) {
    return async function (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      const { workspace } = req as AuthenticatedRequest;
      const enabled = await isModuleEnabled(db, workspace.id, moduleId);
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
