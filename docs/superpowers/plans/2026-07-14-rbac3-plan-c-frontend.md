# RBAC3 — Plan C: Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the crashing per-user/group permission editors with a role-centric UI — roles list, role detail (permission matrix + members + inheritance DAG), user role-assignment + effective-permission view, SoD constraint config, and a topbar active-role switcher — all gated by resolved permissions and styled to the real design system in light and dark.

**Architecture:** New route tree under `/settings/roles` and `/settings/users`; the orphaned `/settings/team/*` routes redirect to canonical. `AuthContext` already exposes `hasPermission`; only the `role`→`isAdmin` line changes. Rebuilt components live in `apps/web/modules/settings/components/`; old `PermissionBlock` / `UserPermissionsEditor` / `GroupPermissionsEditor` and both `[userId]/permissions` pages are deleted. All data flows through `@vencore/api-client` role functions (Plan B).

**Tech Stack:** Next.js App Router, React, TanStack Query, Redux (auth slice), `@vencore/api-client`, CSS variables from `apps/web/app/globals.css`.

## Global Constraints

- **Depends on Plan A + Plan B merged.**
- Match `apps/web/app/globals.css` tokens: IBM Plex Sans (body/display), IBM Plex Mono (permission keys), ink-blue text ladder, `--surface`/`--surface2`/`--border`/`--border2`, `--radius-*`, `--shadow-hover`/`--shadow-modal`, `--transition`/`--motion-*`. **No hardcoded colors** — tokens only, so light + dark both work.
- Reuse existing utilities `.skeleton` (loaders) and `.fade-in` (mount). No "Loading…" text.
- Follow the existing inline-style-with-CSS-var idiom seen in `apps/web/app/(dashboard)/settings/**` pages; extract repeated markup into components.
- Gate admin-only settings by `hasPermission('<x>:manage')`, not by role.
- Spec: `docs/superpowers/specs/2026-07-14-permissions-rbac3-rework-design.md` §9.
- Branch: `feat/permissions-rbac3`. Commit after every task. Verify in the browser preview (dev server) after UI tasks.

---

## File Structure

- `apps/web/modules/shared/lib/AuthContext.tsx` — `user.role==='admin'` → `user.isAdmin`.
- `apps/web/store/auth-slice.ts` — `AuthUser` gains `isAdmin: boolean`, keeps `permissions: string[]`, drops `role`.
- `apps/web/app/(dashboard)/settings/layout.tsx` — relabel "Users & Groups"→"Users & Roles"; gate links by permission.
- `apps/web/app/(dashboard)/settings/(users-roles)/layout.tsx` — sub-tabs Users | Roles | Constraints (renamed dir).
- `apps/web/app/(dashboard)/settings/(users-roles)/roles/page.tsx` — roles list.
- `.../roles/[id]/page.tsx` — role detail.
- `.../roles/constraints/page.tsx` — SoD sets.
- `.../users/page.tsx` — users list (+ roles column).
- `.../users/[id]/page.tsx` — user detail (assignment + effective view).
- `apps/web/app/(dashboard)/settings/team/**` → redirect stubs.
- Components: `RoleMatrixEditor.tsx`, `PermissionRow.tsx`, `RoleMembersPanel.tsx`, `RoleInheritancePanel.tsx`, `ConstraintSetEditor.tsx`, `UserRoleAssignment.tsx`, `EffectivePermissionsView.tsx`, `RoleBadges.tsx`.
- `apps/web/modules/shared/components/ActiveRoleSwitcher.tsx` — topbar popover; mounted in `Topbar`.
- Delete: `PermissionBlock.tsx`, `UserPermissionsEditor.tsx`, `GroupPermissionsEditor.tsx`, old `groups` + `[userId]/permissions` pages.

---

### Task 1: AuthContext + auth-slice on the isAdmin model

**Files:**
- Modify: `apps/web/store/auth-slice.ts`
- Modify: `apps/web/modules/shared/lib/AuthContext.tsx`

**Interfaces:**
- Produces: `AuthUser = { id: string; name: string; email: string; isAdmin: boolean; permissions: string[] }`; `hasPermission(key)` returns true if `isAdmin` or `permissions.includes(key)`.

- [ ] **Step 1: Update `AuthUser`**

```ts
// apps/web/store/auth-slice.ts — the AuthUser interface
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  permissions: string[];
}
```

- [ ] **Step 2: Update `hasPermission` + `/api/me` consumption**

```tsx
// apps/web/modules/shared/lib/AuthContext.tsx
const fetchUser = async () => {
  if (!token) return;
  try {
    const res = await apiFetch<{ data: { user: { id: string; name: string; email: string }; isAdmin: boolean; permissions: string[] } }>('/api/me', { token });
    dispatch(setUser({ ...res.data.user, isAdmin: res.data.isAdmin, permissions: res.data.permissions }));
  } catch {
    dispatch(clearAuth());
  }
};

const hasPermission = (key: string): boolean => {
  if (!user) return false;
  if (user.isAdmin) return true;
  return (user.permissions ?? []).includes(key);
};
```

