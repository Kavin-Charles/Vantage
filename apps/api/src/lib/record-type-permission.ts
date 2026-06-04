import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export type PermissionAction = 'can_view' | 'can_create' | 'can_edit' | 'can_delete';

export async function checkRecordTypePermission(
  db: Kysely<Database>,
  recordTypeId: string,
  role: 'admin' | 'member',
  action: PermissionAction,
): Promise<boolean> {
  const perm = await db
    .selectFrom('record_type_permissions')
    .select(action)
    .where('record_type_id', '=', recordTypeId)
    .where('role', '=', role)
    .executeTakeFirst();

  if (!perm) return false;
  return perm[action] as boolean;
}
