import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // record_types
  await db.schema
    .createTable('record_types')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('icon', 'text', col => col.notNull().defaultTo('📋'))
    .addColumn('color', 'text', col => col.notNull().defaultTo('#6b665c'))
    .addColumn('position', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('auto_number_enabled', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('auto_number_prefix', 'text', col => col.notNull().defaultTo(''))
    .addColumn('auto_number_format', 'text', col => col.notNull().defaultTo('PREFIX-YY-NNN'))
    .addColumn('auto_number_sequence', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  // record_type_fields
  await db.schema
    .createTable('record_type_fields')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('record_type_id', 'uuid', col => col.notNull().references('record_types.id').onDelete('cascade'))
    .addColumn('label', 'text', col => col.notNull())
    .addColumn('field_type', 'text', col => col.notNull())
    .addColumn('options', 'jsonb')
    .addColumn('is_required', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('position', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`ALTER TABLE record_type_fields ADD CONSTRAINT record_type_fields_field_type_check CHECK (field_type IN ('text','number','date','select','boolean'))`.execute(db);

  // record_type_permissions
  await db.schema
    .createTable('record_type_permissions')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('record_type_id', 'uuid', col => col.notNull().references('record_types.id').onDelete('cascade'))
    .addColumn('role', 'text', col => col.notNull())
    .addColumn('can_view', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('can_create', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('can_edit', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('can_delete', 'boolean', col => col.notNull().defaultTo(false))
    .execute();

  await sql`ALTER TABLE record_type_permissions ADD CONSTRAINT record_type_permissions_role_check CHECK (role IN ('admin','member'))`.execute(db);
  await sql`ALTER TABLE record_type_permissions ADD CONSTRAINT record_type_permissions_unique UNIQUE (record_type_id, role)`.execute(db);

  // stage_required_fields
  await db.schema
    .createTable('stage_required_fields')
    .addColumn('stage_id', 'uuid', col => col.notNull().references('pipeline_stages.id').onDelete('cascade'))
    .addColumn('field_id', 'uuid', col => col.notNull().references('record_type_fields.id').onDelete('cascade'))
    .execute();

  await sql`ALTER TABLE stage_required_fields ADD PRIMARY KEY (stage_id, field_id)`.execute(db);

  // pipeline_records
  await db.schema
    .createTable('pipeline_records')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('record_type_id', 'uuid', col => col.notNull().references('record_types.id'))
    .addColumn('pipeline_id', 'uuid', col => col.notNull().references('pipelines.id'))
    .addColumn('stage_id', 'uuid', col => col.notNull().references('pipeline_stages.id'))
    .addColumn('record_number', 'text')
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('contact_id', 'uuid', col => col.references('contacts.id'))
    .addColumn('company_id', 'uuid', col => col.references('companies.id'))
    .addColumn('owner_id', 'uuid', col => col.notNull().references('users.id'))
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  // record_field_values
  await db.schema
    .createTable('record_field_values')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('record_id', 'uuid', col => col.notNull().references('pipeline_records.id').onDelete('cascade'))
    .addColumn('field_id', 'uuid', col => col.notNull().references('record_type_fields.id').onDelete('cascade'))
    .addColumn('value', 'jsonb', col => col.notNull())
    .execute();

  await sql`ALTER TABLE record_field_values ADD CONSTRAINT record_field_values_unique UNIQUE (record_id, field_id)`.execute(db);

  // conversion_templates
  await db.schema
    .createTable('conversion_templates')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('source_type_id', 'uuid', col => col.notNull().references('record_types.id'))
    .addColumn('target_type_id', 'uuid', col => col.notNull().references('record_types.id'))
    .addColumn('target_pipeline_id', 'uuid', col => col.notNull().references('pipelines.id'))
    .addColumn('target_stage_id', 'uuid', col => col.notNull().references('pipeline_stages.id'))
    .addColumn('position', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  // conversion_field_mappings
  await db.schema
    .createTable('conversion_field_mappings')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('template_id', 'uuid', col => col.notNull().references('conversion_templates.id').onDelete('cascade'))
    .addColumn('source_field_id', 'uuid', col => col.references('record_type_fields.id'))
    .addColumn('source_builtin', 'text')
    .addColumn('target_field_id', 'uuid', col => col.references('record_type_fields.id'))
    .addColumn('target_builtin', 'text')
    .execute();

  await sql`ALTER TABLE conversion_field_mappings ADD CONSTRAINT conversion_field_mappings_source_check CHECK ((source_field_id IS NOT NULL) != (source_builtin IS NOT NULL))`.execute(db);
  await sql`ALTER TABLE conversion_field_mappings ADD CONSTRAINT conversion_field_mappings_target_check CHECK (target_field_id IS NULL OR target_builtin IS NULL)`.execute(db);

  // record_conversions
  await db.schema
    .createTable('record_conversions')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('source_record_id', 'uuid', col => col.notNull().references('pipeline_records.id'))
    .addColumn('target_record_id', 'uuid', col => col.notNull().references('pipeline_records.id'))
    .addColumn('template_id', 'uuid', col => col.notNull().references('conversion_templates.id'))
    .addColumn('converted_by', 'uuid', col => col.notNull().references('users.id'))
    .addColumn('converted_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Alter pipelines — add nullable record_type_id (NOT NULL enforced post-backfill)
  await sql`ALTER TABLE pipelines ADD COLUMN record_type_id uuid REFERENCES record_types(id)`.execute(db);

  // Indexes for high-frequency query paths
  await sql`CREATE INDEX pipeline_records_workspace_id_idx ON pipeline_records(workspace_id)`.execute(db);
  await sql`CREATE INDEX pipeline_records_pipeline_id_idx ON pipeline_records(pipeline_id)`.execute(db);
  await sql`CREATE INDEX pipeline_records_stage_id_idx ON pipeline_records(stage_id)`.execute(db);
  await sql`CREATE INDEX pipeline_records_record_type_id_idx ON pipeline_records(record_type_id)`.execute(db);
  await sql`CREATE INDEX pipeline_records_deleted_at_idx ON pipeline_records(deleted_at)`.execute(db);
  await sql`CREATE INDEX record_type_fields_record_type_id_idx ON record_type_fields(record_type_id)`.execute(db);
  await sql`CREATE INDEX record_conversions_source_record_id_idx ON record_conversions(source_record_id)`.execute(db);
  await sql`CREATE INDEX record_conversions_target_record_id_idx ON record_conversions(target_record_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS pipeline_records_workspace_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS pipeline_records_pipeline_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS pipeline_records_stage_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS pipeline_records_record_type_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS pipeline_records_deleted_at_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS record_type_fields_record_type_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS record_conversions_source_record_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS record_conversions_target_record_id_idx`.execute(db);
  await sql`ALTER TABLE pipelines DROP COLUMN IF EXISTS record_type_id`.execute(db);
  await db.schema.dropTable('record_conversions').ifExists().execute();
  await db.schema.dropTable('conversion_field_mappings').ifExists().execute();
  await db.schema.dropTable('conversion_templates').ifExists().execute();
  await db.schema.dropTable('record_field_values').ifExists().execute();
  await db.schema.dropTable('pipeline_records').ifExists().execute();
  await db.schema.dropTable('stage_required_fields').ifExists().execute();
  await db.schema.dropTable('record_type_permissions').ifExists().execute();
  await db.schema.dropTable('record_type_fields').ifExists().execute();
  await db.schema.dropTable('record_types').ifExists().execute();
}
