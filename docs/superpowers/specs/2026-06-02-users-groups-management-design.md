# Users & Groups Management Design

## Goal

Replace the Settings > Team tab with a full Users & Groups management page: invite/deactivate/remove users, create permission groups, assign users to groups, and have group permissions union with per-user overrides in the existing permission system.

## Architecture

Five components:

1. **DB** — `groups`, `group_members`, `group_permissions` tables + `is_active` on `users` + `invites` table
2. **Permission resolver update** — `resolvePermissions` merges group permissions before applying user overrides
3. **Groups + Invites API** — new route files for group CRUD, membership, group permissions, and invite flow
4. **User management API** — extend existing `users.ts` with deactivate, remove, groups listing
5. **Frontend** — Settings tab renamed "Users & Groups", internal sub-nav Users | Groups

---

## DB Schema

### Migration: `20260602_002_users_groups.ts`

```sql
-- Soft deactivate
ALTER TABLE users ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Groups
CREATE TABLE groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         varchar(100) NOT NULL,
  description  text,
  color        varchar(7) NOT NULL DEFAULT '#6b665c',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

-- Group members
CREATE TABLE group_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  group_id     uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

-- Group permissions (same shape as user_permissions)
CREATE TABLE group_permissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  group_id     uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  permission   varchar(255) NOT NULL,
  granted      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, permission)
);

-- Invite tokens
CREATE TABLE invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        varchar(255) NOT NULL,
  token        varchar(64) NOT NULL UNIQUE,
  invited_by   uuid NOT NULL REFERENCES users(id),
  role         varchar(20) NOT NULL DEFAULT 'member',
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

### Kysely schema additions (`packages/db/src/schema.ts`)

```typescript
// Add to UserTable:
is_active: Generated<boolean>;

// New tables:
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

Add all four to `Database` interface. Export convenience types for each.

---

## Permission Resolution

### Updated order in `apps/api/src/middleware/permission.ts`

```
1. if role === 'admin'        → ADMIN_SENTINEL (bypass)
2. base = role defaults filtered by enabled modules
3. load group_members WHERE user_id = userId
4. for each group: load group_permissions WHERE group_id = groupId
5. apply group perms (granted=true → add, granted=false → remove from base)
6. load user_permissions WHERE user_id = userId
7. apply user overrides on top (user wins over group)
8. cache result 60s
```

### Auth middleware update

In `requireAuth` (`apps/api/src/middleware/auth.ts`): after loading user, check `is_active`. If `false` → `401 { code: 'ACCOUNT_DISABLED' }`.

### New cache invalidation helper

```typescript
// Must be awaited — queries DB for group members
export async function invalidateGroupMemberCaches(
  db: Kysely<Database>,
  workspaceId: string,
  groupId: string,
): Promise<void> {
  // load all user_ids in group, call invalidatePermissionCache for each
  const members = await db
    .selectFrom('group_members')
    .where('group_id', '=', groupId)
    .select('user_id')
    .execute();
  for (const m of members) {
    invalidatePermissionCache(workspaceId, m.user_id);
  }
}
```

Called on: group permission change, group member add/remove.

---

## API Routes

### Groups (`apps/api/src/routes/groups.ts`) — admin-only

```
GET    /api/groups                         list groups (id, name, color, memberCount)
POST   /api/groups                         create {name, description?, color?}
GET    /api/groups/:id                     group + members[] + permissions[]
PATCH  /api/groups/:id                     update {name?, description?, color?}
DELETE /api/groups/:id                     delete (cascade members + perms)
POST   /api/groups/:id/members             add member {userId}
DELETE /api/groups/:id/members/:userId     remove member
PUT    /api/groups/:id/permissions         upsert {permission, granted}
DELETE /api/groups/:id/permissions/:perm   remove permission override
```

All responses follow `{ data: ..., error: null }` / `{ data: null, error: { code, message } }`.

### User management extensions (`apps/api/src/routes/users.ts`)

```
PATCH  /api/users/:id          update {name?, email?, role?, is_active?}
DELETE /api/users/:id          remove user (guards: no self-remove, must leave ≥1 admin)
GET    /api/users/:id/groups   list groups user belongs to
```

### Invites (`apps/api/src/routes/invites.ts`)