- [ ] **Step 3: Typecheck web**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: errors only where other files still read `user.role` (fixed in later tasks); auth files compile.

- [ ] **Step 4: Commit**

```bash
git add apps/web/store/auth-slice.ts apps/web/modules/shared/lib/AuthContext.tsx
git commit -m "feat(web): auth context on isAdmin + resolved permissions"
```

---

### Task 2: Settings nav relabel + permission gating + route rename

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/layout.tsx`
- Rename dir: `settings/(users-groups)` → `settings/(users-roles)`; update its `layout.tsx` sub-tabs.

**Interfaces:**
- Produces: nav link "Users & Roles" → `/settings/users`; `adminOnly` groups gated by `hasPermission`.

- [ ] **Step 1: Relabel + add Roles/Constraints awareness**

```tsx
// settings/layout.tsx — Workspace group link label
{ href: '/settings/users', label: 'Users & Roles' },
```
```tsx
// isActive helper: treat /settings/roles and /settings/users as the same section
function isActive(pathname: string, href: string): boolean {
  if (pathname.startsWith(href)) return true;
  if (href === '/settings/users' && (pathname.startsWith('/settings/roles') || pathname.startsWith('/settings/groups'))) return true;
  return false;
}
```

- [ ] **Step 2: Gate admin-only links by permission instead of role**

```tsx
// settings/layout.tsx — replace the isAdmin-only visibility with per-link permission keys.
const { hasPermission } = useAuth();
// Map each adminOnly link to its guard key:
const LINK_PERMISSION: Record<string, string> = {
  '/settings/workspace': 'workspace:manage',
  '/settings/users': 'users:manage',
  '/settings/notifications': 'workspace:manage',
  '/settings/modules': 'modules:manage',
  '/settings/plugins': 'plugins:manage',
  '/settings/api-keys': 'apikeys:manage',
  '/settings/ssh': 'workspace:manage',
  '/settings/integrations': 'integrations:manage',
  '/settings/updates': 'workspace:manage',
};
// A workspace-group link is visible when the user has its key (isAdmin covers all).
const canSee = (href: string) => !(href in LINK_PERMISSION) || hasPermission(LINK_PERMISSION[href]);
// In the render, filter group.links by canSee; keep the redirect effect but base it on hasPermission for the current path's key.
```

- [ ] **Step 3: Rename the route group dir + sub-tabs**

```bash
git mv "apps/web/app/(dashboard)/settings/(users-groups)" "apps/web/app/(dashboard)/settings/(users-roles)"
```
```tsx
// settings/(users-roles)/layout.tsx — sub tabs
const SUB_TABS = [
  { href: '/settings/users', label: 'Users', exact: true },
  { href: '/settings/roles', label: 'Roles' },
  { href: '/settings/roles/constraints', label: 'Constraints' },
];
```

- [ ] **Step 4: Verify in browser**

Start the dev server (preview), open `/settings/users`; confirm the sub-tabs render Users | Roles | Constraints and the nav label reads "Users & Roles". Check both themes via the theme toggle.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/settings"
git commit -m "feat(web): settings nav relabel, permission gating, users-roles route group"
```

---

### Task 3: `RoleBadges` + roles list page

**Files:**
- Create: `apps/web/modules/settings/components/RoleBadges.tsx`
- Create: `apps/web/app/(dashboard)/settings/(users-roles)/roles/page.tsx`
- Delete: old `settings/(users-roles)/groups/page.tsx` (if carried over by the rename) and `groups/[groupId]/page.tsx`.

**Interfaces:**
- Consumes: `listRoles`, `createRole`, `RoleSummary` from `@vencore/api-client`.
- Produces: `RoleBadges({ role })` renders System/Administrator/Default pills; roles list links each row to `/settings/roles/[id]`.

- [ ] **Step 1: RoleBadges component**

```tsx
// apps/web/modules/settings/components/RoleBadges.tsx
'use client';
import type { RoleSummary } from '@vencore/api-client';

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: bg, color: fg }}>
      {label}
    </span>
  );
}

export function RoleBadges({ role }: { role: Pick<RoleSummary, 'is_system' | 'grants_all' | 'is_default'> }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      {role.grants_all && <Pill label="Administrator" bg="var(--blue-bg)" fg="var(--blue)" />}
      {role.is_default && <Pill label="Default" bg="var(--green-bg)" fg="var(--green)" />}
      {role.is_system && <Pill label="System" bg="var(--purple-bg)" fg="var(--purple)" />}
    </span>
  );
}
```

- [ ] **Step 2: Roles list page**

