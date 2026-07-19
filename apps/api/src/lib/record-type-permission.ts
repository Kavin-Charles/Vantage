import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { userIsSuperuser } from '../middleware/permission';

export type RecordTypeOp = 'view' | 'create' | 'edit' | 'delete';

const OP_COLUMN: Record<RecordTypeOp, 'can_view' | 'can_create' | 'can_edit' | 'can_delete'> = {
  view: 'can_view',
  create: 'can_create',
  edit: 'can_edit',
  delete: 'can_delete',
};

export interface CheckRecordTypePermissionArgs {
  userId: string;
  workspaceId: string;
  recordTypeId: string;
  op: RecordTypeOp;
}

/**
 * Resolves whether a user may perform `op` on records of `recordTypeId`.
 * Superusers always pass. Otherwise, allowed if any of the user's assigned
 * roles (active + inherited via user_roles) has a granting row for this op.
 */
export async function checkRecordTypePermission(
  db: Kysely<Database>,
  args: CheckRecordTypePermissionArgs,
): Promise<boolean> {
  if (await userIsSuperuser(db, args.userId, args.workspaceId)) return true;

  const roleRows = await db
    .selectFrom('user_roles')
    .where('user_id', '=', args.userId)
    .where('workspace_id', '=', args.workspaceId)
    .select('role_id')
    .execute();
  const roleIds = roleRows.map(r => r.role_id);
  if (roleIds.length === 0) return false;

  const column = OP_COLUMN[args.op];
  const row = await db
    .selectFrom('record_type_permissions')
    .where('record_type_id', '=', args.recordTypeId)
    .where('role_id', 'in', roleIds)
    .where(column, '=', true)
    .select('role_id')
    .executeTakeFirst();

  return !!row;
}
