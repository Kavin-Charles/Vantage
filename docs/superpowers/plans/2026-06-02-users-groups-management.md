# Users & Groups Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Settings > Team with a full Users & Groups management page: invite/deactivate/remove users, create permission groups that members inherit, with group perms unioned with per-user overrides.

**Architecture:** DB adds `is_active` on users + four new tables (groups, group_members, group_permissions, invites). The permission resolver gains a group-permission union step. New Express routers handle groups and invites. The Settings layout gains a "Users & Groups" tab with Users and Groups sub-pages.

**Tech Stack:** TypeScript strict, Kysely (PostgreSQL), Express + Zod, React + Redux Toolkit, @tanstack/react-query, nodemailer (SMTP), Next.js App Router.

---

## File Map

**Create:**
- `packages/db/migrations/20260602_002_users_groups.ts`
- `apps/api/src/routes/groups.ts`
- `apps/api/src/routes/invites.ts`
- `packages/api-client/src/groups.ts`
- `packages/api-client/src/invites.ts`
- `apps/web/app/(dashboard)/settings/(users-groups)/layout.tsx` ← route group, no URL impact; wraps both users + groups with sub-nav
- `apps/web/app/(dashboard)/settings/(users-groups)/users/page.tsx` → URL: `/settings/users`
- `apps/web/app/(dashboard)/settings/(users-groups)/users/[userId]/permissions/page.tsx` → URL: `/settings/users/[userId]/permissions`
- `apps/web/app/(dashboard)/settings/(users-groups)/groups/page.tsx` → URL: `/settings/groups`
- `apps/web/app/(dashboard)/settings/(users-groups)/groups/[groupId]/page.tsx` → URL: `/settings/groups/[groupId]`
- `apps/web/app/invite/[token]/page.tsx`
- `apps/web/components/settings/InviteUserModal.tsx`
- `apps/web/components/settings/GroupPermissionsEditor.tsx`

**Note on route group:** `(users-groups)` is a Next.js route group — the parenthesized directory name is stripped from the URL. This lets a single `layout.tsx` provide the Users | Groups sub-nav for both paths without affecting URLs.

**Modify:**
- `packages/db/src/schema.ts` — add GroupTable, GroupMemberTable, GroupPermissionTable, InviteTable, is_active to UserTable
- `apps/api/src/middleware/auth.ts` — add `is_active` check after user load
- `apps/api/src/middleware/permission.ts` — add group permission union step + `invalidateGroupMemberCaches`
- `apps/api/src/routes/users.ts` — add `is_active` to PATCH, add last-admin guard to DELETE, add `GET /:id/groups`
- `apps/api/src/index.ts` — register groups + invites routers
- `packages/api-client/src/index.ts` — export groups + invites
- `apps/web/app/(dashboard)/settings/layout.tsx` — add "Users & Groups" tab, rename "Team"
- `apps/web/app/(dashboard)/settings/team/page.tsx` — note: team page kept but permissions sub-page moved to users/

---

## Task 1: DB Migration + Schema

**Files:**
- Create: `packages/db/migrations/20260602_002_users_groups.ts`
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Create migration file**

Create `packages/db/migrations/20260602_002_users_groups.ts`:
```typescript
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add is_active to users
  await db.schema
    .alterTable('users')
    .addColumn('is_active', 'boolean', col => col.notNull().defaultTo(true))
    .execute();

  // Groups
  await db.schema
    .createTable('groups')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', sql`varchar(100)`, col => col.notNull())
    .addColumn('description', 'text')
    .addColumn('color', sql`varchar(7)`, col => col.notNull().defaultTo('#6b665c'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('groups_workspace_name_unique')
    .on('groups')
    .columns(['workspace_id', 'name'])
    .unique()
    .execute();

  // Group members
  await db.schema
    .createTable('group_members')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('group_id', 'uuid', col => col.notNull().references('groups.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('group_members_unique')
    .on('group_members')
    .columns(['group_id', 'user_id'])
    .unique()
    .execute();

  // Group permissions
  await db.schema
    .createTable('group_permissions')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('group_id', 'uuid', col => col.notNull().references('groups.id').onDelete('cascade'))
    .addColumn('permission', sql`varchar(255)`, col => col.notNull())
    .addColumn('granted', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('group_permissions_unique')
    .on('group_permissions')
    .columns(['group_id', 'permission'])
    .unique()
    .execute();

  // Invites
  await db.schema
    .createTable('invites')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('email', sql`varchar(255)`, col => col.notNull())
    .addColumn('token', sql`varchar(64)`, col => col.notNull().unique())
    .addColumn('invited_by', 'uuid', col => col.notNull().references('users.id'))
    .addColumn('role', sql`varchar(20)`, col => col.notNull().defaultTo('member'))
    .addColumn('expires_at', 'timestamptz', col => col.notNull())
    .addColumn('accepted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('invites').execute();
  await db.schema.dropTable('group_permissions').execute();
  await db.schema.dropTable('group_members').execute();
  await db.schema.dropTable('groups').execute();
  await db.schema.alterTable('users').dropColumn('is_active').execute();
}
```

- [ ] **Step 2: Add tables to `packages/db/src/schema.ts`**

