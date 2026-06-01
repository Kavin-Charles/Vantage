# Permission System + Modules Package Design

## Goal

Introduce a structured permission system where each action has a permission string defined by its module, users are checked against those permissions before actions execute, and admins can grant/revoke per-user overrides.

## Architecture

Five components interact to form the system:

1. **`packages/modules`** — shared package, single source of truth for module definitions and their permissions
2. **`user_permissions` DB table** — stores per-user permission overrides
3. **`permission.ts` middleware** — resolves effective permissions and gates API routes
4. **Route wiring** — `requirePermission(key)` added to all existing API routes
5. **Admin UI** — Permissions tab in user management for granting/revoking overrides

**Tech:** TypeScript strict, Kysely queries, Express middleware, Next.js App Router UI.

---

## 1. `packages/modules` Package

### Package identity

```json
{ "name": "@vantage/modules" }
```

Imported by both `apps/api` and `apps/web`.

### File structure

```
packages/modules/
  src/
    types.ts        # PermissionDef, ModuleDefinition, UserRole
    contacts.ts
    companies.ts
    pipelines.ts
    tasks.ts
    websites.ts
    servers.ts
    analytics.ts
    activity.ts
    index.ts        # registry, exported helpers
  package.json
  tsconfig.json
```

### Core types (`src/types.ts`)

```ts
export type UserRole = 'admin' | 'member';

export interface PermissionDef {
  key: string;           // e.g. 'contacts:create'
  label: string;         // e.g. 'Create contacts'
  defaultRoles: UserRole[];
}

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultEnabled: boolean;
  permissions: PermissionDef[];
  nav: { label: string; path: string; icon: string }[];
  apiPrefixes: string[];
  workers: string[];
}
```

### Permission key format

`{moduleId}:{action}` where action is one of: `view`, `create`, `edit`, `delete`.

### Default role assignments

| Action   | admin | member |
|----------|-------|--------|
| `view`   | ✓     | ✓      |
| `create` | ✓     | ✓      |
| `edit`   | ✓     | ✓      |
| `delete` | ✓     | ✗      |

Analytics and activity modules: members get `view` only (no create/edit/delete).

### Example module definition

```ts
export const CONTACTS_MODULE: ModuleDefinition = {
  id: 'contacts',
  name: 'Contacts',
  description: 'Contact management, profiles, and history.',
  icon: 'Users',
  defaultEnabled: true,
  permissions: [
    { key: 'contacts:view',   label: 'View contacts',   defaultRoles: ['admin', 'member'] },
    { key: 'contacts:create', label: 'Create contacts', defaultRoles: ['admin', 'member'] },
    { key: 'contacts:edit',   label: 'Edit contacts',   defaultRoles: ['admin', 'member'] },
    { key: 'contacts:delete', label: 'Delete contacts', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Contacts', path: '/contacts', icon: 'Users' }],
  apiPrefixes: ['/contacts'],
  workers: [],
};
```

### `index.ts` exports

- `MODULE_REGISTRY: ModuleDefinition[]`
- `MODULE_IDS: string[]`
- `getDefaultPermissionsForRole(role: UserRole): string[]`
- `getModuleForPermission(key: string): string | null` — returns moduleId
- All module constants (`CONTACTS_MODULE`, etc.)

### Backward compatibility

`apps/api/src/modules/manifests.ts` and `registry.ts` become thin re-exports from `@vantage/modules`. Existing `ModuleManifest` type aliased to `ModuleDefinition`.

Add `"@vantage/modules": "workspace:*"` to dependencies in both `apps/api/package.json` and `apps/web/package.json`.

---

## 2. Database

### Migration: `20260602_001_user_permissions.ts`

```sql
CREATE TABLE user_permissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission   varchar(255) NOT NULL,
  granted      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, permission)
);
```

### Schema additions (`packages/db/src/schema.ts`)

```ts
export interface UserPermissionTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  permission: string;
  granted: Generated<boolean>;
  created_at: Generated<Date>;
}
```

Add `user_permissions: UserPermissionTable` to `Database` interface. Export `UserPermission`, `NewUserPermission`, `UserPermissionUpdate` convenience types.

---

## 3. Permission Middleware

### File: `apps/api/src/middleware/permission.ts`

### Resolution algorithm

