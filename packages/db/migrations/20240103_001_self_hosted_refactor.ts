import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Drop billing columns from workspaces
  await db.schema
    .alterTable('workspaces')
    .dropColumn('plan')
    .execute();
  await db.schema
    .alterTable('workspaces')
    .dropColumn('stripe_customer_id')
    .execute();
  await db.schema
    .alterTable('workspaces')
    .dropColumn('stripe_subscription_id')
    .execute();
  await db.schema
    .alterTable('workspaces')
    .dropColumn('trial_ends_at')
    .execute();

  // Drop usage_meters table
  await db.schema.dropTable('usage_meters').ifExists().execute();

  // Auth columns on users
  // NOTE: Existing users get password_hash = '' (invalid hash).
  // After running this migration, all existing users must have their
  // passwords reset via POST /api/users/:id/reset-password (admin).
  await db.schema
    .alterTable('users')
    .addColumn('password_hash', 'text', col => col.notNull().defaultTo(''))
    .execute();
  await db.schema
    .alterTable('users')
    .addColumn('password_reset_token', 'text')
    .execute();
  await db.schema
    .alterTable('users')
    .addColumn('password_reset_expires_at', 'timestamptz')
    .execute();
  await db.schema
    .alterTable('users')
    .dropColumn('clerk_user_id')
    .execute();

  // DB credential columns on infra_databases
  await db.schema
    .alterTable('infra_databases')
    .addColumn('db_user', 'text')
    .execute();
  // NOTE: db_password is stored as plaintext. Only store credentials
  // for databases on trusted internal networks. Restrict DB access to
  // the Vantage API process only.
  await db.schema
    .alterTable('infra_databases')
    .addColumn('db_password', 'text')
    .execute();
  await db.schema
    .alterTable('infra_databases')
    .addColumn('database_name', 'text')
    .execute();
  await db.schema
    .alterTable('infra_databases')
    .addColumn('use_ssl', 'boolean', col => col.notNull().defaultTo(false))
    .execute();
  await db.schema
    .alterTable('infra_databases')
    .addColumn('memory_used_mb', 'float8')
    .execute();
  await db.schema
    .alterTable('infra_databases')
    .addColumn('connected_clients', 'integer')
    .execute();
  await db.schema
    .alterTable('infra_databases')
    .addColumn('uptime_seconds', 'bigint')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Reverse: restore billing columns, drop auth cols, drop db credential cols
  await db.schema
    .alterTable('workspaces')
    .addColumn('plan', 'text', col => col.defaultTo('trial'))
    .execute();
  await db.schema
    .alterTable('workspaces')
    .addColumn('stripe_customer_id', 'text')
    .execute();
  await db.schema
    .alterTable('workspaces')
    .addColumn('stripe_subscription_id', 'text')
    .execute();
  await db.schema
    .alterTable('workspaces')
    .addColumn('trial_ends_at', 'timestamptz')
    .execute();

  await db.schema
    .alterTable('users')
    .addColumn('clerk_user_id', 'text', col => col.notNull().defaultTo(''))
    .execute();
  await db.schema.alterTable('users').dropColumn('password_hash').execute();
  await db.schema.alterTable('users').dropColumn('password_reset_token').execute();
  await db.schema.alterTable('users').dropColumn('password_reset_expires_at').execute();

  await db.schema.alterTable('infra_databases').dropColumn('db_user').execute();
  await db.schema.alterTable('infra_databases').dropColumn('db_password').execute();
  await db.schema.alterTable('infra_databases').dropColumn('database_name').execute();
  await db.schema.alterTable('infra_databases').dropColumn('use_ssl').execute();
  await db.schema.alterTable('infra_databases').dropColumn('memory_used_mb').execute();
  await db.schema.alterTable('infra_databases').dropColumn('connected_clients').execute();
  await db.schema.alterTable('infra_databases').dropColumn('uptime_seconds').execute();
}
