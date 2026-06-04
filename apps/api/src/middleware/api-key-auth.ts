import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export interface ApiKeyRequest extends Request {
  workspace: { id: string };
  apiKey: { id: string; scope: string };
}

export function createRequireApiKey(db: Kysely<Database>) {
  return async function requireApiKey(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'API key required' } });
      return;
    }

    const rawKey = authHeader.slice(7);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await db
      .selectFrom('api_keys')
      .where('key_hash', '=', keyHash)
      .selectAll()
      .executeTakeFirst();

    if (!apiKey) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } });
      return;
    }

    // Fire-and-forget: update last_used_at
    db.updateTable('api_keys')
      .set({ last_used_at: new Date() })
      .where('id', '=', apiKey.id)
      .execute()
      .catch(() => { /* non-critical */ });

    (req as ApiKeyRequest).workspace = { id: apiKey.workspace_id };
    (req as ApiKeyRequest).apiKey = { id: apiKey.id, scope: apiKey.scope };
    next();
  };
}

export function requireScope(requiredScope: 'read_write') {
  return function scopeMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const { apiKey } = req as ApiKeyRequest;
    if (apiKey.scope !== requiredScope) {
      res.status(403).json({ data: null, error: { code: 'INSUFFICIENT_SCOPE', message: 'This operation requires read_write scope' } });
      return;
    }
    next();
  };
}
