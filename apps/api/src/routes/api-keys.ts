import { randomBytes, createHash } from 'node:crypto';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  scope: z.enum(['read', 'read_write']),
});

function buildRawKey(scope: 'read' | 'read_write'): string {
  const suffix = randomBytes(32).toString('hex');
  const tag = scope === 'read_write' ? 'rw' : 'read';
  return `vnt_${tag}_${suffix}`;
}

export function createApiKeysRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/api-keys — list keys (no key_hash)
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const keys = await db
        .selectFrom('api_keys')
        .select(['id', 'workspace_id', 'name', 'prefix', 'scope', 'last_used_at', 'created_at'])
        .where('workspace_id', '=', workspace.id)
        .orderBy('created_at', 'asc')
        .execute();
      res.json({ data: keys, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/api-keys — create key, return raw key once
  router.post('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createKeySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      const rawKey = buildRawKey(parsed.data.scope);
      const keyHash = createHash('sha256').update(rawKey).digest('hex');
      const prefix = rawKey.slice(0, 12);

      const key = await db
        .insertInto('api_keys')
        .values({
          workspace_id: workspace.id,
          name: parsed.data.name,
          key_hash: keyHash,
          prefix,
          scope: parsed.data.scope,
        })
        .returning(['id', 'workspace_id', 'name', 'prefix', 'scope', 'created_at'])
        .executeTakeFirstOrThrow();

      // Return raw key ONCE — never stored plain, cannot be retrieved again
      res.status(201).json({ data: { ...key, key: rawKey }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/api-keys/:id — revoke
  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const deleted = await db
        .deleteFrom('api_keys')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id'])
        .executeTakeFirst();

      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'API key not found' } });
        return;
      }
      res.json({ data: { id: deleted.id }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
