// apps/api/src/routes/ssh-keypair.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { generateKeyPairSync } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { encryptPrivateKey } from '../lib/ssh-crypto';

const updateSshUserSchema = z.object({
  ssh_user: z.string().min(1).max(64).regex(/^[\w.-]+$/, 'Invalid SSH username'),
});

export function createSshKeypairRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/ssh/keypair — get (or generate) workspace public key + ssh_user
  router.get('/keypair', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      let keypair = await db
        .selectFrom('workspace_ssh_keypairs')
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'workspace_id', 'public_key', 'ssh_user', 'created_at', 'updated_at'])
        .executeTakeFirst();

      if (!keypair) {
        keypair = await generateAndStoreKeypair(db, workspace.id, 'root');
      }

      res.json({ data: keypair, error: null });
    } catch (err) { next(err); }
  });

  // PATCH /api/ssh/keypair — update ssh_user only
  router.patch('/keypair', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { ssh_user } = updateSshUserSchema.parse(req.body);

      const updated = await db
        .updateTable('workspace_ssh_keypairs')
        .set({ ssh_user, updated_at: new Date().toISOString() })
        .where('workspace_id', '=', workspace.id)
        .returning(['id', 'workspace_id', 'public_key', 'ssh_user', 'created_at', 'updated_at'])
        .executeTakeFirst();

      if (!updated) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'No SSH keypair found. Visit Settings → SSH to generate one.' } });
        return;
      }
      res.json({ data: updated, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/ssh/keypair — regenerate keypair, preserve ssh_user
  router.delete('/keypair', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      // Read existing ssh_user before deleting so regeneration preserves it
      const existing = await db
        .selectFrom('workspace_ssh_keypairs')
        .where('workspace_id', '=', workspace.id)
        .select(['ssh_user'])
        .executeTakeFirst();

      await db
        .deleteFrom('workspace_ssh_keypairs')
        .where('workspace_id', '=', workspace.id)
        .execute();

      const keypair = await generateAndStoreKeypair(db, workspace.id, existing?.ssh_user ?? 'root');
      res.json({ data: keypair, error: null });
    } catch (err) { next(err); }
  });

  return router;
}

async function generateAndStoreKeypair(
  db: Kysely<Database>,
  workspaceId: string,
  sshUser: string,
): Promise<{ id: string; workspace_id: string; public_key: string; ssh_user: string; created_at: string; updated_at: string }> {
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
      ssh_user: sshUser,
    })
    .returning(['id', 'workspace_id', 'public_key', 'ssh_user', 'created_at', 'updated_at'])
    .executeTakeFirstOrThrow();

  return row;
}
