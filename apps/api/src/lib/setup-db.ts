import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export async function isConfigured(db: Kysely<Database>): Promise<boolean> {
  try {
    const workspace = await db
      .selectFrom('workspaces')
      .select('id')
      .executeTakeFirst();
    return workspace !== undefined;
  } catch {
    return false;
  }
}
