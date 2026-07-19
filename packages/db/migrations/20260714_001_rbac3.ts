import { type Kysely, sql } from 'kysely';
import { memberSeedPermissions, mapLegacyRolePermission } from './20260714_001_rbac3.helpers';

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Rename groups* -> roles* in place (preserves FK data).
  await sql`alter table groups rename to roles`.execute(db);
  await sql`alter table group_members rename to user_roles`.execute(db);
  // group_members.id is a plain uuid column (default gen_random_uuid()), not a
  // serial/identity column, so there is no backing sequence to rename in this
  // schema. Guard at the SQL level (DO block + EXCEPTION) rather than with a
  // JS-level .catch(): Kysely runs the whole migration in one transaction, and
  // a failed statement aborts that transaction at the Postgres level even when
  // the JS promise rejection is caught, poisoning every statement after it.
  await sql`
    do $$
    begin
      alter table group_members_id_seq rename to user_roles_id_seq;
    exception when undefined_table then
      null;
    end $$
  `.execute(db);
  await sql`alter table user_roles rename column group_id to role_id`.execute(db);
  await sql`alter table group_permissions rename to role_permissions`.execute(db);
  await sql`alter table role_permissions rename column group_id to role_id`.execute(db);
  await sql`alter table dashboard_group_assignments rename column group_id to role_id`.execute(db);

  // 2. New columns on roles.
  await sql`alter table roles add column is_system boolean not null default false`.execute(db);
  await sql`alter table roles add column grants_all boolean not null default false`.execute(db);
  await sql`alter table roles add column is_default boolean not null default false`.execute(db);
  await sql`alter table roles add column max_members integer`.execute(db);
  await sql`alter table roles add column rank integer not null default 0`.execute(db);

  // 3. Grant-only: drop deny rows, then the granted column.
  await sql`delete from role_permissions where granted = false`.execute(db);
  await sql`alter table role_permissions drop column granted`.execute(db);

  // 3b. Expand any legacy coarse keys in existing role_permissions.
  const legacyRows = await sql<{ role_id: string; permission: string }>`
    select role_id, permission from role_permissions
    where permission in ('projects:manage', 'projects:view')
  `.execute(db);
  for (const row of legacyRows.rows) {
    for (const expanded of mapLegacyRolePermission(row.permission)) {
      await sql`
        insert into role_permissions (workspace_id, role_id, permission)
        select workspace_id, role_id, ${expanded} from role_permissions
        where role_id = ${row.role_id} and permission = ${row.permission}
        on conflict (role_id, permission) do nothing
      `.execute(db);
    }
  }
  await sql`delete from role_permissions where permission = 'projects:manage'`.execute(db);

  // 4. Hierarchy / constraint / session / invite / report tables.
  await sql`
    create table role_inheritance (
      parent_role_id uuid not null references roles(id) on delete cascade,
      child_role_id  uuid not null references roles(id) on delete cascade,
      primary key (parent_role_id, child_role_id)
    )`.execute(db);
  await sql`
    create table ssd_sets (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references workspaces(id) on delete cascade,
      name text not null,
      cardinality integer not null check (cardinality >= 2)
    )`.execute(db);
  await sql`
    create table ssd_set_roles (
      set_id uuid not null references ssd_sets(id) on delete cascade,
      role_id uuid not null references roles(id) on delete cascade,
      primary key (set_id, role_id)
    )`.execute(db);
  await sql`
    create table dsd_sets (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references workspaces(id) on delete cascade,
      name text not null,
      cardinality integer not null check (cardinality >= 2)
    )`.execute(db);
  await sql`
    create table dsd_set_roles (
      set_id uuid not null references dsd_sets(id) on delete cascade,
      role_id uuid not null references roles(id) on delete cascade,
      primary key (set_id, role_id)
    )`.execute(db);
  await sql`
    create table user_session_roles (
      user_id uuid not null references users(id) on delete cascade,
      role_id uuid not null references roles(id) on delete cascade,
      active boolean not null default true,
      primary key (user_id, role_id)
    )`.execute(db);
  await sql`
    create table invite_roles (
      invite_id uuid not null references invites(id) on delete cascade,
      role_id uuid not null references roles(id) on delete cascade,
      primary key (invite_id, role_id)
    )`.execute(db);
  await sql`
    create table migration_discarded_grants (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null,
      user_id uuid not null,
      permission text not null,
      discarded_at timestamptz not null default now()
    )`.execute(db);

  // 5. Seed system roles per workspace.
  // First free the canonical system-role names. At this point no system roles
  // exist yet, so any role already named 'Administrator'/'Member' is a user's
  // custom group. Renaming it (rather than upserting onto it) preserves its
  // members/permissions and, critically, avoids silently granting grants_all
  // to a custom group's members. The `(workspace_id, name)` unique index would
  // otherwise make the seed INSERT below abort the whole migration transaction.
  await sql`
    update roles set name = name || ' (legacy)', updated_at = now()
    where name in ('Administrator', 'Member')`.execute(db);

  const seedPerms = memberSeedPermissions();
  const workspaces = await sql<{ id: string }>`select id from workspaces`.execute(db);
  for (const ws of workspaces.rows) {
    const admin = await sql<{ id: string }>`
      insert into roles (workspace_id, name, description, color, is_system, grants_all, rank)
      values (${ws.id}, 'Administrator', 'Full access to everything.', '#1e3a8a', true, true, 100)
      returning id`.execute(db);
    const adminId = admin.rows[0]!.id;
    const member = await sql<{ id: string }>`
      insert into roles (workspace_id, name, description, color, is_system, is_default, rank)
      values (${ws.id}, 'Member', 'Baseline access.', '#2d6a4f', true, true, 0)
      returning id`.execute(db);
    const memberId = member.rows[0]!.id;

    for (const perm of seedPerms) {
      await sql`
        insert into role_permissions (workspace_id, role_id, permission)
        values (${ws.id}, ${memberId}, ${perm})
        on conflict (role_id, permission) do nothing`.execute(db);
    }

    // Assign existing users to their system role by current enum.
    await sql`
      insert into user_roles (workspace_id, role_id, user_id)
      select ${ws.id}, ${adminId}, id from users where workspace_id = ${ws.id} and role = 'admin'
      on conflict (role_id, user_id) do nothing`.execute(db);
    await sql`
      insert into user_roles (workspace_id, role_id, user_id)
      select ${ws.id}, ${memberId}, id from users where workspace_id = ${ws.id} and role = 'member'
      on conflict (role_id, user_id) do nothing`.execute(db);

    // Activate all assigned roles by default.
    await sql`
      insert into user_session_roles (user_id, role_id, active)
      select ur.user_id, ur.role_id, true from user_roles ur where ur.workspace_id = ${ws.id}
      on conflict (user_id, role_id) do nothing`.execute(db);
  }

  // 6. Migrate invites.role -> invite_roles (map admin/member to system roles).
  await sql`
    insert into invite_roles (invite_id, role_id)
    select i.id, r.id from invites i
    join roles r on r.workspace_id = i.workspace_id and r.is_system = true
      and ((i.role = 'admin' and r.grants_all = true) or (i.role <> 'admin' and r.is_default = true))
    on conflict do nothing`.execute(db);

  // 7. record_type_permissions.role enum -> role_id FK (map to system roles).
  await sql`alter table record_type_permissions add column role_id uuid references roles(id) on delete cascade`.execute(db);
  await sql`
    update record_type_permissions rtp set role_id = r.id
    from record_types rt
    join roles r on r.workspace_id = rt.workspace_id and r.is_system = true
    where rtp.record_type_id = rt.id
      and ((rtp.role = 'admin' and r.grants_all = true) or (rtp.role <> 'admin' and r.is_default = true))`.execute(db);
  // Every workspace is seeded with both system roles (step 5) and the old
  // `role` was NOT NULL CHECK IN('admin','member'), so every row is backfilled
  // — enforce NOT NULL so the RolePermission role_id type is honest.
  await sql`alter table record_type_permissions alter column role_id set not null`.execute(db);
  await sql`alter table record_type_permissions drop column role`.execute(db);

  // 8. Move per-user overrides to the discarded-grants report, then drop them.
  await sql`
    insert into migration_discarded_grants (workspace_id, user_id, permission)
    select workspace_id, user_id, permission from user_permissions where granted = true`.execute(db);
  await sql`delete from user_permissions`.execute(db);

  // 9. Drop the enum column.
  await sql`alter table users drop column role`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Best-effort reverse: restore enum from grants_all membership, then undo renames.
  await sql`alter table users add column role text not null default 'member'`.execute(db);
  await sql`
    update users u set role = 'admin'
    from user_roles ur join roles r on r.id = ur.role_id
    where ur.user_id = u.id and r.grants_all = true`.execute(db);

  await sql`alter table record_type_permissions add column role text`.execute(db);
  await sql`
    update record_type_permissions rtp set role =
      case when r.grants_all then 'admin' else 'member' end
    from roles r where r.id = rtp.role_id`.execute(db);
  await sql`alter table record_type_permissions drop column role_id`.execute(db);

  await sql`drop table if exists migration_discarded_grants`.execute(db);
  await sql`drop table if exists invite_roles`.execute(db);
  await sql`drop table if exists user_session_roles`.execute(db);
  await sql`drop table if exists dsd_set_roles`.execute(db);
  await sql`drop table if exists dsd_sets`.execute(db);
  await sql`drop table if exists ssd_set_roles`.execute(db);
  await sql`drop table if exists ssd_sets`.execute(db);
  await sql`drop table if exists role_inheritance`.execute(db);

  await sql`delete from user_roles ur using roles r where ur.role_id = r.id and r.is_system = true`.execute(db);
  await sql`delete from role_permissions rp using roles r where rp.role_id = r.id and r.is_system = true`.execute(db);
  await sql`delete from roles where is_system = true`.execute(db);

  await sql`alter table roles drop column is_system`.execute(db);
  await sql`alter table roles drop column grants_all`.execute(db);
  await sql`alter table roles drop column is_default`.execute(db);
  await sql`alter table roles drop column max_members`.execute(db);
  await sql`alter table roles drop column rank`.execute(db);
  await sql`alter table role_permissions add column granted boolean not null default true`.execute(db);
  await sql`alter table dashboard_group_assignments rename column role_id to group_id`.execute(db);
  await sql`alter table role_permissions rename column role_id to group_id`.execute(db);
  await sql`alter table role_permissions rename to group_permissions`.execute(db);
  await sql`alter table user_roles rename column role_id to group_id`.execute(db);
  await sql`alter table user_roles rename to group_members`.execute(db);
  await sql`alter table roles rename to groups`.execute(db);
}
