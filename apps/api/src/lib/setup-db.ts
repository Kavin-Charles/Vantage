import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

export async function isConfigured(db: Kysely<Database>): Promise<boolean> {
  try {
    const row = await db
      .selectFrom('system_settings')
      .where('key', '=', 'setup')
      .select('value')
      .executeTakeFirst();
    return (row?.value as { configured?: boolean })?.configured === true;
  } catch {
    // Table doesn't exist = pre-migration / local-dev with file config = treat as configured
    return true;
  }
}
