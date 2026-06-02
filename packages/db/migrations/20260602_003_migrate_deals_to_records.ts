import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Seed Deal record_type per workspace (preserve if exists)
  await sql`
    INSERT INTO record_types (
      workspace_id, name, icon,
      auto_number_enabled, auto_number_prefix, auto_number_format,
      auto_number_sequence, position
    )
    SELECT DISTINCT workspace_id, 'Deal', '💰', true, 'DEAL', 'PREFIX-YY-NNN', 0, 0
    FROM deals WHERE workspace_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `.execute(db);

  // 2. Default permissions for Deal record types
  await sql`
    INSERT INTO record_type_permissions
      (record_type_id, role, can_view, can_create, can_edit, can_delete)
    SELECT rt.id, r.role, true, true, true, (r.role = 'admin')
    FROM record_types rt
    CROSS JOIN (VALUES ('admin'), ('member')) AS r(role)
    WHERE rt.name = 'Deal'
    ON CONFLICT (record_type_id, role) DO NOTHING
  `.execute(db);

  // 3. Seed record_type_fields: value, probability, close_date
  await sql`
    INSERT INTO record_type_fields (record_type_id, label, field_type, is_required, position)
    SELECT rt.id, f.label, f.field_type, false, f.pos
    FROM record_types rt
    CROSS JOIN (VALUES
      ('value',       'number', 0),
      ('probability', 'number', 1),
      ('close_date',  'date',   2)
    ) AS f(label, field_type, pos)
    WHERE rt.name = 'Deal'
  `.execute(db);

  // 4. Migrate deals → pipeline_records (preserve UUIDs — tasks/activity FKs stay valid)
  await sql`
    INSERT INTO pipeline_records (
      id, workspace_id, record_type_id, pipeline_id, stage_id,
      name, contact_id, company_id, owner_id,
      deleted_at, created_at, updated_at
    )
    SELECT d.id, d.workspace_id, rt.id, d.pipeline_id, d.stage_id,
      d.name, d.contact_id, d.company_id, d.owner_id,
      d.deleted_at, d.created_at, d.updated_at
    FROM deals d
    JOIN record_types rt ON rt.workspace_id = d.workspace_id AND rt.name = 'Deal'
    WHERE d.pipeline_id IS NOT NULL AND d.stage_id IS NOT NULL
    ON CONFLICT (id) DO NOTHING
  `.execute(db);

  // 5. Migrate value / probability / close_date into record_field_values
  await sql`
    INSERT INTO record_field_values (record_id, field_id, value)
    SELECT d.id, rtf.id, to_jsonb(d.value)
    FROM deals d
    JOIN record_types rt ON rt.workspace_id = d.workspace_id AND rt.name = 'Deal'
    JOIN record_type_fields rtf ON rtf.record_type_id = rt.id AND rtf.label = 'value'
    WHERE d.pipeline_id IS NOT NULL
    ON CONFLICT (record_id, field_id) DO NOTHING
  `.execute(db);

  await sql`
    INSERT INTO record_field_values (record_id, field_id, value)
    SELECT d.id, rtf.id, to_jsonb(d.probability)
    FROM deals d
    JOIN record_types rt ON rt.workspace_id = d.workspace_id AND rt.name = 'Deal'
    JOIN record_type_fields rtf ON rtf.record_type_id = rt.id AND rtf.label = 'probability'
    WHERE d.pipeline_id IS NOT NULL
    ON CONFLICT (record_id, field_id) DO NOTHING
  `.execute(db);

  await sql`
    INSERT INTO record_field_values (record_id, field_id, value)
    SELECT d.id, rtf.id, to_jsonb(d.close_date::text)
    FROM deals d
    JOIN record_types rt ON rt.workspace_id = d.workspace_id AND rt.name = 'Deal'
    JOIN record_type_fields rtf ON rtf.record_type_id = rt.id AND rtf.label = 'close_date'
    WHERE d.close_date IS NOT NULL AND d.pipeline_id IS NOT NULL
    ON CONFLICT (record_id, field_id) DO NOTHING
  `.execute(db);

  // 6. Backfill pipelines.record_type_id
  await sql`
    UPDATE pipelines p SET record_type_id = rt.id
    FROM record_types rt
    WHERE rt.workspace_id = p.workspace_id AND rt.name = 'Deal' AND p.record_type_id IS NULL
  `.execute(db);

  // 7. tasks.deal_id → tasks.record_id
  await db.schema.alterTable('tasks')
    .addColumn('record_id', 'uuid', col => col.references('pipeline_records.id'))
    .execute();
  await sql`UPDATE tasks SET record_id = deal_id WHERE deal_id IS NOT NULL`.execute(db);
  await db.schema.alterTable('tasks').dropColumn('deal_id').execute();

  // 8. activity.deal_id → activity.record_id
  await db.schema.alterTable('activity')
    .addColumn('record_id', 'uuid', col => col.references('pipeline_records.id'))
    .execute();
  await sql`UPDATE activity SET record_id = deal_id WHERE deal_id IS NOT NULL`.execute(db);
  await db.schema.alterTable('activity').dropColumn('deal_id').execute();

  // 9. Drop old tables
  await db.schema.dropTable('deal_field_values').execute();
  await db.schema.dropTable('stage_fields').execute();
  await db.schema.dropTable('deals').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Structural rollback only — data is not restored
  await db.schema
    .createTable('deals')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('contact_id', 'uuid', col => col.references('contacts.id'))
    .addColumn('company_id', 'uuid', col => col.references('companies.id'))
    .addColumn('owner_id', 'uuid', col => col.notNull().references('users.id'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('value', 'decimal', col => col.notNull().defaultTo(0))
    .addColumn('pipeline_id', 'uuid', col => col.references('pipelines.id'))
    .addColumn('stage_id', 'uuid', col => col.references('pipeline_stages.id'))
    .addColumn('probability', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('close_date', 'date')
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.alterTable('tasks').addColumn('deal_id', 'uuid').execute();
  await sql`UPDATE tasks SET deal_id = record_id WHERE record_id IS NOT NULL`.execute(db);
  await db.schema.alterTable('tasks').dropColumn('record_id').execute();
  await db.schema.alterTable('activity').addColumn('deal_id', 'uuid').execute();
  await sql`UPDATE activity SET deal_id = record_id WHERE record_id IS NOT NULL`.execute(db);
  await db.schema.alterTable('activity').dropColumn('record_id').execute();
}
