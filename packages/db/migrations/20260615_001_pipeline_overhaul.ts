import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // pipeline_fields — replaces record_type_fields, scoped per pipeline
  await db.schema
    .createTable('pipeline_fields')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('pipeline_id', 'uuid', col => col.notNull().references('pipelines.id').onDelete('cascade'))
    .addColumn('label', 'text', col => col.notNull())
    .addColumn('key', 'text', col => col.notNull())
    .addColumn('type', 'text', col => col.notNull())
    .addColumn('options', 'jsonb')
    .addColumn('position', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('required', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`ALTER TABLE pipeline_fields ADD CONSTRAINT pipeline_fields_type_check
    CHECK (type IN ('text','number','date','select','multiselect','user','checkbox','url'))`.execute(db);
  await sql`ALTER TABLE pipeline_fields ADD CONSTRAINT pipeline_fields_key_unique
    UNIQUE (pipeline_id, key)`.execute(db);

  // pipeline_items — replaces records/pipeline_records with JSONB field storage
  await db.schema
    .createTable('pipeline_items')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('pipeline_id', 'uuid', col => col.notNull().references('pipelines.id').onDelete('cascade'))
    .addColumn('stage_id', 'uuid', col => col.notNull().references('pipeline_stages.id').onDelete('restrict'))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('position', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('field_values', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE INDEX pipeline_items_field_values_gin ON pipeline_items USING GIN (field_values)`.execute(db);
  await sql`CREATE INDEX pipeline_items_pipeline_stage ON pipeline_items (pipeline_id, stage_id) WHERE deleted_at IS NULL`.execute(db);

  // pipeline_automations
  await db.schema
    .createTable('pipeline_automations')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('pipeline_id', 'uuid', col => col.notNull().references('pipelines.id').onDelete('cascade'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('trigger_type', 'text', col => col.notNull())
    .addColumn('trigger_conditions', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('action_type', 'text', col => col.notNull())
    .addColumn('action_params', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('enabled', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('last_fired_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`ALTER TABLE pipeline_automations ADD CONSTRAINT pipeline_automations_trigger_check
    CHECK (trigger_type IN ('stage_changed','field_changed','item_created','date_approaching'))`.execute(db);
  await sql`ALTER TABLE pipeline_automations ADD CONSTRAINT pipeline_automations_action_check
    CHECK (action_type IN ('notify_assignee','assign_user','move_stage'))`.execute(db);

  // pipeline_activity
  await db.schema
    .createTable('pipeline_activity')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('item_id', 'uuid', col => col.notNull().references('pipeline_items.id').onDelete('cascade'))
    .addColumn('pipeline_id', 'uuid', col => col.notNull().references('pipelines.id').onDelete('cascade'))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', col => col.references('users.id'))
    .addColumn('event_type', 'text', col => col.notNull())
    .addColumn('payload', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`CREATE INDEX pipeline_activity_item_id ON pipeline_activity (item_id, created_at DESC)`.execute(db);

  // Remove record_type_id from pipelines (no longer needed)
  await db.schema.alterTable('pipelines').dropColumn('record_type_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('pipeline_activity').ifExists().execute();
  await db.schema.dropTable('pipeline_automations').ifExists().execute();
  await db.schema.dropTable('pipeline_items').ifExists().execute();
  await db.schema.dropTable('pipeline_fields').ifExists().execute();
  await db.schema.alterTable('pipelines')
    .addColumn('record_type_id', 'uuid')
    .execute();
}