Read the file first. Add these interfaces after `UserPermissionTable` (around line 620):
```typescript
// Add is_active to UserTable — insert after the `password_reset_expires_at` field:
is_active: Generated<boolean>;

export interface GroupTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  description: string | null;
  color: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface GroupMemberTable {
  id: Generated<string>;
  workspace_id: string;
  group_id: string;
  user_id: string;
  created_at: Generated<Date>;
}

export interface GroupPermissionTable {
  id: Generated<string>;
  workspace_id: string;
  group_id: string;
  permission: string;
  granted: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface InviteTable {
  id: Generated<string>;
  workspace_id: string;
  email: string;
  token: string;
  invited_by: string;
  role: Generated<string>;
  expires_at: Date;
  accepted_at: Date | null;
  created_at: Generated<Date>;
}
```

Add to `Database` interface (after `user_permissions: UserPermissionTable;`):
```typescript
  groups: GroupTable;
  group_members: GroupMemberTable;
  group_permissions: GroupPermissionTable;
  invites: InviteTable;
```

Add convenience types at the bottom:
```typescript
export type Group = Selectable<GroupTable>;
export type NewGroup = Insertable<GroupTable>;
export type GroupUpdate = Updateable<GroupTable>;

export type GroupMember = Selectable<GroupMemberTable>;
export type NewGroupMember = Insertable<GroupMemberTable>;

export type GroupPermission = Selectable<GroupPermissionTable>;
export type NewGroupPermission = Insertable<GroupPermissionTable>;

export type Invite = Selectable<InviteTable>;
export type NewInvite = Insertable<InviteTable>;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd packages/db && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/20260602_002_users_groups.ts packages/db/src/schema.ts
git commit -m "feat: add groups, group_members, group_permissions, invites tables + is_active on users"
```

---

## Task 2: Auth Middleware — is_active Check + Permission Resolver Group Union

**Files:**
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/middleware/permission.ts`

- [ ] **Step 1: Add `is_active` check to `requireAuth`**

Read `apps/api/src/middleware/auth.ts`. Find the block after the user is loaded:
```typescript
if (!user) {
  res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
  return;
}
```

Add immediately after it:
```typescript
if (!user.is_active) {
  res.status(401).json({ data: null, error: { code: 'ACCOUNT_DISABLED' } });
  return;
}
```

- [ ] **Step 2: Add group permission union to `resolvePermissions`**

Read `apps/api/src/middleware/permission.ts` fully. In `resolvePermissions`, after the user_permissions overrides loop and before the `permCache.set(...)` line, insert:

```typescript
  // Apply group permissions (union)
  const userGroups = await db
    .selectFrom('group_members')
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', userId)
    .select('group_id')
    .execute();

  if (userGroups.length > 0) {
    const groupIds = userGroups.map(g => g.group_id);
    const groupPerms = await db
      .selectFrom('group_permissions')
      .where('group_id', 'in', groupIds)
      .select(['permission', 'granted'])
      .execute();
    for (const gp of groupPerms) {
      if (gp.granted) defaults.add(gp.permission);
      else defaults.delete(gp.permission);
    }
  }
```

Wait — the correct order per spec is: role defaults → group union → user overrides. So the group union must happen BEFORE user overrides. The current structure is:
1. Build `defaults` from role defaults filtered by modules
2. Apply user overrides

Change it so groups are applied after role defaults but before user overrides. Find the user_permissions query and the for loop, and place the group union BEFORE the user overrides block:

```typescript
  // Step 3: union group permissions
  const userGroups = await db
    .selectFrom('group_members')
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', userId)
    .select('group_id')
    .execute();

  if (userGroups.length > 0) {
    const groupIds = userGroups.map(g => g.group_id);
    const groupPerms = await db
      .selectFrom('group_permissions')
      .where('group_id', 'in', groupIds)
      .select(['permission', 'granted'])
      .execute();
    for (const gp of groupPerms) {
      if (gp.granted) defaults.add(gp.permission);
      else defaults.delete(gp.permission);
    }
  }

  // Step 4: apply user-level overrides (user wins over group)
  const overrides = await db
    .selectFrom('user_permissions')
    ...
```

- [ ] **Step 3: Add `invalidateGroupMemberCaches` export**

At the end of `permission.ts`, add:
```typescript
// Must be awaited — queries DB for group members
export async function invalidateGroupMemberCaches(
  db: Kysely<Database>,
  workspaceId: string,
  groupId: string,
): Promise<void> {
  const members = await db
    .selectFrom('group_members')
    .where('group_id', '=', groupId)
    .where('workspace_id', '=', workspaceId)
    .select('user_id')
    .execute();
  for (const m of members) {
    invalidatePermissionCache(workspaceId, m.user_id);
  }
}
```

- [ ] **Step 4: Verify API TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/auth.ts apps/api/src/middleware/permission.ts
git commit -m "feat: is_active check in requireAuth, group permission union in resolvePermissions"
```

---

## Task 3: Groups API Route

**Files:**
- Create: `apps/api/src/routes/groups.ts`

