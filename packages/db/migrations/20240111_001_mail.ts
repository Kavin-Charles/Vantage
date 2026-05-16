import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('email_accounts')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(db.fn('gen_random_uuid', [])))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('provider', 'varchar(10)', col => col.notNull())
    .addColumn('email', 'varchar(255)', col => col.notNull())
    .addColumn('display_name', 'varchar(255)')
    .addColumn('access_token', 'text')
    .addColumn('refresh_token', 'text')
    .addColumn('gmail_history_id', 'varchar(50)')
    .addColumn('imap_host', 'varchar(255)')
    .addColumn('imap_port', 'integer')
    .addColumn('imap_user', 'varchar(255)')
    .addColumn('imap_pass', 'text')
    .addColumn('smtp_host', 'varchar(255)')
    .addColumn('smtp_port', 'integer')
    .addColumn('smtp_user', 'varchar(255)')
    .addColumn('smtp_pass', 'text')
    .addColumn('use_ssl', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('sync_status', 'varchar(20)', col => col.notNull().defaultTo('idle'))
    .addColumn('sync_error', 'text')
    .addColumn('last_synced_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(db.fn('now', [])))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(db.fn('now', [])))
    .execute();

  await db.schema
    .createTable('emails')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(db.fn('gen_random_uuid', [])))
    .addColumn('account_id', 'uuid', col => col.notNull().references('email_accounts.id').onDelete('cascade'))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('message_id', 'varchar(255)', col => col.notNull())
    .addColumn('thread_id', 'varchar(255)')
    .addColumn('subject', 'text')
    .addColumn('from_address', 'varchar(255)', col => col.notNull())
    .addColumn('from_name', 'varchar(255)')
    .addColumn('to_addresses', 'jsonb', col => col.notNull().defaultTo('[]'))
    .addColumn('cc_addresses', 'jsonb', col => col.notNull().defaultTo('[]'))
    .addColumn('bcc_addresses', 'jsonb', col => col.notNull().defaultTo('[]'))
    .addColumn('body_html', 'text')
    .addColumn('body_text', 'text')
    .addColumn('snippet', 'varchar(300)')
    .addColumn('folder', 'varchar(20)', col => col.notNull().defaultTo('inbox'))
    .addColumn('is_read', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('is_starred', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('sent_at', 'timestamptz', col => col.notNull())
    .addColumn('synced_at', 'timestamptz', col => col.notNull().defaultTo(db.fn('now', [])))
    .addColumn('contact_id', 'uuid', col => col.references('contacts.id').onDelete('set null'))
    .addColumn('deal_id', 'uuid', col => col.references('deals.id').onDelete('set null'))
    .execute();

  await db.schema
    .createIndex('emails_account_message_unique')
    .on('emails').columns(['account_id', 'message_id']).unique().execute();

  await db.schema
    .createIndex('emails_user_folder_idx')
    .on('emails').columns(['user_id', 'folder']).execute();

  await db.schema
    .createIndex('emails_contact_id_idx')
    .on('emails').column('contact_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('emails').ifExists().execute();
  await db.schema.dropTable('email_accounts').ifExists().execute();
}
