import { getAuth } from '@clerk/express';
import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database, User, Workspace } from '@vantage/db';

export interface AuthenticatedRequest extends Request {
  user: User;
  workspace: Workspace;
}

export function createRequireWorkspace(db: Kysely<Database>) {
  return async function requireWorkspace(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const { userId } = getAuth(req);

    if (!userId) {
      res.status(401).json({
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
      return;
    }

    const user = await db
      .selectFrom('users')
      .where('clerk_user_id', '=', userId)
      .selectAll()
      .executeTakeFirst();

    if (!user) {
      res.status(404).json({
        data: null,
        error: { code: 'USER_NOT_FOUND', message: 'User not provisioned' },
      });
      return;
    }

    const workspace = await db
      .selectFrom('workspaces')
      .where('id', '=', user.workspace_id)
      .selectAll()
      .executeTakeFirst();

    if (!workspace) {
      res.status(404).json({
        data: null,
        error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' },
      });
      return;
    }

    (req as AuthenticatedRequest).user = user;
    (req as AuthenticatedRequest).workspace = workspace;
    next();
  };
}