- [ ] **Step 1: Create `apps/api/src/routes/groups.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { invalidatePermissionCache, invalidateGroupMemberCaches } from '../middleware/permission';
import { getModuleForPermission } from '@vantage/modules';

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const updateGroupSchema = createGroupSchema.partial();

const addMemberSchema = z.object({
  userId: z.string().uuid(),
});

const setPermissionSchema = z.object({
  permission: z.string().min(1),
  granted: z.boolean(),
});

export function createGroupsRouter(db: Kysely<Database>): Router {
  const router = Router();

  // GET /api/groups — list groups with member count
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const groups = await db
        .selectFrom('groups as g')
        .leftJoin('group_members as gm', 'gm.group_id', 'g.id')
        .where('g.workspace_id', '=', workspace.id)
        .select([
          'g.id', 'g.name', 'g.description', 'g.color', 'g.created_at',
          db.fn.count('gm.id').as('member_count'),
        ])
        .groupBy(['g.id', 'g.name', 'g.description', 'g.color', 'g.created_at'])
        .orderBy('g.created_at', 'asc')
        .execute();
      res.json({ data: groups, error: null });
    } catch (err) { next(err); }
  });

  // POST /api/groups — create group
  router.post('/', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const parsed = createGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
        return;
      }
      const group = await db
        .insertInto('groups')
        .values({
          workspace_id: workspace.id,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          color: parsed.data.color ?? '#6b665c',
        })
        .returning(['id', 'name', 'description', 'color', 'created_at'])
        .executeTakeFirstOrThrow();
      res.status(201).json({ data: group, error: null });
    } catch (err) { next(err); }
  });

  // GET /api/groups/:id — group with members + permissions
  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const group = await db
        .selectFrom('groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .executeTakeFirst();
      if (!group) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      const members = await db
        .selectFrom('group_members as gm')
        .innerJoin('users as u', 'u.id', 'gm.user_id')
        .where('gm.group_id', '=', group.id)
        .select(['u.id', 'u.name', 'u.email', 'u.role', 'gm.created_at as joined_at'])
        .execute();
      const permissions = await db
        .selectFrom('group_permissions')
        .where('group_id', '=', group.id)
        .select(['permission', 'granted'])
        .execute();
      res.json({ data: { ...group, members, permissions }, error: null });
    } catch (err) { next(err); }
  });

  // PATCH /api/groups/:id — update group
  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const parsed = updateGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }
      if (Object.keys(parsed.data).length === 0) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'No fields to update' } });
        return;
      }
      const updated = await db
        .updateTable('groups')
        .set({ ...parsed.data, updated_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id', 'name', 'description', 'color', 'updated_at'])
        .executeTakeFirst();
      if (!updated) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      res.json({ data: updated, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:id — delete group (cascade handles members + perms)
  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      // Invalidate caches for all members before deleting
      await invalidateGroupMemberCaches(db, workspace.id, req.params['id']!);
      const deleted = await db
        .deleteFrom('groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id'])
        .executeTakeFirst();
      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  // POST /api/groups/:id/members — add user to group
  router.post('/:id/members', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const parsed = addMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }
      const group = await db
        .selectFrom('groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!group) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      const user = await db
        .selectFrom('users')
        .where('id', '=', parsed.data.userId)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!user) {
        res.status(404).json({ data: null, error: { code: 'USER_NOT_FOUND' } });
        return;
      }
      await db
        .insertInto('group_members')
        .values({
          workspace_id: workspace.id,
          group_id: group.id,
          user_id: parsed.data.userId,
        })
        .onConflict(oc => oc.columns(['group_id', 'user_id']).doNothing())
        .execute();
      invalidatePermissionCache(workspace.id, parsed.data.userId);
      res.status(201).json({ data: { groupId: group.id, userId: parsed.data.userId }, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:id/members/:userId — remove user from group
  router.delete('/:id/members/:userId', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      await db
        .deleteFrom('group_members')
        .where('group_id', '=', req.params['id']!)
        .where('user_id', '=', req.params['userId']!)
        .execute();
      invalidatePermissionCache(workspace.id, req.params['userId']!);
      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  // PUT /api/groups/:id/permissions — upsert permission
  router.put('/:id/permissions', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const parsed = setPermissionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
        return;
      }
      if (!getModuleForPermission(parsed.data.permission)) {
        res.status(400).json({ data: null, error: { code: 'INVALID_PERMISSION' } });
        return;
      }
      const group = await db
        .selectFrom('groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!group) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      await db
        .insertInto('group_permissions')
        .values({
          workspace_id: workspace.id,
          group_id: group.id,
          permission: parsed.data.permission,
          granted: parsed.data.granted,
        })
        .onConflict(oc =>
          oc.columns(['group_id', 'permission']).doUpdateSet({ granted: parsed.data.granted }),
        )
        .execute();
      await invalidateGroupMemberCaches(db, workspace.id, group.id);
      res.json({ data: { permission: parsed.data.permission, granted: parsed.data.granted }, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/groups/:id/permissions/:perm — remove permission override
  router.delete('/:id/permissions/:perm', async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const perm = req.params['perm']!;
      if (!getModuleForPermission(perm)) {
        res.status(400).json({ data: null, error: { code: 'INVALID_PERMISSION' } });
        return;
      }
      const group = await db
        .selectFrom('groups')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!group) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      await db
        .deleteFrom('group_permissions')
        .where('group_id', '=', group.id)
        .where('permission', '=', perm)
        .execute();
      await invalidateGroupMemberCaches(db, workspace.id, group.id);
      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/groups.ts
git commit -m "feat: add groups API route (CRUD, members, permissions)"
```

