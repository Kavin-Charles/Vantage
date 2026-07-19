import { Router } from 'express';
import bcrypt from 'bcrypt';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { assignRole, getDefaultRoleId } from '../lib/role-assignment';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  is_active: z.boolean().optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8),
});

async function isWorkspaceAdmin(db: Kysely<Database>, userId: string, workspaceId: string): Promise<boolean> {
  const row = await db
    .selectFrom('user_roles as ur')
    .innerJoin('roles as r', 'r.id', 'ur.role_id')
    .where('ur.user_id', '=', userId)
    .where('ur.workspace_id', '=', workspaceId)
    .where('r.grants_all', '=', true)
    .select('ur.user_id')
    .executeTakeFirst();
  return !!row;
}

export function createUsersRouter(db: Kysely<Database>): Router {
  const router = Router();

  // GET /api/users — list all users in workspace
  router.get('/', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const users = await db
        .selectFrom('users')
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'name', 'email', 'is_active', 'last_login_at', 'created_at'])
        .orderBy('created_at', 'asc')
        .execute();

      const adminRows = await db
        .selectFrom('user_roles as ur')
        .innerJoin('roles as r', 'r.id', 'ur.role_id')
        .where('ur.workspace_id', '=', workspace.id)
        .where('r.grants_all', '=', true)
        .select('ur.user_id')
        .execute();
      const adminIds = new Set(adminRows.map(r => r.user_id));

      res.json({ data: users.map(u => ({ ...u, isAdmin: adminIds.has(u.id) })), error: null });
    } catch (err) {
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  // POST /api/users — create user (users:manage, enforced at route level)
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

      const defaultRoleId = await getDefaultRoleId(db, workspace.id);
      if (!defaultRoleId) {
        res.status(500).json({ data: null, error: { code: 'NO_DEFAULT_ROLE' } });
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
        })
        .returning(['id', 'name', 'email', 'created_at'])
        .executeTakeFirstOrThrow();

      await assignRole(db, workspace.id, user.id, defaultRoleId);

      res.status(201).json({ data: user, error: null });
    } catch (err) {
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  // PATCH /api/users/:id — update name/email/active
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
        .returning(['id', 'name', 'email'])
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

      // Guard: must have at least one active admin (grants_all role) after removal
      const targetIsAdmin = await isWorkspaceAdmin(db, req.params['id']!, workspace.id);

      if (targetIsAdmin) {
        const countResult = await db
          .selectFrom('user_roles as ur')
          .innerJoin('roles as r', 'r.id', 'ur.role_id')
          .innerJoin('users as u', 'u.id', 'ur.user_id')
          .where('ur.workspace_id', '=', workspace.id)
          .where('r.grants_all', '=', true)
          .where('u.is_active', '=', true)
          .select(eb => eb.fn.count<number>('ur.user_id').distinct().as('count'))
          .executeTakeFirstOrThrow();
        if (Number(countResult.count) <= 1) {
          res.status(400).json({ data: null, error: { code: 'LAST_ADMIN' } });
          return;
        }
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

  // GET /api/users/:id/groups — list roles user belongs to
  router.get('/:id/groups', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const roles = await db
        .selectFrom('user_roles as ur')
        .innerJoin('roles as r', 'r.id', 'ur.role_id')
        .where('ur.user_id', '=', req.params['id']!)
        .where('ur.workspace_id', '=', workspace.id)
        .select(['r.id', 'r.name', 'r.color'])
        .execute();
      res.json({ data: roles, error: null });
    } catch (err) {
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  return router;
}
