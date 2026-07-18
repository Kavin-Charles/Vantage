import { Router } from 'express';
import type { RequestHandler } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { SmtpConfig } from '@vencore/config';
import type { AuthenticatedRequest } from '../middleware/auth';
import { assignRole, getDefaultRoleId } from '../lib/role-assignment';

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
  roleIds: z.array(z.string().uuid()).optional(),
});

const directCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

const acceptInviteSchema = z.object({
  name: z.string().min(1),
  password: z.string().min(8),
});

type RoleResolution =
  | { ok: true; roleIds: string[] }
  | { ok: false; code: 'INVALID_ROLE_IDS' | 'NO_DEFAULT_ROLE' };

/**
 * Resolves the role ids to grant on an invite. Explicit `requestedRoleIds` must
 * all belong to `workspaceId` — this is the cross-tenant guard, since role ids
 * arrive from the request body and role_inheritance/invite_roles have no
 * workspace_id column of their own to lean on. Falls back to the workspace's
 * `is_default` role when none are requested.
 */
async function resolveRoleIds(
  db: Kysely<Database>,
  workspaceId: string,
  requestedRoleIds: string[] | undefined,
): Promise<RoleResolution> {
  if (requestedRoleIds && requestedRoleIds.length > 0) {
    const unique = [...new Set(requestedRoleIds)];
    const owned = await db
      .selectFrom('roles')
      .where('workspace_id', '=', workspaceId)
      .where('id', 'in', unique)
      .select('id')
      .execute();
    if (owned.length !== unique.length) {
      return { ok: false, code: 'INVALID_ROLE_IDS' };
    }
    return { ok: true, roleIds: owned.map(r => r.id) };
  }

  const defaultRoleId = await getDefaultRoleId(db, workspaceId);
  if (!defaultRoleId) {
    return { ok: false, code: 'NO_DEFAULT_ROLE' };
  }
  return { ok: true, roleIds: [defaultRoleId] };
}

