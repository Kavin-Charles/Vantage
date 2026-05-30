import type { Kysely } from 'kysely';
import { configSchema, type VantageConfig } from './config-schema';

export async function readConfigFromDb(db: Kysely<any>): Promise<VantageConfig | null> {
  const row = await db
    .selectFrom('system_settings')
    .where('key', '=', 'config')
    .select('value')
    .executeTakeFirst();

  if (!row) return null;

  const result = configSchema.safeParse(row.value);
  if (!result.success) return null;

  return result.data;
}
