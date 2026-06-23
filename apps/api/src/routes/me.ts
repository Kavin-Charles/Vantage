import { Router, type Router as ExpressRouter } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { resolvePermissions, getEnabledModuleIds } from '../middleware/permission';

const patchMeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

const patchPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

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

  // PATCH /api/me — update name and/or theme
  router.patch('/', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const parsed = patchMeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'Invalid name or theme.' } });
        return;
      }
      if (Object.keys(parsed.data).length === 0) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'No fields to update.' } });
        return;
      }

      const updated = await db
        .updateTable('users')
        .set(parsed.data)
        .where('id', '=', user.id)
        .returning(['id', 'name', 'email', 'role', 'theme'])
        .executeTakeFirstOrThrow();

      res.json({ data: updated, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/me/password — change own password
  router.patch('/password', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const parsed = patchPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'Current password and a new password (min 8 characters) are required.' } });
        return;
      }

      const valid = await bcrypt.compare(parsed.data.currentPassword, user.password_hash);
      if (!valid) {
        res.status(401).json({ data: null, error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' } });
        return;
      }

      const hash = await bcrypt.hash(parsed.data.newPassword, 12);
      await db
        .updateTable('users')
        .set({ password_hash: hash })
        .where('id', '=', user.id)
        .execute();

      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