```
resolvePermissions(db, userId, workspaceId, role, enabledModuleIds):
  1. if role === 'admin' → return ADMIN_SENTINEL (bypass all checks)
  2. base = getDefaultPermissionsForRole('member')
  3. filter out permissions whose module is not in enabledModuleIds
  4. load user_permissions WHERE workspace_id=? AND user_id=? from DB
  5. for each override: granted=true → add key, granted=false → delete key
  6. cache result for 60s keyed by `{workspaceId}:{userId}`
  7. return Set<string>
```

### Cache invalidation

`invalidatePermissionCache(workspaceId, userId)` called on:
- Override upserted or deleted
- User role changed
- Module toggled (invalidate entire workspace: all users)

### Middleware factory

```ts
export function createRequirePermission(db: Kysely<Database>) {
  return function requirePermission(permission: string) {
    return async (req, res, next) => {
      const { user, workspace } = req as AuthenticatedRequest;
      // admin bypass
      if (user.role === 'admin') return next();
      const perms = await resolvePermissions(db, user.id, workspace.id, user.role, enabledModules);
      if (!perms.has(permission)) {
        return res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } });
      }
      next();
    };
  };
}
```

`enabledModuleIds` resolved by calling `isModuleEnabled` (imported from `middleware/module.ts`) for each module in `MODULE_IDS`, using the existing 60s cache.

---

## 4. Route Wiring

### Pattern

```ts
router.get('/contacts',     requireAuth, requireModule('contacts'), requirePermission('contacts:view'),   listHandler);
router.post('/contacts',    requireAuth, requireModule('contacts'), requirePermission('contacts:create'), createHandler);
router.patch('/contacts/:id', requireAuth, requireModule('contacts'), requirePermission('contacts:edit'),   updateHandler);
router.delete('/contacts/:id', requireAuth, requireModule('contacts'), requirePermission('contacts:delete'), deleteHandler);
```

### Modules wired

| Module    | Permissions wired                              |
|-----------|------------------------------------------------|
| contacts  | view, create, edit, delete                     |
| companies | view, create, edit, delete                     |
| pipelines | view, create, edit, delete (deals, stages, records) |
| tasks     | view, create, edit, delete                     |
| websites  | view, create, edit, delete                     |
| servers   | view, create, edit, delete                     |
| analytics | view                                           |
| activity  | view, create                                   |

---

## 5. Permission Management API

### File: `apps/api/src/routes/user-permissions.ts`

```
GET  /api/users/:id/permissions
  Auth: requireAuth + requireAdmin
  Response: {
    data: {
      permissions: {
        key: string,
        label: string,
        moduleId: string,
        moduleName: string,
        effectivelyGranted: boolean,
        isOverride: boolean,    // differs from role default
        moduleEnabled: boolean
      }[]
    }
  }

PUT  /api/users/:id/permissions
  Auth: requireAuth + requireAdmin
  Body: { permission: string, granted: boolean }
  → upsert user_permissions row, invalidate cache
  Response: { data: { permission, granted } }

DELETE /api/users/:id/permissions/:permission
  Auth: requireAuth + requireAdmin
  Note: permission key contains a colon — client must URL-encode it (e.g. contacts%3Acreate)
  → delete override row, invalidate cache
  Response: { data: null }
```

---

## 6. Admin UI

### Location

`/settings/users` → click user → "Permissions" tab (alongside existing profile/role info).

### Components

- **`apps/web/src/app/settings/users/[id]/permissions/page.tsx`** — page component, fetches `GET /api/users/:id/permissions`
- **`apps/web/src/components/user-permissions-editor.tsx`** — grouped permission list with toggles

### Layout

- Permissions grouped by module (one section per module)
- Disabled module sections grayed out with "Module disabled" badge
- Each permission row: label + toggle
- Toggle shows "Override" badge if value differs from role default
- If user is admin: show "Admin — full access" banner, no toggles rendered
- Save is per-toggle (immediate PUT on change), no submit button

---

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Permissions location | `packages/modules` | Single source of truth, shared by API + web |
| Admin bypass | Yes, skip middleware entirely | Admins must never be locked out |
| Module disabled → permissions | Blocked at resolution time | Consistent with module gating already in place |
| Per-user overrides | `user_permissions` table | Allows fine-grained member customization |
| Cache TTL | 60s | Matches existing module cache, acceptable staleness |