export function createInvitesRouter(
  db: Kysely<Database>,
  smtp: SmtpConfig | null | undefined,
  requireAuth: RequestHandler,
  requireUsersManage: RequestHandler,
  appUrl: string,
): Router {
  const router = Router();

  // POST /api/invites — create invite or direct-create (users:manage only)
  // requireAuth + requireUsersManage applied here so the accept routes below remain public
  router.post('/', requireAuth, requireUsersManage, async (req, res, next) => {
    try {
      const { workspace, user: inviter } = req as unknown as AuthenticatedRequest;

      if (smtp) {
        // Email invite flow
        const parsed = createInviteSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
          return;
        }

        const existing = await db
          .selectFrom('users')
          .where('email', '=', parsed.data.email)
          .where('workspace_id', '=', workspace.id)
          .select('id')
          .executeTakeFirst();
        if (existing) {
          res.status(409).json({ data: null, error: { code: 'EMAIL_TAKEN' } });
          return;
        }

        const roleResolution = await resolveRoleIds(db, workspace.id, parsed.data.roleIds);
        if (!roleResolution.ok) {
          const status = roleResolution.code === 'INVALID_ROLE_IDS' ? 400 : 500;
          res.status(status).json({ data: null, error: { code: roleResolution.code } });
          return;
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

        const invite = await db
          .insertInto('invites')
          .values({
            workspace_id: workspace.id,
            email: parsed.data.email,
            token,
            invited_by: inviter.id,
            role: parsed.data.role,
            expires_at: expiresAt,
          })
          .returning(['id', 'email', 'token'])
          .executeTakeFirstOrThrow();

        for (const roleId of roleResolution.roleIds) {
          await db
            .insertInto('invite_roles')
            .values({ invite_id: invite.id, role_id: roleId })
            .onConflict(oc => oc.columns(['invite_id', 'role_id']).doNothing())
            .execute();
        }

        try {
          const nodemailer = await import('nodemailer');
          const transporter = nodemailer.default.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            auth: { user: smtp.user, pass: smtp.password },
          });
          await transporter.sendMail({
            from: smtp.from,
            to: parsed.data.email,
            subject: `You've been invited to ${workspace.name} on Vencore`,
            text: [
              `${inviter.name} has invited you to join ${workspace.name} on Vencore.`,
              '',
              `Accept your invitation: ${appUrl}/invite/${token}`,
              '',
              'This link expires in 72 hours.',
            ].join('\n'),
          });
        } catch {
          // Email send failure is non-fatal — invite record still created
        }

        res.status(201).json({ data: { inviteId: invite.id, email: invite.email }, error: null });
      } else {
        // Direct create fallback (no SMTP)
        const parsed = directCreateSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
          return;
        }

        const existing = await db
          .selectFrom('users')
          .where('email', '=', parsed.data.email)
          .where('workspace_id', '=', workspace.id)
          .select('id')
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

        res.status(201).json({ data: { user }, error: null });
      }
    } catch (err) { next(err); }
  });

  // GET /api/invites/accept/:token — get invite info (public)
  router.get('/accept/:token', async (req, res, next) => {
    try {
      const invite = await db
        .selectFrom('invites as i')
        .innerJoin('workspaces as w', 'w.id', 'i.workspace_id')
        .where('i.token', '=', req.params['token']!)
        .select(['i.id', 'i.email', 'i.role', 'i.expires_at', 'i.accepted_at', 'w.name as workspace_name'])
        .executeTakeFirst();

      if (!invite) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      if (invite.accepted_at) {
        res.status(410).json({ data: null, error: { code: 'ALREADY_ACCEPTED' } });
        return;
      }
      if (new Date(invite.expires_at) < new Date()) {
        res.status(410).json({ data: null, error: { code: 'EXPIRED' } });
        return;
      }

      res.json({ data: { email: invite.email, role: invite.role, workspaceName: invite.workspace_name }, error: null });
    } catch (err) { next(err); }
  });

  // POST /api/invites/accept/:token — accept invite (public)
  router.post('/accept/:token', async (req, res, next) => {
    try {
      const parsed = acceptInviteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }

      const invite = await db
        .selectFrom('invites')
        .where('token', '=', req.params['token']!)
        .selectAll()
        .executeTakeFirst();

      if (!invite) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      if (invite.accepted_at) {
        res.status(410).json({ data: null, error: { code: 'ALREADY_ACCEPTED' } });
        return;
      }
      if (new Date(invite.expires_at) < new Date()) {
        res.status(410).json({ data: null, error: { code: 'EXPIRED' } });
        return;
      }

      const inviteRoleRows = await db
        .selectFrom('invite_roles')
        .where('invite_id', '=', invite.id)
        .select('role_id')
        .execute();

      let roleIdsToAssign = inviteRoleRows.map(r => r.role_id);
      if (roleIdsToAssign.length === 0) {
        // Invites created before invite_roles existed (or with no roles recorded)
        // fall back to the workspace's default role.
        const defaultRoleId = await getDefaultRoleId(db, invite.workspace_id);
        if (!defaultRoleId) {
          res.status(500).json({ data: null, error: { code: 'NO_DEFAULT_ROLE' } });
          return;
        }
        roleIdsToAssign = [defaultRoleId];
      }

      const hash = await bcrypt.hash(parsed.data.password, 12);
      const newUser = await db
        .insertInto('users')
        .values({
          workspace_id: invite.workspace_id,
          name: parsed.data.name,
          email: invite.email,
          password_hash: hash,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      for (const roleId of roleIdsToAssign) {
        await assignRole(db, invite.workspace_id, newUser.id, roleId);
      }

      await db
        .updateTable('invites')
        .set({ accepted_at: new Date() })
        .where('id', '=', invite.id)
        .execute();

      res.json({ data: { email: invite.email }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
