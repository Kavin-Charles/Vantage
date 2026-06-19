import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Per-database alert threshold overrides.
  // NULL database_id = workspace-level default; set = per-DB override.
  await db.schema
    .createTable('infra_db_thresholds')
    .ifNotExists()
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('database_id', 'uuid', c => c.references('infra_databases.id').onDelete('cascade'))
    .addColumn('connection_count_max', 'integer')
    .addColumn('replication_lag_s_max', 'float4')
    .addColumn('storage_gb_max', 'float4')
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    CREATE UNIQUE INDEX infra_db_thresholds_workspace_default_idx
    ON infra_db_thresholds (workspace_id)
    WHERE database_id IS NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX infra_db_thresholds_database_idx
    ON infra_db_thresholds (database_id)
    WHERE database_id IS NOT NULL
  `.execute(db);

  // Persisted SQL/Mongo query history. Rolling 100 per (database_id, user_id).
  await db.schema
    .createTable('infra_db_query_history')
    .ifNotExists()
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('database_id', 'uuid', c => c.notNull().references('infra_databases.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('engine', 'varchar(20)', c => c.notNull())
    .addColumn('query_text', 'text', c => c.notNull())
    .addColumn('query_type', 'varchar(10)', c => c.notNull().check(sql`query_type IN ('sql', 'mongo')`))
    .addColumn('executed_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('row_count', 'integer')
    .addColumn('duration_ms', 'integer')
    .execute();

  await sql`
    CREATE INDEX infra_db_query_history_lookup_idx
    ON infra_db_query_history (database_id, user_id, executed_at DESC)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('infra_db_query_history_lookup_idx').execute();
  await db.schema.dropTable('infra_db_query_history').ifExists().execute();
  await db.schema.dropIndex('infra_db_thresholds_database_idx').execute();
  await db.schema.dropIndex('infra_db_thresholds_workspace_default_idx').execute();
  await db.schema.dropTable('infra_db_thresholds').ifExists().execute();
}
