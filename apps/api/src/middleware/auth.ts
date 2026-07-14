import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database, User, Workspace } from '@vencore/db';
import { getEnabledModuleIds, resolveUserPermissions } from './permission';

export interface AuthenticatedRequest extends Request {
  user: User;
  workspace: Workspace;
  isAdmin: boolean;
  permissions: Set<string>;
}

interface JwtPayload {
  sub: string;
  role: 'admin' | 'member';
  workspaceId: string;
}

export function createRequireAuth(db: Kysely<Database>, jwtSecret: string) {
  return async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    // Prefer Authorization: Bearer for mobile; fall back to cookie for web
    const authHeader = req.headers.authorization;
    const token =
      authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : (req.cookies['vencore_token'] as string | undefined);
    if (!token) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, jwtSecret) as JwtPayload;
    } catch {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const user = await db
      .selectFrom('users')
      .where('id', '=', payload.sub)
      .selectAll()
      .executeTakeFirst();

    if (!user) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    if (!user.is_active) {
      res.status(401).json({ data: null, error: { code: 'ACCOUNT_DISABLED' } });
      return;
    }

    const workspace = await db
      .selectFrom('workspaces')
      .where('id', '=', user.workspace_id)
      .selectAll()
      .executeTakeFirst();

    if (!workspace) {
      res.status(500).json({ data: null, error: { code: 'WORKSPACE_NOT_FOUND' } });
      return;
    }

    const enabled = await getEnabledModuleIds(db, workspace.id);
    const resolved = await resolveUserPermissions(db, user.id, workspace.id, enabled);

    (req as AuthenticatedRequest).user = user;
    (req as AuthenticatedRequest).workspace = workspace;
    (req as AuthenticatedRequest).isAdmin = resolved.superuser;
    (req as AuthenticatedRequest).permissions = resolved.permissions;
    next();
  };
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { user, isAdmin } = req as AuthenticatedRequest;
  if (!user || !isAdmin) {
    res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
    return;
  }
  next();
}
