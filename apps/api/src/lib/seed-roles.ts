import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@vencore/db';
import { getDefaultPermissionsForRole } from '@vencore/modules';

export interface SeededRoles {
  adminRoleId: string;
  memberRoleId: string;
}

/**
 * Seeds the two system roles every workspace needs: Administrator (grants_all)
 * and Member (is_default). Idempotent — returns existing IDs if already seeded.
 */
export async function seedWorkspaceRoles(
  db: Kysely<Database> | Transaction<Database>,
  workspaceId: string,
): Promise<SeededRoles> {
  const existingAdmin = await db
    .selectFrom('roles')
    .where('workspace_id', '=', workspaceId)
    .where('grants_all', '=', true)
    .select('id')
    .executeTakeFirst();
  const existingMember = await db
    .selectFrom('roles')
    .where('workspace_id', '=', workspaceId)
    .where('is_default', '=', true)
    .select('id')
    .executeTakeFirst();

  const admin = existingAdmin ?? await db
    .insertInto('roles')
    .values({
      workspace_id: workspaceId,
      name: 'Administrator',
      description: 'Full access to everything.',
      color: '#1e3a8a',
      is_system: true,
      grants_all: true,
      rank: 100,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  const member = existingMember ?? await db
    .insertInto('roles')
    .values({
      workspace_id: workspaceId,
      name: 'Member',
      description: 'Baseline access.',
      color: '#2d6a4f',
      is_system: true,
      is_default: true,
      rank: 0,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  if (!existingMember) {
    const memberPermissions = getDefaultPermissionsForRole('member');
    if (memberPermissions.length > 0) {
      await db
        .insertInto('role_permissions')
        .values(memberPermissions.map(permission => ({
          workspace_id: workspaceId,
          role_id: member.id,
          permission,
        })))
        .onConflict(oc => oc.columns(['role_id', 'permission']).doNothing())
        .execute();
    }
  }

  return { adminRoleId: admin.id, memberRoleId: member.id };
}
