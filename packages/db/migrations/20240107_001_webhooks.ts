import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('webhook_subscriptions')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('target_url', 'text', col => col.notNull())
    .addColumn('event', 'text', col => col.notNull())
    .addColumn('secret', 'text', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('webhook_deliveries')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('subscription_id', 'uuid', col =>
      col.notNull().references('webhook_subscriptions.id').onDelete('cascade'),
    )
    .addColumn('event', 'text', col => col.notNull())
    .addColumn('payload', 'jsonb', col => col.notNull())
    .addColumn('status', 'text', col => col.notNull().defaultTo('pending'))
    .addColumn('attempts', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('next_attempt_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('last_error', 'text')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('delivered_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_webhook_deliveries_status_next')
    .on('webhook_deliveries')
    .columns(['status', 'next_attempt_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_webhook_deliveries_status_next').execute();
  await db.schema.dropTable('webhook_deliveries').execute();
  await db.schema.dropTable('webhook_subscriptions').execute();
}
