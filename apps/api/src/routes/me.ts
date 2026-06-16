import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { resolvePermissions, getEnabledModuleIds } from '../middleware/permission';

export function createMeRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest;

      let permissions: string[] = [];
      if (user.role === 'member') {
        const enabledModuleIds = await getEnabledModuleIds(db, workspace.id);
        const perms = await resolvePermissions(db, user.id, workspace.id, user.role, enabledModuleIds);
        permissions = [...perms];
      }

      res.json({ data: { user: { ...user, permissions }, workspace }, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
