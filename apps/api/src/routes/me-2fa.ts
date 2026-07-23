import { Router, type Router as ExpressRouter } from 'express';
import { authenticator } from 'otplib';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { generateRecoveryCodes } from '../lib/recovery-codes';
import { encryptSecret, decryptSecret } from '../lib/secret-crypto';

const codeSchema = z.object({ code: z.string().min(6).max(10) });

export function createMe2faRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // POST /2fa/enroll — generate a new TOTP secret, store it encrypted, disabled until verified.
  router.post('/2fa/enroll', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const secret = authenticator.generateSecret();
      const otpauth = authenticator.keyuri(user.email, 'Vencore', secret);

      await db
        .updateTable('users')
        .set({ totp_secret: encryptSecret(secret), totp_enabled: false })
        .where('id', '=', user.id)
        .execute();

      res.json({ data: { otpauth_uri: otpauth, secret }, error: null });
    } catch (e) {
      next(e);
    }
  });

  // POST /2fa/verify — confirm enrollment with a valid code; enables 2FA and issues recovery codes once.
  router.post('/2fa/verify', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const parsed = codeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'Invalid code.' } });
        return;
      }

      const row = await db
        .selectFrom('users')
        .select(['totp_secret'])
        .where('id', '=', user.id)
        .executeTakeFirst();

      if (!row?.totp_secret) {
        res.status(400).json({ data: null, error: { code: 'NOT_ENROLLED', message: 'Start enrollment first.' } });
        return;
      }

      const ok = authenticator.verify({ token: parsed.data.code, secret: decryptSecret(row.totp_secret) });
      if (!ok) {
        res.status(400).json({ data: null, error: { code: 'INVALID_CODE', message: 'Code did not match.' } });
        return;
      }

      const codes = generateRecoveryCodes();
      const hashed = await Promise.all(codes.map(c => bcrypt.hash(c, 10)));

      await db.transaction().execute(async trx => {
        await trx.updateTable('users').set({ totp_enabled: true }).where('id', '=', user.id).execute();
        await trx.deleteFrom('user_recovery_codes').where('user_id', '=', user.id).execute();
        for (const code_hash of hashed) {
          await trx.insertInto('user_recovery_codes').values({ user_id: user.id, code_hash }).execute();
        }
      });

      res.json({ data: { recovery_codes: codes }, error: null });
    } catch (e) {
      next(e);
    }
  });

  // POST /2fa/disable — requires a valid code; clears the secret and any recovery codes.
  router.post('/2fa/disable', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const parsed = codeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'Invalid code.' } });
        return;
      }

      const row = await db
        .selectFrom('users')
        .select(['totp_secret'])
        .where('id', '=', user.id)
        .executeTakeFirst();

      const ok = row?.totp_secret
        ? authenticator.verify({ token: parsed.data.code, secret: decryptSecret(row.totp_secret) })
        : false;

      if (!ok) {
        res.status(403).json({ data: null, error: { code: 'INVALID_CODE', message: 'Code did not match.' } });
        return;
      }

      await db
        .updateTable('users')
        .set({ totp_enabled: false, totp_secret: null })
        .where('id', '=', user.id)
        .execute();
      await db.deleteFrom('user_recovery_codes').where('user_id', '=', user.id).execute();

      res.json({ data: { ok: true }, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
