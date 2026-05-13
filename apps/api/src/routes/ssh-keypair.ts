// apps/api/src/routes/ssh-keypair.ts
import { Router, type Router as ExpressRouter } from 'express';
import { generateKeyPairSync } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { encryptPrivateKey } from '../lib/ssh-crypto';

export function createSshKeypairRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/ssh/keypair — get (or generate) workspace public key
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      let keypair = await db
        .selectFrom('workspace_ssh_keypairs')
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'workspace_id', 'public_key', 'created_at', 'updated_at'])
        .executeTakeFirst();

      if (!keypair) {
        keypair = await generateAndStoreKeypair(db, workspace.id);
      }

      res.json({ data: keypair, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/ssh/keypair — regenerate (destroys old key)
  router.delete('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      await db
        .deleteFrom('workspace_ssh_keypairs')
        .where('workspace_id', '=', workspace.id)
        .execute();

      const keypair = await generateAndStoreKeypair(db, workspace.id);
      res.json({ data: keypair, error: null });
    } catch (err) { next(err); }
  });

  return router;
}

async function generateAndStoreKeypair(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<{ id: string; workspace_id: string; public_key: string; created_at: string; updated_at: string }> {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });

  const { encryptedPrivateKey, iv } = encryptPrivateKey(privateKey);

  const row = await db
    .insertInto('workspace_ssh_keypairs')
    .values({
      workspace_id: workspaceId,
      public_key: publicKey,
      encrypted_private_key: encryptedPrivateKey,
      iv,
    })
    .returning(['id', 'workspace_id', 'public_key', 'created_at', 'updated_at'])
    .executeTakeFirstOrThrow();

  return row;
}