```tsx
// apps/web/app/(dashboard)/settings/(users-roles)/roles/page.tsx
'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listRoles, createRole } from '@vencore/api-client';
import { RoleBadges } from '@/modules/settings/components/RoleBadges';

export default function RolesPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => listRoles(await getToken()),
  });

  const create = useMutation({
    mutationFn: async (n: string) => createRole(await getToken(), { name: n, copyDefaults: true }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['roles'] }); setName(''); },
  });

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Roles</h2>
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) create.mutate(name.trim()); }} style={{ display: 'flex', gap: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="New role name"
            style={{ padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} />
          <button type="submit" disabled={!name.trim() || create.isPending}
            style={{ padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: 13, cursor: 'pointer' }}>
            Create
          </button>
        </form>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 56 }} />)}
        </div>
      ) : (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data?.data.map(role => (
            <Link key={role.id} href={`/settings/roles/${role.id}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                textDecoration: 'none', color: 'var(--text)', transition: 'var(--transition)' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-hover)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: role.color }} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>{role.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{Number(role.member_count)} members</span>
              </span>
              <RoleBadges role={role} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Delete carried-over group pages**

```bash
git rm "apps/web/app/(dashboard)/settings/(users-roles)/groups/page.tsx" "apps/web/app/(dashboard)/settings/(users-roles)/groups/[groupId]/page.tsx"
```

- [ ] **Step 4: Verify in browser**

Open `/settings/roles`; Administrator + Member show with badges; create a role; skeletons appear during load; check dark theme.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/settings" apps/web/modules/settings/components/RoleBadges.tsx
git commit -m "feat(web): roles list page + role badges"
```

---

### Task 4: `RoleMatrixEditor` + `PermissionRow`

**Files:**
- Create: `apps/web/modules/settings/components/PermissionRow.tsx`
- Create: `apps/web/modules/settings/components/RoleMatrixEditor.tsx`
- Delete: `apps/web/modules/settings/components/PermissionBlock.tsx`

**Interfaces:**
- Consumes: `getRole`, `setRolePermissions`, `GroupedModule`.
- Produces:
  - `PermissionRow({ perm, disabled, onToggle })` — a labelled toggle; inherited rows render muted with a chain glyph and are read-only.
  - `RoleMatrixEditor({ roleId })` — renders module → sub-feature groups, search filter, per-group tri-state bulk toggle, single-permission PUT on toggle.

- [ ] **Step 1: PermissionRow**

```tsx
// apps/web/modules/settings/components/PermissionRow.tsx
'use client';
import type { GroupedPermission } from '@vencore/api-client';

export function PermissionRow({ perm, onToggle }: { perm: GroupedPermission; onToggle: (key: string, granted: boolean) => void }) {
  const inherited = perm.inherited;
  const on = perm.granted || perm.inherited;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px',
      borderRadius: 'var(--radius-sm)', background: 'var(--surface2)', opacity: inherited ? 0.75 : 1 }}>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>{perm.key}</code>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{perm.label}{inherited ? ' · inherited' : ''}</span>
      </span>
      <button
        onClick={() => !inherited && onToggle(perm.key, !perm.granted)}
        disabled={inherited}
        aria-label={inherited ? 'inherited' : on ? 'granted' : 'not granted'}
        style={{ position: 'relative', width: 36, height: 20, borderRadius: 'var(--radius-pill)',
          background: on ? 'var(--green)' : 'var(--border2)', border: 'none',
          cursor: inherited ? 'default' : 'pointer', flexShrink: 0, transition: 'var(--transition)' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%',
          background: '#fff', transition: 'left var(--motion-fast) var(--motion-ease)' }} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: RoleMatrixEditor**

