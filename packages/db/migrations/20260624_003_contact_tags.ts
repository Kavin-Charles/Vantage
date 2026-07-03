import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('contact_tags')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', 'varchar(50)', (c) => c.notNull())
    .addColumn('color', 'varchar(20)', (c) => c.notNull().defaultTo('var(--blue)'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // One tag name per workspace (case-insensitive)
  await sql`
    CREATE UNIQUE INDEX contact_tags_workspace_name_unique_idx
    ON contact_tags (workspace_id, lower(name))
  `.execute(db);

  await db.schema
    .createTable('contact_tag_links')
    .addColumn('contact_id', 'uuid', (c) => c.notNull().references('contacts.id').onDelete('cascade'))
    .addColumn('tag_id', 'uuid', (c) => c.notNull().references('contact_tags.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('contact_tag_links_pk', ['contact_id', 'tag_id'])
    .execute();

  // Reverse-lookup index: "which contacts have tag X" (filter direction)
  await db.schema
    .createIndex('contact_tag_links_tag_idx')
    .on('contact_tag_links')
    .columns(['tag_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('contact_tag_links').execute();
  await db.schema.dropIndex('contact_tags_workspace_name_unique_idx').execute();
  await db.schema.dropTable('contact_tags').execute();
}