---

## Task 4: Invites API Route + Users Route Updates

**Files:**
- Create: `apps/api/src/routes/invites.ts`
- Modify: `apps/api/src/routes/users.ts`

- [ ] **Step 1: Create `apps/api/src/routes/invites.ts`**

```typescript
import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { SmtpConfig } from '@vantage/config';
import type { AuthenticatedRequest } from '../middleware/auth';

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
});

const directCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'member']).default('member'),
});

const acceptInviteSchema = z.object({
  name: z.string().min(1),
  password: z.string().min(8),
});

export function createInvitesRouter(
  db: Kysely<Database>,
  smtp: SmtpConfig | null | undefined,
): Router {
  const router = Router();

  // POST /api/invites — create invite or direct-create (admin only, enforced at route level)
  router.post('/', async (req, res, next) => {
    try {
      const { workspace, user: inviter } = req as AuthenticatedRequest;

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

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

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

        // Send invite email
        try {
          const nodemailer = await import('nodemailer');
          const transporter = nodemailer.default.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            auth: { user: smtp.user, pass: smtp.password },
          });
          const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000';
          await transporter.sendMail({
            from: smtp.from,
            to: parsed.data.email,
            subject: `You've been invited to ${workspace.name} on Vantage`,
            text: [
              `${inviter.name} has invited you to join ${workspace.name} on Vantage.`,
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

      const hash = await bcrypt.hash(parsed.data.password, 12);
      await db
        .insertInto('users')
        .values({
          workspace_id: invite.workspace_id,
          name: parsed.data.name,
          email: invite.email,
          password_hash: hash,
          role: invite.role as 'admin' | 'member',
        })
        .execute();

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
```

- [ ] **Step 2: Update `apps/api/src/routes/users.ts`**

Read the current file. Make these changes:

**a) Add `is_active` to `updateUserSchema`:**
```typescript
const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'member']).optional(),
  is_active: z.boolean().optional(),
});
```

**b) Add "last active admin" guard to the DELETE handler.** Find the existing DELETE handler and add this check before the delete query (after the "cannot delete self" check):

```typescript
// Guard: workspace must always have at least one active admin
if (req.params['id'] !== self.id) {
  const target = await db
    .selectFrom('users')
    .where('id', '=', req.params['id']!)
    .where('workspace_id', '=', workspace.id)
    .select(['role'])
    .executeTakeFirst();

  if (target?.role === 'admin') {
    const adminCount = await db
      .selectFrom('users')
      .where('workspace_id', '=', workspace.id)
      .where('role', '=', 'admin')
      .where('is_active', '=', true)
      .select(db.fn.count('id').as('count'))
      .executeTakeFirstOrThrow();
    if (Number(adminCount.count) <= 1) {
      res.status(400).json({ data: null, error: { code: 'LAST_ADMIN' } });
      return;
    }
  }
}
```

**c) Add `GET /api/users/:id/groups` handler** (after the PATCH handler):

```typescript
// GET /api/users/:id/groups — list groups user belongs to
router.get('/:id/groups', async (req, res) => {
  try {
    const { workspace } = req as unknown as AuthenticatedRequest;
    const groups = await db
      .selectFrom('group_members as gm')
      .innerJoin('groups as g', 'g.id', 'gm.group_id')
      .where('gm.user_id', '=', req.params['id']!)
      .where('gm.workspace_id', '=', workspace.id)
      .select(['g.id', 'g.name', 'g.color'])
      .execute();
    res.json({ data: groups, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
  }
});
```

- [ ] **Step 3: Wire new routes into `apps/api/src/index.ts`**

Read the file. Add imports near the top:
```typescript
import { createGroupsRouter } from './routes/groups';
import { createInvitesRouter } from './routes/invites';
```

Add route registrations (before the users routes):
```typescript
app.use('/api/groups', requireAuth, requireAdmin, createGroupsRouter(db));
app.use('/api/invites', createInvitesRouter(db, config.smtp));
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/invites.ts apps/api/src/routes/users.ts apps/api/src/index.ts
git commit -m "feat: add invites route, update users route with is_active + last-admin guard + groups listing"
```

---

## Task 5: `@vantage/api-client` — Groups + Invites Functions

**Files:**
- Create: `packages/api-client/src/groups.ts`
- Create: `packages/api-client/src/invites.ts`
- Modify: `packages/api-client/src/index.ts`

- [ ] **Step 1: Create `packages/api-client/src/groups.ts`**

```typescript
import { apiFetch } from './core';

export interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  member_count: string | number;
  created_at: string;
}

export interface GroupDetail extends Omit<Group, 'member_count'> {
  updated_at: string;
  members: { id: string; name: string; email: string; role: string; joined_at: string }[];
  permissions: { permission: string; granted: boolean }[];
}

export interface GroupsResponse { data: Group[]; error: null }
export interface GroupDetailResponse { data: GroupDetail; error: null }

export async function listGroups(token: string): Promise<GroupsResponse> {
  return apiFetch('/api/groups', { token });
}

export async function getGroup(token: string, id: string): Promise<GroupDetailResponse> {
  return apiFetch(`/api/groups/${id}`, { token });
}

export async function createGroup(
  token: string,
  body: { name: string; description?: string; color?: string },
): Promise<{ data: Group; error: null }> {
  return apiFetch('/api/groups', { method: 'POST', body: JSON.stringify(body), token });
}

export async function updateGroup(
  token: string,
  id: string,
  body: { name?: string; description?: string; color?: string },
): Promise<{ data: Group; error: null }> {
  return apiFetch(`/api/groups/${id}`, { method: 'PATCH', body: JSON.stringify(body), token });
}

export async function deleteGroup(token: string, id: string): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/groups/${id}`, { method: 'DELETE', token });
}

export async function addGroupMember(
  token: string,
  groupId: string,
  userId: string,
): Promise<{ data: { groupId: string; userId: string }; error: null }> {
  return apiFetch(`/api/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ userId }), token });
}