```
POST /api/invites                     create invite (admin only)
  Body: { email, role? }
  - If SMTP configured: generate token via `crypto.randomBytes(32).toString('hex')` (64-char hex), store invite, send email → return { data: { inviteId } }
  - If no SMTP: create user directly → return { data: { user, tempPassword } }

GET  /api/invites/accept/:token       get invite info — email + workspaceName (public)
POST /api/invites/accept/:token       accept invite (public)
  Body: { name, password }
  → create user, mark invite accepted_at, return JWT
```

Invite tokens expire in 72 hours. Accepting an expired token → 410 GONE.

### `index.ts` additions

```typescript
import { createGroupsRouter } from './routes/groups';
import { createInvitesRouter } from './routes/invites';

app.use('/api/groups', requireAuth, requireAdmin, createGroupsRouter(db));
app.use('/api/invites', createInvitesRouter(db, config.smtp));
```

---

## Frontend

### Settings tab rename

In `apps/web/app/(dashboard)/settings/layout.tsx`: rename "Team" tab to "Users & Groups", update href to `/settings/users`.

### Pages

```
apps/web/app/(dashboard)/settings/users/page.tsx                      Users sub-page
apps/web/app/(dashboard)/settings/users/layout.tsx                    Sub-nav: Users | Groups
apps/web/app/(dashboard)/settings/users/[userId]/permissions/page.tsx  User permissions (moved from settings/team/...)
apps/web/app/(dashboard)/settings/groups/page.tsx                     Groups sub-page
apps/web/app/(dashboard)/settings/groups/[groupId]/page.tsx           Group detail
apps/web/app/invite/[token]/page.tsx                                  Public invite accept page
```

Note: existing `settings/team/[userId]/permissions/page.tsx` is moved to `settings/users/[userId]/permissions/page.tsx`. Breadcrumb updates from "← Team" to "← Users".

### Components

```
apps/web/components/settings/InviteUserModal.tsx    Invite modal (SMTP vs direct)
apps/web/components/settings/UserRow.tsx            Table row: name/email/role/status/groups/actions
apps/web/components/settings/GroupList.tsx          Group list with color dots + counts
apps/web/components/settings/GroupDetail.tsx        Members list + GroupPermissionsEditor
apps/web/components/settings/GroupPermissionsEditor.tsx  Permission toggles backed by group endpoints
```

### Users sub-page layout

- Topbar: "Users" heading + "Invite User" button
- Table columns: User (avatar + name + email) | Role | Status | Groups | Actions
- Actions menu per row: Edit Role | Deactivate / Reactivate | Permissions | Remove
- Deactivated rows: muted opacity, "Inactive" badge
- Remove: confirm dialog. Can't remove self or last admin (button disabled + tooltip).

### Groups sub-page layout

- Topbar: "Groups" heading + "Create Group" button
- List: color circle + name + member count + "N permissions" label + Edit / Delete actions
- Create group: inline form — name (required), description (optional), color picker (6 preset colors)

### Group detail page

- Breadcrumb: ← Groups / {group name}
- Members section: user list + "Add Member" (dropdown of workspace users not already in group) + remove button
- Permissions section: `GroupPermissionsEditor` — same checkbox UX as `UserPermissionsEditor`, calls `PUT/DELETE /api/groups/:id/permissions`

### Invite accept page (`/invite/[token]`)

- Public page (no auth required)
- Fetches `GET /api/invites/accept/:token` → shows workspace name + invited email
- Form: name + password + confirm password
- On submit: `POST /api/invites/accept/:token` → redirects to `/login`

### `@vantage/api-client` additions

- `packages/api-client/src/groups.ts` — `listGroups`, `getGroup`, `createGroup`, `updateGroup`, `deleteGroup`, `addGroupMember`, `removeGroupMember`, `setGroupPermission`, `deleteGroupPermission`
- `packages/api-client/src/invites.ts` — `createInvite`, `getInviteInfo`, `acceptInvite`
- Export both from `packages/api-client/src/index.ts`

---

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Groups concept | Permission groups | Users inherit group perms |
| Permission order | role defaults → group union → user overrides | User-level most specific |
| Invite flow | SMTP if configured, direct create fallback | Works without email infra |
| Deactivate | `is_active` flag, 401 in requireAuth | Preserves historical records |
| Hard delete guard | No self-remove, must have ≥1 active admin | Prevent lockout |
| Groups UI | Sub-page under Settings | Co-located with Users, clean tab count |
| Invite token expiry | 72 hours | Long enough for async onboarding |
