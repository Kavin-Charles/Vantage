import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

/**
 * Assigns a role to a user and activates it in their current session.
 * Idempotent — safe to call even if the assignment already exists.
 */
export async function assignRole(
  db: Kysely<Database>,
  workspaceId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  await db
    .insertInto('user_roles')
    .values({ workspace_id: workspaceId, role_id: roleId, user_id: userId })
    .onConflict(oc => oc.columns(['role_id', 'user_id']).doNothing())
    .execute();
  await db
    .insertInto('user_session_roles')
    .values({ user_id: userId, role_id: roleId, active: true })
    .onConflict(oc => oc.columns(['user_id', 'role_id']).doNothing())
    .execute();
}

export async function getDefaultRoleId(db: Kysely<Database>, workspaceId: string): Promise<string | null> {
  const row = await db
    .selectFrom('roles')
    .where('workspace_id', '=', workspaceId)
    .where('is_default', '=', true)
    .select('id')
    .executeTakeFirst();
  return row?.id ?? null;
}

export async function getGrantsAllRoleId(db: Kysely<Database>, workspaceId: string): Promise<string | null> {
  const row = await db
    .selectFrom('roles')
    .where('workspace_id', '=', workspaceId)
    .where('grants_all', '=', true)
    .select('id')
    .executeTakeFirst();
  return row?.id ?? null;
}
