// apps/api/src/lib/seed-modules.ts
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@vantage/db';
import { MODULE_REGISTRY } from '../modules/registry';

export async function seedWorkspaceModules(
  db: Kysely<Database> | Transaction<Database>,
  workspaceId: string,
): Promise<void> {
  const rows = MODULE_REGISTRY.map(m => ({
    workspace_id: workspaceId,
    module_id: m.id,
    enabled: m.defaultEnabled,
  }));

  // Insert all 8, skip conflicts (idempotent)
  await db
    .insertInto('workspace_modules')
    .values(rows)
    .onConflict(oc => oc.columns(['workspace_id', 'module_id']).doNothing())
    .execute();
}