export async function removeGroupMember(
  token: string,
  groupId: string,
  userId: string,
): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE', token });
}

export async function setGroupPermission(
  token: string,
  groupId: string,
  permission: string,
  granted: boolean,
): Promise<{ data: { permission: string; granted: boolean }; error: null }> {
  return apiFetch(`/api/groups/${groupId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permission, granted }),
    token,
  });
}

export async function deleteGroupPermission(
  token: string,
  groupId: string,
  permission: string,
): Promise<{ data: null; error: null }> {
  return apiFetch(`/api/groups/${groupId}/permissions/${encodeURIComponent(permission)}`, {
    method: 'DELETE',
    token,
  });
}
```

- [ ] **Step 2: Create `packages/api-client/src/invites.ts`**

```typescript
import { apiFetch } from './core';

export interface InviteInfo {
  email: string;
  role: string;
  workspaceName: string;
}

export async function createInvite(
  token: string,
  body: { email: string; role?: 'admin' | 'member' },
): Promise<{ data: { inviteId: string; email: string }; error: null }> {
  return apiFetch('/api/invites', { method: 'POST', body: JSON.stringify(body), token });
}

export async function createUserDirect(
  token: string,
  body: { name: string; email: string; password: string; role?: 'admin' | 'member' },
): Promise<{ data: { user: { id: string; name: string; email: string; role: string } }; error: null }> {
  return apiFetch('/api/invites', { method: 'POST', body: JSON.stringify(body), token });
}

export async function getInviteInfo(token: string): Promise<{ data: InviteInfo; error: null }> {
  return apiFetch(`/api/invites/accept/${token}`);
}

export async function acceptInvite(
  token: string,
  body: { name: string; password: string },
): Promise<{ data: { email: string }; error: null }> {
  return apiFetch(`/api/invites/accept/${token}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 3: Export from `packages/api-client/src/index.ts`**

Read the current file. Add at the end:
```typescript
export * from './groups';
export * from './invites';
```

- [ ] **Step 4: Build api-client**

```bash
cd packages/api-client && npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/src/groups.ts packages/api-client/src/invites.ts packages/api-client/src/index.ts
git commit -m "feat: add groups and invites api-client functions"
```

---

## Task 6: Settings Layout Update + Users Page

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/layout.tsx`
- Create: `apps/web/app/(dashboard)/settings/(users-groups)/layout.tsx`
- Create: `apps/web/app/(dashboard)/settings/(users-groups)/users/page.tsx`
- Create: `apps/web/components/settings/InviteUserModal.tsx`
- Create: `apps/web/app/(dashboard)/settings/(users-groups)/users/[userId]/permissions/page.tsx`

- [ ] **Step 1: Update settings layout tab**

Read `apps/web/app/(dashboard)/settings/layout.tsx`. Find:
```typescript
{ href: '/settings/team', label: 'Team' },
```

Replace with:
```typescript
{ href: '/settings/users', label: 'Users & Groups', adminOnly: true },
```

Also add `/settings/users` and `/settings/groups` to the admin redirect guard in `useEffect`:
```typescript
pathname.startsWith('/settings/users') ||
pathname.startsWith('/settings/groups') ||
```

- [ ] **Step 2: Create `apps/web/app/(dashboard)/settings/(users-groups)/layout.tsx`**

This is a Next.js route group — `(users-groups)` has no effect on URLs. This layout wraps both `/settings/users` and `/settings/groups` with the shared sub-nav.

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SUB_TABS = [
  { href: '/settings/users', label: 'Users', exact: true },
  { href: '/settings/groups', label: 'Groups' },
];

export default function UsersGroupsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {SUB_TABS.map(tab => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                color: active ? 'var(--text)' : 'var(--text3)',
                textDecoration: 'none',
                borderBottom: active ? '2px solid var(--text)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/components/settings/InviteUserModal.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useApiToken } from '@/lib/useApiToken';

interface Props {
  hasSMTP: boolean;
  onClose: () => void;
}

export function InviteUserModal({ hasSMTP, onClose }: Props) {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const body = hasSMTP
        ? { email, role }
        : { name, email, password, role };
      return apiFetch('/api/invites', { method: 'POST', body: JSON.stringify(body), token });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message ?? 'Failed to invite user');
    },
  });

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 7,
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 24, width: 400,
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>
          {hasSMTP ? 'Invite User' : 'Add User'}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!hasSMTP && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Name</label>
              <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Email</label>
            <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
          </div>

          {!hasSMTP && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Password</label>
              <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" />
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Role</label>
            <select style={inputStyle} value={role} onChange={e => setRole(e.target.value as 'admin' | 'member')}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: 'var(--red)', background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 7 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !email || (!hasSMTP && (!name || !password))}
            style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--text)', color: '#fff', fontSize: 13, cursor: 'pointer', opacity: mutation.isPending ? 0.6 : 1 }}
          >
            {mutation.isPending ? (hasSMTP ? 'Sending…' : 'Adding…') : (hasSMTP ? 'Send Invite' : 'Add User')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/web/app/(dashboard)/settings/users/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { useAuth } from '@/lib/AuthContext';
import { apiFetch } from '@/lib/api';
import { InviteUserModal } from '@/components/settings/InviteUserModal';
import type { User } from '@vantage/types';

interface UserWithActive extends User {
  is_active: boolean;
}

export default function UsersPage() {
  const getToken = useApiToken();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () =>
      apiFetch<{ data: UserWithActive[]; error: null }>('/api/users', { token: await getToken() }),
  });

  const { data: configData } = useQuery({
    queryKey: ['config'],
    queryFn: async () =>
      apiFetch<{ data: { smtp_configured: boolean } }>('/api/config'),
  });

  const hasSMTP = configData?.data?.smtp_configured ?? false;

  const patchUser = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<UserWithActive> }) => {
      const token = await getToken();
      return apiFetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(body), token });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return apiFetch(`/api/users/${id}`, { method: 'DELETE', token });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const users = usersData?.data ?? [];

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 0', borderBottom: '1px solid var(--border)',
  };

  const badgeStyle = (color: string, bg: string): React.CSSProperties => ({
    fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
    color, background: bg, textTransform: 'uppercase',
  });

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Users</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text2)' }}>
            Manage workspace members.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--text)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
        >
          {hasSMTP ? '+ Invite User' : '+ Add User'}
        </button>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div>
          {users.map(u => {
            const isSelf = u.id === currentUser?.id;
            const adminCount = users.filter(x => x.role === 'admin' && x.is_active).length;
            const cantRemove = isSelf || (u.role === 'admin' && adminCount <= 1);

            return (
              <div key={u.id} style={{ ...rowStyle, opacity: u.is_active ? 1 : 0.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: 'var(--surface2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600, color: 'var(--text)',
                  }}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name} {isSelf && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(you)</span>}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>{u.email}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={badgeStyle(u.role === 'admin' ? 'var(--blue)' : 'var(--text3)', u.role === 'admin' ? 'var(--blue-bg)' : 'var(--surface2)')}>
                    {u.role}
                  </span>
                  {!u.is_active && (
                    <span style={badgeStyle('var(--amber)', 'var(--amber-bg)')}>Inactive</span>
                  )}
                  <a
                    href={`/settings/users/${u.id}/permissions`}
                    style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none' }}
                  >
                    Permissions
                  </a>
                  <button
                    onClick={() => patchUser.mutate({ id: u.id, body: { is_active: !u.is_active } })}
                    disabled={isSelf}
                    style={{ fontSize: 12, color: 'var(--text2)', background: 'none', border: 'none', cursor: isSelf ? 'not-allowed' : 'pointer', opacity: isSelf ? 0.4 : 1 }}
                  >
                    {u.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${u.name} from this workspace?`)) {
                        deleteUser.mutate(u.id);
                      }
                    }}
                    disabled={cantRemove}
                    style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: cantRemove ? 'not-allowed' : 'pointer', opacity: cantRemove ? 0.4 : 1 }}
                    title={cantRemove ? (isSelf ? "Can't remove yourself" : "Can't remove last admin") : undefined}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showInvite && <InviteUserModal hasSMTP={hasSMTP} onClose={() => setShowInvite(false)} />}
    </div>
  );
}
```

- [ ] **Step 5: Create `apps/web/app/(dashboard)/settings/users/[userId]/permissions/page.tsx`**

This is the moved version of `settings/team/[userId]/permissions/page.tsx`. Create the file:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { User } from '@vantage/types';
import { UserPermissionsEditor } from '@/components/settings/UserPermissionsEditor';

export default function UserPermissionsPage() {
  const { userId } = useParams<{ userId: string }>();
  const getToken = useApiToken();

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () =>
      apiFetch<{ data: User[]; error: null }>('/api/users', { token: await getToken() }),
  });

  const user = usersData?.data?.find(u => u.id === userId);

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <Link href="/settings/users" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none' }}>
          ← Users
        </Link>
        {user && (
          <>
            <span style={{ color: 'var(--text3)' }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</span>
          </>
        )}
      </div>

      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Permissions</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Manage what this user can do. Overrides apply on top of their role and group defaults.
      </p>

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : !user ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>User not found.</div>
      ) : (
        <UserPermissionsEditor userId={userId} isAdmin={user.role === 'admin'} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors unrelated to this change).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/(dashboard)/settings/layout.tsx "apps/web/app/(dashboard)/settings/(users-groups)/" apps/web/components/settings/InviteUserModal.tsx
git commit -m "feat: add Users management page with invite modal, deactivate, remove, permissions link"
```

