import { createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database, Server } from '@vencore/db';

export interface AgentRequest extends Request {
  server: Server;
}

export function createRequireAgentToken(db: Kysely<Database>) {
  return async function requireAgentToken(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Missing agent token' } });
      return;
    }

    const rawToken = authHeader.slice(7);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const server = await db
      .selectFrom('servers')
      .where('agent_token_hash', '=', tokenHash)
      .selectAll()
      .executeTakeFirst();

    if (!server) {
      res.status(401).json({ data: null, error: { code: 'INVALID_TOKEN', message: 'Invalid agent token' } });
      return;
    }

    (req as AgentRequest).server = server;
    next();
  };
}