```tsx
// apps/web/modules/settings/components/RoleMatrixEditor.tsx
'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRole, setRolePermissions } from '@vencore/api-client';
import { PermissionRow } from './PermissionRow';

export function RoleMatrixEditor({ roleId }: { roleId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['role', roleId],
    queryFn: async () => getRole(await getToken(), roleId),
  });

  const toggle = useMutation({
    mutationFn: async ({ permission, granted }: { permission: string; granted: boolean }) =>
      setRolePermissions(await getToken(), roleId, { permission, granted }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['role', roleId] }),
  });

  const modules = useMemo(() => {
    const mods = data?.data.modules ?? [];
    if (!q.trim()) return mods;
    const needle = q.toLowerCase();
    return mods
      .map(m => ({ ...m, groups: m.groups
        .map(g => ({ ...g, permissions: g.permissions.filter(p => p.key.includes(needle) || p.label.toLowerCase().includes(needle)) }))
        .filter(g => g.permissions.length) }))
      .filter(m => m.groups.length);
  }, [data, q]);

  if (isLoading) return <div className="skeleton" style={{ height: 240 }} />;

  const grantAll = (keys: string[], granted: boolean) => keys.forEach(k => toggle.mutate({ permission: k, granted }));

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search permissions…"
        style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} />
      {modules.map(mod => (
        <div key={mod.id}>
          <p style={{ position: 'sticky', top: 0, background: 'var(--bg)', margin: '0 0 8px', fontSize: 13, fontWeight: 700, zIndex: 1 }}>{mod.name}</p>
          {mod.groups.map(g => {
            const editable = g.permissions.filter(p => !p.inherited);
            const allOn = editable.length > 0 && editable.every(p => p.granted);
            const someOn = editable.some(p => p.granted);
            return (
              <div key={g.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{g.label}</span>
                  <button onClick={() => grantAll(editable.map(p => p.key), !allOn)}
                    style={{ fontSize: 11, color: 'var(--text2)', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '2px 8px', cursor: 'pointer' }}>
                    {allOn ? 'Clear all' : someOn ? 'Grant rest' : 'Grant all'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {g.permissions.map(p => (
                    <PermissionRow key={p.key} perm={p} onToggle={(permission, granted) => toggle.mutate({ permission, granted })} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Delete old PermissionBlock**

```bash
git rm apps/web/modules/settings/components/PermissionBlock.tsx
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/settings/components/PermissionRow.tsx apps/web/modules/settings/components/RoleMatrixEditor.tsx
git commit -m "feat(web): role permission matrix editor with sub-feature groups + inherited rows"
```

---

### Task 5: `RoleMembersPanel` + `RoleInheritancePanel` + role detail page

**Files:**
- Create: `apps/web/modules/settings/components/RoleMembersPanel.tsx`
- Create: `apps/web/modules/settings/components/RoleInheritancePanel.tsx`
- Create: `apps/web/app/(dashboard)/settings/(users-roles)/roles/[id]/page.tsx`
- Delete: `apps/web/modules/settings/components/GroupPermissionsEditor.tsx`

**Interfaces:**
- Consumes: `getRole`, `addRoleMember`, `removeRoleMember`, `addInheritance`, `removeInheritance`, `listRoles`, `deleteRole`, `updateRole`.
- Produces: role detail with header (name/color/max_members, system locks), tabs Permissions | Members | Inheritance.

- [ ] **Step 1: RoleMembersPanel**

```tsx
// apps/web/modules/settings/components/RoleMembersPanel.tsx
'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRole, addRoleMember, removeRoleMember } from '@vencore/api-client';
import { apiFetch } from '@/modules/shared/lib/api';
import type { User } from '@vencore/types';

