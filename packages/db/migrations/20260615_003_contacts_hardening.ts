import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Enable trigram extension for fast ILIKE search on name/email
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);

  // Composite index covering the base workspace + soft-delete filter on every list query
  await db.schema
    .createIndex('contacts_workspace_deleted_idx')
    .on('contacts')
    .columns(['workspace_id', 'deleted_at'])
    .execute();

  // Status filter index
  await db.schema
    .createIndex('contacts_workspace_status_idx')
    .on('contacts')
    .columns(['workspace_id', 'status'])
    .execute();

  // Owner filter index
  await db.schema
    .createIndex('contacts_workspace_owner_idx')
    .on('contacts')
    .columns(['workspace_id', 'owner_id'])
    .execute();

  // Default sort (created_at desc) index
  await sql`
    CREATE INDEX contacts_workspace_created_idx
    ON contacts (workspace_id, created_at DESC)
  `.execute(db);

  // GIN trigram indexes for fast ILIKE on name and email
  await sql`
    CREATE INDEX contacts_name_trgm_idx
    ON contacts USING GIN (name gin_trgm_ops)
  `.execute(db);

  await sql`
    CREATE INDEX contacts_email_trgm_idx
    ON contacts USING GIN (email gin_trgm_ops)
  `.execute(db);

  // Partial unique: one email per workspace among non-deleted contacts
  await sql`
    CREATE UNIQUE INDEX contacts_workspace_email_unique_idx
    ON contacts (workspace_id, lower(email))
    WHERE deleted_at IS NULL
  `.execute(db);

  // Reconcile contact_count to match actual rows (fixes any existing drift)
  await sql`
    UPDATE workspaces w
    SET contact_count = (
      SELECT COUNT(*)::integer
      FROM contacts c
      WHERE c.workspace_id = w.id
        AND c.deleted_at IS NULL
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('contacts_workspace_email_unique_idx').execute();
  await db.schema.dropIndex('contacts_email_trgm_idx').execute();
  await db.schema.dropIndex('contacts_name_trgm_idx').execute();
  await db.schema.dropIndex('contacts_workspace_created_idx').execute();
  await db.schema.dropIndex('contacts_workspace_owner_idx').execute();
  await db.schema.dropIndex('contacts_workspace_status_idx').execute();
  await db.schema.dropIndex('contacts_workspace_deleted_idx').execute();
}
