import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database, User, Workspace } from '@vantage/db';

export interface AuthenticatedRequest extends Request {
  user: User;
  workspace: Workspace;
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
    const token = req.cookies['vantage_token'] as string | undefined;
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

    const workspace = await db
      .selectFrom('workspaces')
      .where('id', '=', user.workspace_id)
      .selectAll()
      .executeTakeFirst();

    if (!workspace) {
      res.status(500).json({ data: null, error: { code: 'WORKSPACE_NOT_FOUND' } });
      return;
    }

    (req as AuthenticatedRequest).user = user;
    (req as AuthenticatedRequest).workspace = workspace;
    next();
  };
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { user } = req as AuthenticatedRequest;
  if (user.role !== 'admin') {
    res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
    return;
  }
  next();
}