export function RoleMembersPanel({ roleId }: { roleId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [addId, setAddId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const role = useQuery({ queryKey: ['role', roleId], queryFn: async () => getRole(await getToken(), roleId) });
  const users = useQuery({ queryKey: ['users'], queryFn: async () => apiFetch<{ data: User[] }>('/api/users', { token: await getToken() }) });

  const add = useMutation({
    mutationFn: async (userId: string) => addRoleMember(await getToken(), roleId, userId),
    onSuccess: () => { setError(null); setAddId(''); void qc.invalidateQueries({ queryKey: ['role', roleId] }); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not add member'),
  });
  const remove = useMutation({
    mutationFn: async (userId: string) => removeRoleMember(await getToken(), roleId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['role', roleId] }),
  });

  const members = role.data?.data.members ?? [];
  const memberIds = new Set(members.map(m => m.id));
  const nonMembers = (users.data?.data ?? []).filter(u => !memberIds.has(u.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {members.map(m => (
        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ fontSize: 13 }}>{m.name} <span style={{ color: 'var(--text3)', marginLeft: 6 }}>{m.email}</span></span>
          <button onClick={() => remove.mutate(m.id)} style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
        </div>
      ))}
      {error && <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>{error}</div>}
      {nonMembers.length > 0 && (
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={addId} onChange={e => setAddId(e.target.value)} style={{ flex: 1, padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}>
            <option value="">Add a member…</option>
            {nonMembers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
          <button onClick={() => addId && add.mutate(addId)} disabled={!addId || add.isPending} style={{ padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: 13, cursor: 'pointer' }}>Add</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: RoleInheritancePanel (DAG-aware add/remove; read-only tree lives on the detail header)**

```tsx
// apps/web/modules/settings/components/RoleInheritancePanel.tsx
'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRole, listRoles, addInheritance, removeInheritance } from '@vencore/api-client';

export function RoleInheritancePanel({ roleId }: { roleId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [childId, setChildId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const role = useQuery({ queryKey: ['role', roleId], queryFn: async () => getRole(await getToken(), roleId) });
  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => listRoles(await getToken()) });

  const add = useMutation({
    mutationFn: async (child: string) => addInheritance(await getToken(), roleId, child),
    onSuccess: () => { setError(null); setChildId(''); void qc.invalidateQueries({ queryKey: ['role', roleId] }); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Cannot add (cycle or SoD conflict)'),
  });
  const remove = useMutation({
    mutationFn: async (child: string) => removeInheritance(await getToken(), roleId, child),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['role', roleId] }),
  });

  const children = role.data?.data.inheritance.children ?? [];
  const byId = new Map((roles.data?.data ?? []).map(r => [r.id, r.name]));
  const candidates = (roles.data?.data ?? []).filter(r => r.id !== roleId && !children.includes(r.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>This role inherits all permissions of its child roles.</p>
      {children.map(c => (
        <div key={c} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ fontSize: 13 }}>↳ {byId.get(c) ?? c}</span>
          <button onClick={() => remove.mutate(c)} style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
        </div>
      ))}
      {error && <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>{error}</div>}
      {candidates.length > 0 && (
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={childId} onChange={e => setChildId(e.target.value)} style={{ flex: 1, padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}>
            <option value="">Inherit a role…</option>
            {candidates.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button onClick={() => childId && add.mutate(childId)} disabled={!childId || add.isPending} style={{ padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: 13, cursor: 'pointer' }}>Add</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Role detail page (tabbed)**

```tsx
// apps/web/app/(dashboard)/settings/(users-roles)/roles/[id]/page.tsx
'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getRole } from '@vencore/api-client';
import { RoleMatrixEditor } from '@/modules/settings/components/RoleMatrixEditor';
import { RoleMembersPanel } from '@/modules/settings/components/RoleMembersPanel';
import { RoleInheritancePanel } from '@/modules/settings/components/RoleInheritancePanel';
import { RoleBadges } from '@/modules/settings/components/RoleBadges';

type Tab = 'permissions' | 'members' | 'inheritance';

export default function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const [tab, setTab] = useState<Tab>('permissions');
  const { data } = useQuery({ queryKey: ['role', id], queryFn: async () => getRole(await getToken(), id) });
  const role = data?.data;

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Link href="/settings/roles" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none' }}>← Roles</Link>
        {role && <>
          <span style={{ color: 'var(--text3)' }}>/</span>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: role.color }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{role.name}</span>
          <RoleBadges role={role} />
        </>}
      </div>

      {role?.grants_all ? (
        <div style={{ padding: 16, background: 'var(--surface2)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text2)' }}>
          The Administrator role grants full access to everything. Its permissions are not editable.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
            {(['permissions', 'members', 'inheritance'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: '6px 14px', fontSize: 13, fontWeight: 500, textTransform: 'capitalize',
                  color: tab === t ? 'var(--text)' : 'var(--text3)', background: 'none', border: 'none',
                  borderBottom: tab === t ? '2px solid var(--text)' : '2px solid transparent', marginBottom: -1, cursor: 'pointer' }}>
                {t}
              </button>
            ))}
          </div>
          {tab === 'permissions' && <RoleMatrixEditor roleId={id} />}
          {tab === 'members' && <RoleMembersPanel roleId={id} />}
          {tab === 'inheritance' && <RoleInheritancePanel roleId={id} />}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Delete old GroupPermissionsEditor**

```bash
git rm apps/web/modules/settings/components/GroupPermissionsEditor.tsx
```

- [ ] **Step 5: Verify in browser**

Open a role; toggle a permission (persists on refetch); add/remove a member; add an inheritance edge and confirm inherited rows appear muted in the matrix; try a cycle and confirm the inline error. Both themes.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(dashboard)/settings" apps/web/modules/settings/components/RoleMembersPanel.tsx apps/web/modules/settings/components/RoleInheritancePanel.tsx
git commit -m "feat(web): role detail — permissions, members, inheritance"
```

---

### Task 6: `UserRoleAssignment` + `EffectivePermissionsView` + user detail page

**Files:**
- Create: `apps/web/modules/settings/components/UserRoleAssignment.tsx`
- Create: `apps/web/modules/settings/components/EffectivePermissionsView.tsx`
- Create: `apps/web/app/(dashboard)/settings/(users-roles)/users/[id]/page.tsx`
- Delete: `apps/web/modules/settings/components/UserPermissionsEditor.tsx`, `settings/(users-roles)/users/[userId]/permissions/page.tsx`, `settings/team/[userId]/permissions/page.tsx`.

**Interfaces:**
- Consumes: `getUserRoles`, `setUserRoles`, `listRoles`.
- Produces: user detail page — multi-select role assignment (SSD/cardinality errors inline) + read-only effective-permission view grouped, plus isAdmin indicator.

- [ ] **Step 1: UserRoleAssignment**

```tsx
// apps/web/modules/settings/components/UserRoleAssignment.tsx
'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getUserRoles, setUserRoles, listRoles } from '@vencore/api-client';

export function UserRoleAssignment({ userId }: { userId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const assigned = useQuery({ queryKey: ['user-roles', userId], queryFn: async () => getUserRoles(await getToken(), userId) });
  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => listRoles(await getToken()) });

  const save = useMutation({
    mutationFn: async (roleIds: string[]) => setUserRoles(await getToken(), userId, roleIds),
    onSuccess: () => { setError(null); void qc.invalidateQueries({ queryKey: ['user-roles', userId] }); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Assignment blocked by a separation-of-duty rule'),
  });

  const current = new Set(assigned.data?.data.roleIds ?? []);
  const toggle = (roleId: string) => {
    const next = new Set(current);
    next.has(roleId) ? next.delete(roleId) : next.add(roleId);
    save.mutate([...next]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(roles.data?.data ?? []).map(r => (
        <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
          <input type="checkbox" checked={current.has(r.id)} onChange={() => toggle(r.id)} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.color }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
        </label>
      ))}
      {error && <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>{error}</div>}
    </div>
  );
}
```

- [ ] **Step 2: EffectivePermissionsView (read-only, grouped)**

```tsx
// apps/web/modules/settings/components/EffectivePermissionsView.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getUserRoles } from '@vencore/api-client';

export function EffectivePermissionsView({ userId }: { userId: string }) {
  const getToken = useApiToken();
  const { data, isLoading } = useQuery({ queryKey: ['user-roles', userId], queryFn: async () => getUserRoles(await getToken(), userId) });
  if (isLoading) return <div className="skeleton" style={{ height: 160 }} />;
  if (data?.data.isAdmin) return <div style={{ padding: 16, background: 'var(--surface2)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text2)' }}>This user is an Administrator — full access.</div>;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {(data?.data.modules ?? []).map(mod => {
        const granted = mod.groups.flatMap(g => g.permissions).filter(p => p.granted);
        if (!granted.length) return null;
        return (
          <div key={mod.id}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>{mod.name}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {granted.map(p => (
                <code key={p.key} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--green-bg)', color: 'var(--green)' }}>{p.key}</code>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: User detail page**

```tsx
// apps/web/app/(dashboard)/settings/(users-roles)/users/[id]/page.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import type { User } from '@vencore/types';
import { UserRoleAssignment } from '@/modules/settings/components/UserRoleAssignment';
import { EffectivePermissionsView } from '@/modules/settings/components/EffectivePermissionsView';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const { data } = useQuery({ queryKey: ['users'], queryFn: async () => apiFetch<{ data: User[] }>('/api/users', { token: await getToken() }) });
  const user = data?.data?.find(u => u.id === id);

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <Link href="/settings/users" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none' }}>← Users</Link>
        {user && <><span style={{ color: 'var(--text3)' }}>/</span><span style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</span></>}
      </div>

      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Roles</h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text2)' }}>Assign roles. All access comes from roles — there are no per-user overrides.</p>
      <UserRoleAssignment userId={id} />

      <h3 style={{ margin: '24px 0 12px', fontSize: 14, fontWeight: 600 }}>Effective permissions</h3>
      <EffectivePermissionsView userId={id} />
    </div>
  );
}
```

- [ ] **Step 4: Delete old editor + permission pages**

```bash
git rm apps/web/modules/settings/components/UserPermissionsEditor.tsx \
  "apps/web/app/(dashboard)/settings/(users-roles)/users/[userId]/permissions/page.tsx" \
  "apps/web/app/(dashboard)/settings/team/[userId]/permissions/page.tsx"
```

- [ ] **Step 5: Verify in browser**

Open a user; assign the Member role; confirm effective permissions populate; try assigning two SSD-conflicting roles → inline error; both themes.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(dashboard)/settings" apps/web/modules/settings/components/UserRoleAssignment.tsx apps/web/modules/settings/components/EffectivePermissionsView.tsx
git commit -m "feat(web): user detail — role assignment + effective permissions"
```

---

### Task 7: Users list roles column + team redirect

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/(users-roles)/users/page.tsx` (rows link to `/settings/users/[id]`; show role badges/count).
- Create/replace: `apps/web/app/(dashboard)/settings/team/page.tsx` and `team/[userId]/page.tsx` as redirects.

**Interfaces:**
- Consumes: `getUserRoles` or a lightweight users-with-roles list; existing `/api/users`.

- [ ] **Step 1: Add a roles indicator to each user row**

```tsx
// users/page.tsx — for each user row, link to /settings/users/${u.id} and show assigned role names.
// Fetch roles per row lazily is wasteful; instead add role names to /api/users response OR
// fetch all roles + a bulk user_roles map. Minimal approach: link rows now, badges optional.
<Link href={`/settings/users/${u.id}`} style={{ /* row styles as existing */ }}>
  {/* name, email, then: */}
</Link>
```
(If `/api/users` doesn't include roles, keep the row link and defer badges; do not N+1 fetch.)

- [ ] **Step 2: Redirect the orphaned team routes**

```tsx
// apps/web/app/(dashboard)/settings/team/page.tsx
import { redirect } from 'next/navigation';
export default function TeamRedirect() { redirect('/settings/users'); }
```
```tsx
// apps/web/app/(dashboard)/settings/team/[userId]/page.tsx
import { redirect } from 'next/navigation';
export default function TeamUserRedirect({ params }: { params: { userId: string } }) {
  redirect(`/settings/users/${params.userId}`);
}
```

- [ ] **Step 3: Verify**

Visit `/settings/team` and `/settings/team/<id>/permissions` → both land on the canonical users pages (the old permissions route is deleted; add a `team/[userId]/permissions` redirect stub too if any link still points there).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/settings"
git commit -m "feat(web): users list links to detail; redirect legacy team routes"
```

---

### Task 8: `ConstraintSetEditor` + constraints page

**Files:**
- Create: `apps/web/modules/settings/components/ConstraintSetEditor.tsx`
- Create: `apps/web/app/(dashboard)/settings/(users-roles)/roles/constraints/page.tsx`

**Interfaces:**
- Consumes: `listSsdSets`, `createSsdSet`, `deleteSsdSet`, `listDsdSets`, `createDsdSet`, `deleteDsdSet`, `listRoles`.
- Produces: a reusable editor for a constraint kind (SSD or DSD): create (name, cardinality, roles multi-select), list, delete; 409 conflict rendered inline.

- [ ] **Step 1: ConstraintSetEditor (parameterized by kind)**

```tsx
// apps/web/modules/settings/components/ConstraintSetEditor.tsx
'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listRoles, listSsdSets, createSsdSet, deleteSsdSet, listDsdSets, createDsdSet, deleteDsdSet, type ConstraintSet } from '@vencore/api-client';

const api = {
  ssd: { list: listSsdSets, create: createSsdSet, remove: deleteSsdSet },
  dsd: { list: listDsdSets, create: createDsdSet, remove: deleteDsdSet },
};

export function ConstraintSetEditor({ kind }: { kind: 'ssd' | 'dsd' }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [cardinality, setCardinality] = useState(2);
  const [error, setError] = useState<string | null>(null);

  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => listRoles(await getToken()) });
  const sets = useQuery({ queryKey: [kind, 'sets'], queryFn: async () => api[kind].list(await getToken()) });

  const create = useMutation({
    mutationFn: async () => api[kind].create(await getToken(), { name, cardinality, roleIds }),
    onSuccess: () => { setError(null); setName(''); setRoleIds([]); void qc.invalidateQueries({ queryKey: [kind, 'sets'] }); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Existing assignments already violate this set'),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api[kind].remove(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [kind, 'sets'] }),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(sets.data?.data ?? []).map((s: ConstraintSet) => (
        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: 13 }}><b>{s.name}</b> · at most {s.cardinality - 1} of {s.roleIds.length}</span>
          <button onClick={() => remove.mutate(s.id)} style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
        </div>
      ))}
      <div style={{ padding: 12, background: 'var(--surface2)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Set name" style={{ padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(roles.data?.data ?? []).filter(r => !r.grants_all).map(r => (
            <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <input type="checkbox" checked={roleIds.includes(r.id)} onChange={() => setRoleIds(p => p.includes(r.id) ? p.filter(x => x !== r.id) : [...p, r.id])} />{r.name}
            </label>
          ))}
        </div>
        <label style={{ fontSize: 12, color: 'var(--text2)' }}>Cardinality (min roles that conflict): <input type="number" min={2} value={cardinality} onChange={e => setCardinality(Number(e.target.value))} style={{ width: 56, marginLeft: 6 }} /></label>
        {error && <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>{error}</div>}
        <button onClick={() => create.mutate()} disabled={!name.trim() || roleIds.length < 2 || create.isPending} style={{ alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: 13, cursor: 'pointer' }}>Create set</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Constraints page**

```tsx
// apps/web/app/(dashboard)/settings/(users-roles)/roles/constraints/page.tsx
'use client';
import { ConstraintSetEditor } from '@/modules/settings/components/ConstraintSetEditor';

export default function ConstraintsPage() {
  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 28 }}>
      <section>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Static separation of duty</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text2)' }}>A user cannot be assigned too many conflicting roles at once.</p>
        <ConstraintSetEditor kind="ssd" />
      </section>
      <section>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Dynamic separation of duty</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text2)' }}>A user may hold these roles but cannot activate them together in one session.</p>
        <ConstraintSetEditor kind="dsd" />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Create an SSD set over two roles; assign both to a user → inline conflict; both themes.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/settings" apps/web/modules/settings/components/ConstraintSetEditor.tsx
git commit -m "feat(web): SoD constraint set editor + constraints page"
```

---

### Task 9: `ActiveRoleSwitcher` in the topbar

**Files:**
- Create: `apps/web/modules/shared/components/ActiveRoleSwitcher.tsx`
- Modify: `apps/web/modules/shared/components/Topbar.tsx` (mount it).

**Interfaces:**
- Consumes: `getActiveRoles`, `setActiveRoles`; `useAuth().refetch` to re-pull `/api/me` after activation changes.
- Produces: a popover shown only when the user has >1 assigned role; toggling persists and refetches permissions.

- [ ] **Step 1: Component**

```tsx
// apps/web/modules/shared/components/ActiveRoleSwitcher.tsx
'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { getActiveRoles, setActiveRoles } from '@vencore/api-client';

export function ActiveRoleSwitcher() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { refetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roles = useQuery({ queryKey: ['active-roles'], queryFn: async () => getActiveRoles(await getToken()) });
  const assigned = roles.data?.data.assigned ?? [];

  const save = useMutation({
    mutationFn: async (roleIds: string[]) => setActiveRoles(await getToken(), roleIds),
    onSuccess: async () => { setError(null); await qc.invalidateQueries({ queryKey: ['active-roles'] }); await refetch(); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Cannot activate these together (separation of duty)'),
  });

  if (assigned.length <= 1) return null;
  const activeIds = assigned.filter(r => r.active).map(r => r.id);
  const toggle = (id: string) => {
    const next = new Set(activeIds);
    next.has(id) ? next.delete(id) : next.add(id);
    save.mutate([...next]);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ fontSize: 12, color: 'var(--text2)', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', cursor: 'pointer' }}>
        Active roles ({activeIds.length})
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 220, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-modal)', padding: 8, zIndex: 50 }}>
          {assigned.map(r => (
            <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={r.active} onChange={() => toggle(r.id)} />
              {r.name}
            </label>
          ))}
          {error && <div style={{ fontSize: 11, color: 'var(--red)', padding: '4px 8px' }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount in Topbar**

```tsx
// apps/web/modules/shared/components/Topbar.tsx — render <ActiveRoleSwitcher /> in the right-hand cluster.
import { ActiveRoleSwitcher } from './ActiveRoleSwitcher';
// ...inside the right controls: <ActiveRoleSwitcher />
```

- [ ] **Step 3: Verify in browser**

As a user with ≥2 assigned roles, deactivate one → permissions refetch and gated nav updates; DSD-conflicting activation shows the inline error.

- [ ] **Step 4: Commit**

```bash
git add apps/web/modules/shared/components/ActiveRoleSwitcher.tsx apps/web/modules/shared/components/Topbar.tsx
git commit -m "feat(web): topbar active-role switcher with DSD feedback"
```

---

### Task 10: Sweep remaining `user.role` reads in web

**Files:**
- Any `apps/web` file flagged by grep (e.g. `Sidebar.tsx`, `DashboardHeader.tsx`, `TaskRow/TaskGroup/TaskFilterBar/TaskDetailPanel`, `ChannelSettings`, `PendingProviderBanner`, `NotificationPreferencesPage`, `ActivitySettingsPage`, dashboard pages).

**Interfaces:**
- Produces: zero `user.role` reads in `apps/web`; each becomes `user.isAdmin` or `hasPermission('<key>')`.

- [ ] **Step 1: Enumerate**

Run: `rg "user\.role|\.role\s*===\s*['\"]admin['\"]|isAdmin\b" apps/web --type ts --type tsx -n`
Expected: a concrete list.

- [ ] **Step 2: Convert each**

- Superuser-only UI (destructive/admin affordances) → `const { user } = useAuth(); ... user?.isAdmin`.
- Feature gates for workspace management → `hasPermission('modules:manage')` etc.
- Some "role" reads are unrelated (task assignee role, channel member role) — leave those; only convert **user** role reads.

```tsx
// Example (Sidebar.tsx): show a settings/admin entry only for managers
const { hasPermission } = useAuth();
{hasPermission('workspace:manage') && <SettingsNavEntry />}
```

- [ ] **Step 3: Typecheck web**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS — no `user.role`.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "refactor(web): replace user.role reads with isAdmin / hasPermission"
```

---

### Task 11: Plan C verification

- [ ] **Step 1: Web typecheck + build**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web run build`
Expected: PASS.

- [ ] **Step 2: End-to-end in the browser preview**

Start the dev server. Walk the flows and capture screenshots (light + dark):
1. `/settings/roles` renders, create a role.
2. Role detail → toggle a permission (persists), add a member, add an inheritance edge (inherited rows muted), cycle rejected inline.
3. `/settings/users/[id]` → assign roles, effective permissions populate, SSD conflict inline.
4. `/settings/roles/constraints` → create SSD + DSD sets.
5. Topbar active-role switcher toggles, DSD conflict inline.
6. `/settings/team/<id>/permissions` redirects to canonical.
Confirm no console errors via the console reader.

- [ ] **Step 3: Update graph + commit**

```bash
graphify update .
git add -A
git commit -m "test(rbac3): phase C verification — screenshots, both themes"
```

---

## Self-Review

- **§9 pages:** roles list (T3), role detail w/ matrix+members+inheritance (T4–T5), users list (T7), user detail w/ assignment+effective (T6), constraints (T8), active-role switcher (T9). ✓
- **§9 components:** all eight rebuilt; old three deleted (T4, T5, T6). ✓
- **§9.4 visual craft:** tokens only, IBM Plex Mono for keys, `.skeleton`/`.fade-in`, `--shadow-modal` popover, pill badges, dual-theme verify steps. ✓
- **§9.1 IA:** relabel + sub-tabs (T2), team redirect (T7). ✓
- **§9.5 gating:** AuthContext isAdmin (T1), settings-layout permission gates (T2), sidebar sweep (T10). ✓
- **Crash fix:** matrix consumes the grouped contract (T4) — the original defect is gone. ✓
- **Placeholder scan:** every component has full code; T7 Step 1 and T10 are intentionally discovery-then-convert (grep-driven) with the conversion rule + an example shown — acceptable since exact files depend on the live grep. ✓
- **Type consistency:** `GroupedModule`/`GroupedPermission`/`RoleSummary`/`ConstraintSet` imported from `@vencore/api-client` (Plan B) match usage. `AuthUser.isAdmin` consistent across T1/T10. ✓

**Cross-plan dependency:** Plan C requires Plan B's `@vencore/api-client` roles module and `/api/me` returning `{ isAdmin, permissions }` (Plan A Task 12 / Plan B). Do not start Plan C until A + B are merged to `feat/permissions-rbac3`.
