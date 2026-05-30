import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('workspace_imap_config')
    .addColumn('workspace_id', 'uuid', col =>
      col.primaryKey().references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('imap_host', 'text', col => col.notNull())
    .addColumn('imap_port', 'integer', col => col.notNull())
    .addColumn('smtp_host', 'text', col => col.notNull())
    .addColumn('smtp_port', 'integer', col => col.notNull())
    .addColumn('use_ssl', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('workspace_imap_config').execute();
}
