import { Router } from 'express';
import bcrypt from 'bcrypt';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'member']).default('member'),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'member']).optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8),
});

export function createUsersRouter(db: Kysely<Database>): Router {
  const router = Router();

  // GET /api/users — list all users in workspace
  router.get('/', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const users = await db
        .selectFrom('users')
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'name', 'email', 'role', 'last_login_at', 'created_at'])
        .orderBy('created_at', 'asc')
        .execute();
      res.json({ data: users, error: null });
    } catch (err) {
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  // POST /api/users — create user (admin only, enforced at route level)
  router.post('/', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
        return;
      }

      const existing = await db
        .selectFrom('users')
        .where('email', '=', parsed.data.email)
        .select(['id'])
        .executeTakeFirst();
      if (existing) {
        res.status(409).json({ data: null, error: { code: 'EMAIL_TAKEN' } });
        return;
      }

      const hash = await bcrypt.hash(parsed.data.password, 12);
      const user = await db
        .insertInto('users')
        .values({
          workspace_id: workspace.id,
          name: parsed.data.name,
          email: parsed.data.email,
          password_hash: hash,
          role: parsed.data.role,
        })
        .returning(['id', 'name', 'email', 'role', 'created_at'])
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: user, error: null });
    } catch (err) {
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  // PATCH /api/users/:id — update name/email/role
  router.patch('/:id', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }

      if (Object.keys(parsed.data).length === 0) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'No fields to update' } });
        return;
      }

      const updated = await db
        .updateTable('users')
        .set(parsed.data)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id', 'name', 'email', 'role'])
        .executeTakeFirst();

      if (!updated) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      res.json({ data: updated, error: null });
    } catch (err) {
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  // POST /api/users/:id/reset-password — admin sets new password directly
  router.post('/:id/reset-password', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }

      const user = await db
        .selectFrom('users')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select(['id'])
        .executeTakeFirst();

      if (!user) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      const hash = await bcrypt.hash(parsed.data.password, 12);
      await db
        .updateTable('users')
        .set({ password_hash: hash })
        .where('id', '=', user.id)
        .execute();

      res.json({ data: null, error: null });
    } catch (err) {
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  // DELETE /api/users/:id — delete user (cannot delete self)
  router.delete('/:id', async (req, res) => {
    try {
      const { workspace, user: self } = req as unknown as AuthenticatedRequest;

      if (req.params['id'] === self.id) {
        res.status(400).json({ data: null, error: { code: 'CANNOT_DELETE_SELF' } });
        return;
      }

      const deleted = await db
        .deleteFrom('users')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id'])
        .executeTakeFirst();

      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      res.json({ data: null, error: null });
    } catch (err) {
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  return router;
}
