// packages/db/migrations/20240104_001_item_groups.ts
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // item_groups — custom object types within a pipeline
  await db.schema
    .createTable('item_groups')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('pipeline_id', 'uuid', col => col.notNull().references('pipelines.id').onDelete('cascade'))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('color', 'text')
    .addColumn('position', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  // group_stages — stages scoped to one item group (independent of pipeline_stages)
  await db.schema
    .createTable('group_stages')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('group_id', 'uuid', col => col.notNull().references('item_groups.id').onDelete('cascade'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('color', 'text')
    .addColumn('position', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('is_won', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('is_lost', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  // items — records belonging to an item group
  await db.schema
    .createTable('items')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('group_id', 'uuid', col => col.notNull().references('item_groups.id').onDelete('cascade'))
    .addColumn('stage_id', 'uuid', col => col.notNull().references('group_stages.id'))
    .addColumn('title', 'text', col => col.notNull())
    .addColumn('value', 'numeric')
    .addColumn('owner_id', 'uuid', col => col.notNull().references('users.id'))
    .addColumn('contact_id', 'uuid', col => col.references('contacts.id'))
    .addColumn('company_id', 'uuid', col => col.references('companies.id'))
    .addColumn('converted_from_id', 'uuid') // self-ref, no FK constraint to allow cascade-free delete
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  // item_fields — custom field definitions per group
  await db.schema
    .createTable('item_fields')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('group_id', 'uuid', col => col.notNull().references('item_groups.id').onDelete('cascade'))
    .addColumn('label', 'text', col => col.notNull())
    .addColumn('field_type', 'text', col => col.notNull()) // text|number|date|select|boolean
    .addColumn('options', 'jsonb')
    .addColumn('required', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('position', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  // item_field_values — field values per item
  await db.schema
    .createTable('item_field_values')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('item_id', 'uuid', col => col.notNull().references('items.id').onDelete('cascade'))
    .addColumn('field_id', 'uuid', col => col.notNull().references('item_fields.id').onDelete('cascade'))
    .addColumn('value', 'text', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('item_field_values_item_field_unique')
    .on('item_field_values')
    .columns(['item_id', 'field_id'])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('item_field_values').execute();
  await db.schema.dropTable('item_fields').execute();
  await db.schema.dropTable('items').execute();
  await db.schema.dropTable('group_stages').execute();
  await db.schema.dropTable('item_groups').execute();
}