---

## Task 7: Groups Frontend Pages

**Files:**
- Create: `apps/web/app/(dashboard)/settings/(users-groups)/groups/page.tsx`
- Create: `apps/web/app/(dashboard)/settings/(users-groups)/groups/[groupId]/page.tsx`
- Create: `apps/web/components/settings/GroupPermissionsEditor.tsx`

- [ ] **Step 1: Create `apps/web/components/settings/GroupPermissionsEditor.tsx`**

```tsx
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';
import { MODULE_REGISTRY } from '@vantage/modules';

interface GroupPermEntry {
  permission: string;
  granted: boolean;
}

interface Props {
  groupId: string;
}

export function GroupPermissionsEditor({ groupId }: Props) {
  const getToken = useApiToken();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['group', groupId],
    queryFn: async () =>
      apiFetch<{ data: { permissions: GroupPermEntry[]; members: unknown[] }; error: null }>(
        `/api/groups/${groupId}`,
        { token: await getToken() },
      ),
  });

  const mutation = useMutation({
    mutationFn: async ({ permission, granted }: { permission: string; granted: boolean }) => {
      const token = await getToken();
      return apiFetch(`/api/groups/${groupId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permission, granted }),
        token,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group', groupId] }),
  });

  if (isLoading || !data) {
    return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading permissions…</div>;
  }

  const permMap = new Map(data.data.permissions.map(p => [p.permission, p.granted]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {MODULE_REGISTRY.map(mod => (
        <div key={mod.id}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{mod.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mod.permissions.map(p => {
              const currentlyGranted = permMap.get(p.key) ?? false;
              const isSet = permMap.has(p.key);
              return (
                <div
                  key={p.key}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', background: 'var(--surface)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13 }}>{p.label}</span>
                    {isSet && (
                      <span style={{ fontSize: 10, background: 'var(--amber-bg)', color: 'var(--amber)', padding: '1px 5px', borderRadius: 3 }}>
                        Set
                      </span>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={currentlyGranted}
                    disabled={mutation.isPending}
                    onChange={e => mutation.mutate({ permission: p.key, granted: e.target.checked })}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/(dashboard)/settings/groups/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  member_count: number;
}

const PRESET_COLORS = ['#6b665c', '#2d6a4f', '#1e3a8a', '#92400e', '#991b1b', '#6d28d9'];

export default function GroupsPage() {
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState('#6b665c');

  const { data, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: async () =>
      apiFetch<{ data: Group[]; error: null }>('/api/groups', { token: await getToken() }),
  });

  const createGroup = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return apiFetch('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: newName, description: newDesc || undefined, color: newColor }),
        token,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setNewColor('#6b665c');
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return apiFetch(`/api/groups/${id}`, { method: 'DELETE', token });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  });

  const groups = data?.data ?? [];
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 7,
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Groups</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text2)' }}>
            Permission groups — members inherit group permissions.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--text)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
        >
          + Create Group
        </button>
      </div>

      {showCreate && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input style={inputStyle} placeholder="Group name *" value={newName} onChange={e => setNewName(e.target.value)} />
            <input style={inputStyle} placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>Color:</span>
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: newColor === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={() => createGroup.mutate()}
                disabled={!newName || createGroup.isPending}
                style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--text)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : groups.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>No groups yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groups.map(g => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: g.color }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</div>
                  {g.description && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{g.description}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{g.member_count} member{Number(g.member_count) !== 1 ? 's' : ''}</span>
                <Link href={`/settings/groups/${g.id}`} style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none' }}>Edit</Link>
                <button
                  onClick={() => { if (confirm(`Delete group "${g.name}"?`)) deleteGroup.mutate(g.id); }}
                  style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/app/(dashboard)/settings/groups/[groupId]/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { GroupPermissionsEditor } from '@/components/settings/GroupPermissionsEditor';
import type { User } from '@vantage/types';

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const getToken = useApiToken();
  const queryClient = useQueryClient();
  const [addUserId, setAddUserId] = useState('');

  const { data: groupData, isLoading } = useQuery({
    queryKey: ['group', groupId],
    queryFn: async () =>
      apiFetch<{
        data: {
          id: string; name: string; color: string; description: string | null;
          members: { id: string; name: string; email: string; role: string }[];
          permissions: { permission: string; granted: boolean }[];
        };
        error: null;
      }>(`/api/groups/${groupId}`, { token: await getToken() }),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () =>
      apiFetch<{ data: User[]; error: null }>('/api/users', { token: await getToken() }),
  });

  const addMember = useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      return apiFetch(`/api/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ userId }), token });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['group', groupId] });
      setAddUserId('');
    },
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      return apiFetch(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE', token });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group', groupId] }),
  });

  const group = groupData?.data;
  const allUsers = usersData?.data ?? [];
  const memberIds = new Set(group?.members.map(m => m.id) ?? []);
  const nonMembers = allUsers.filter(u => !memberIds.has(u.id));

  if (isLoading) return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;
  if (!group) return <div style={{ color: 'var(--text3)', fontSize: 13 }}>Group not found.</div>;

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Link href="/settings/groups" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none' }}>← Groups</Link>
        <span style={{ color: 'var(--text3)' }}>/</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: group.color }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{group.name}</span>
        </div>
      </div>

      {/* Members */}
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Members</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {group.members.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>No members yet.</div>
        ) : group.members.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{m.email}</span>
            </div>
            <button
              onClick={() => removeMember.mutate(m.id)}
              style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {nonMembers.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <select
            value={addUserId}
            onChange={e => setAddUserId(e.target.value)}
            style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
          >
            <option value="">Add a member…</option>
            {nonMembers.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
          <button
            onClick={() => addUserId && addMember.mutate(addUserId)}
            disabled={!addUserId || addMember.isPending}
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--text)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
          >
            Add
          </button>
        </div>
      )}

      {/* Permissions */}
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Permissions</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text2)' }}>
        Members of this group inherit these permissions on top of their role defaults.
      </p>
      <GroupPermissionsEditor groupId={groupId} />
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/settings/(users-groups)/groups/" apps/web/components/settings/GroupPermissionsEditor.tsx
git commit -m "feat: add Groups list + Group detail pages with member management and permission editor"
```

---

## Task 8: Invite Accept Page + Run Migration

**Files:**
- Create: `apps/web/app/invite/[token]/page.tsx`

- [ ] **Step 1: Create `apps/web/app/invite/[token]/page.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface InviteInfo {
  email: string;
  role: string;
  workspaceName: string;
}

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'success'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/invites/accept/${token}`)
      .then(r => r.json())
      .then((res: { data: InviteInfo; error: { code: string } | null }) => {
        if (res.error) {
          setErrorMsg(res.error.code === 'EXPIRED' ? 'This invite link has expired.' : res.error.code === 'ALREADY_ACCEPTED' ? 'This invite has already been accepted.' : 'Invalid invite link.');
          setStatus('error');
        } else {
          setInfo(res.data);
          setStatus('ready');
        }
      })
      .catch(() => { setErrorMsg('Failed to load invite.'); setStatus('error'); });
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setErrorMsg('Passwords do not match.'); return; }
    if (password.length < 8) { setErrorMsg('Password must be at least 8 characters.'); return; }
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/invites/accept/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json() as { error: { code: string } | null };
      if (data.error) { setErrorMsg(data.error.code); setSubmitting(false); return; }
      setStatus('success');
      setTimeout(() => router.push('/login'), 2000);
    } catch {
      setErrorMsg('Something went wrong. Try again.');
      setSubmitting(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)',
  };
  const boxStyle: React.CSSProperties = {
    width: 380, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 32,
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 7,
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
  };

  if (status === 'loading') return <div style={cardStyle}><div style={{ color: 'var(--text3)', fontSize: 14 }}>Loading…</div></div>;

  if (status === 'error') return (
    <div style={cardStyle}>
      <div style={boxStyle}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Invalid invite</div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>{errorMsg}</div>
      </div>
    </div>
  );

  if (status === 'success') return (
    <div style={cardStyle}>
      <div style={boxStyle}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Account created!</div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>Redirecting to sign in…</div>
      </div>
    </div>
  );

  return (
    <div style={cardStyle}>
      <div style={boxStyle}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Join {info?.workspaceName}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
            You were invited as <strong>{info?.email}</strong> ({info?.role}).
          </div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Your name</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} required placeholder="Full name" />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Password</label>
            <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Confirm password</label>
            <input style={inputStyle} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>

          {errorMsg && (
            <div style={{ fontSize: 13, color: 'var(--red)', background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 7 }}>
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{ padding: '9px 16px', borderRadius: 7, border: 'none', background: 'var(--text)', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginTop: 4 }}
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `/invite` to public paths in Next.js middleware**

Read `apps/web/middleware.ts`. Find:
```typescript
const PUBLIC_PATHS = ['/login', '/api/auth', '/api/config'];
```

Change to:
```typescript
const PUBLIC_PATHS = ['/login', '/invite', '/api/auth', '/api/config', '/api/invites/accept'];
```

- [ ] **Step 3: Run DB migration**

```bash
cd packages/db && npm run db:migrate
```

Expected: `✓ 20260602_002_users_groups` runs successfully.

- [ ] **Step 4: Verify full TypeScript build**

```bash
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/invite/ apps/web/middleware.ts
git commit -m "feat: add invite accept page, add /invite to public middleware paths"
```

---

## Self-Review Checklist

After all tasks complete, verify:

- [ ] `GET /api/groups` returns member_count correctly (COUNT aggregate)
- [ ] Permission resolution order: role defaults → group union → user overrides
- [ ] Admin users cannot be deactivated/removed if they're the last active admin
- [ ] Invite accept page at `/invite/[token]` is accessible without auth (middleware public paths)
- [ ] Settings "Users & Groups" tab shows for admins only
- [ ] `settings/users/[userId]/permissions` works (not the old `settings/team/` path)
- [ ] Group permissions editor saves to `/api/groups/:id/permissions` not `/api/users/:id/permissions`
