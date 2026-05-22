import { Kysely, PostgresDialect } from 'kysely';
import pg, { Pool } from 'pg';
import type { Database } from './schema';

// Return date columns as plain YYYY-MM-DD strings instead of JS Date objects.
// Without this, pg converts DATE values to Date objects, which serialize as
// UTC ISO strings (e.g. "2026-05-21T18:30:00.000Z") — wrong day in non-UTC zones.
pg.types.setTypeParser(pg.types.builtins.DATE, (val) => val);

export function createDb(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString, max: 10 }),
    }),
  });
}

export type { Database } from './schema';
