import { type Kysely, sql } from 'kysely';

// Adding a permission to a ModuleDefinition only reaches NEW workspaces:
// seedWorkspaceRoles grants module defaults when a workspace's Member role is
// first created and never runs again. Existing workspaces therefore need an
// explicit backfill, or members stay locked out of channel creation.
//
// Backfill rule: any role that can already send messages can create channels.
// Roles with grants_all are unaffected — they short-circuit to superuser and
// never consult role_permissions.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    insert into role_permissions (workspace_id, role_id, permission)
    select workspace_id, role_id, 'messaging:create_channel'
    from role_permissions
    where permission = 'messaging:send'
    on conflict (role_id, permission) do nothing
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    delete from role_permissions where permission = 'messaging:create_channel'
  `.execute(db);
}
