// packages/db/migrations/20240108_001_api_keys.ts
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('api_keys')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('key_hash', 'text', col => col.notNull().unique())
    .addColumn('prefix', 'text', col => col.notNull())
    .addColumn('scope', 'text', col => col.notNull())
    .addColumn('last_used_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('api_keys').execute();
}
