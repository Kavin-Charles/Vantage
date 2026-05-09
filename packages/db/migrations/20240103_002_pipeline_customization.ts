import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // pipelines
  await db.schema
    .createTable('pipelines')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('is_default', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('position', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  // pipeline_stages
  await db.schema
    .createTable('pipeline_stages')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('pipeline_id', 'uuid', col => col.notNull().references('pipelines.id').onDelete('cascade'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('color', 'text', col => col.notNull().defaultTo('#6366f1'))
    .addColumn('position', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('is_won', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('is_lost', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  // stage_fields
  await db.schema
    .createTable('stage_fields')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('stage_id', 'uuid', col => col.notNull().references('pipeline_stages.id').onDelete('cascade'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('field_type', 'text', col => col.notNull()) // text|number|date|select|boolean
    .addColumn('is_required', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('options', 'jsonb')
    .addColumn('position', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  // deal_field_values
  await db.schema
    .createTable('deal_field_values')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('deal_id', 'uuid', col => col.notNull().references('deals.id').onDelete('cascade'))
    .addColumn('field_id', 'uuid', col => col.notNull().references('stage_fields.id').onDelete('cascade'))
    .addColumn('value', 'text', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('deal_field_values_deal_field_unique')
    .on('deal_field_values')
    .columns(['deal_id', 'field_id'])
    .unique()
    .execute();

  // Add pipeline_id + stage_id to deals
  await db.schema
    .alterTable('deals')
    .addColumn('pipeline_id', 'uuid', col => col.references('pipelines.id'))
    .execute();
  await db.schema
    .alterTable('deals')
    .addColumn('stage_id', 'uuid', col => col.references('pipeline_stages.id'))
    .execute();

  // Backfill existing deals:
  // 1. Insert default pipeline per workspace
  await sql`
    INSERT INTO pipelines (workspace_id, name, is_default, position)
    SELECT DISTINCT workspace_id, 'Sales', true, 0
    FROM deals
    WHERE workspace_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `.execute(db);

  // 2. Insert 6 default stages for each pipeline
  await sql`
    INSERT INTO pipeline_stages (pipeline_id, name, color, position, is_won, is_lost)
    SELECT
      p.id,
      s.name,
      s.color,
      s.position,
      s.is_won,
      s.is_lost
    FROM pipelines p
    CROSS JOIN (VALUES
      ('Lead',       '#6366f1', 1, false, false),
      ('Qualifying', '#8b5cf6', 2, false, false),
      ('Proposal',   '#a855f7', 3, false, false),
      ('Closing',    '#ec4899', 4, false, false),
      ('Won',        '#22c55e', 5, true,  false),
      ('Lost',       '#ef4444', 6, false, true)
    ) AS s(name, color, position, is_won, is_lost)
  `.execute(db);

  // 3. Backfill deals.pipeline_id + deals.stage_id based on old stage enum
  await sql`
    UPDATE deals d
    SET
      pipeline_id = p.id,
      stage_id = ps.id
    FROM pipelines p
    JOIN pipeline_stages ps ON ps.pipeline_id = p.id
      AND LOWER(ps.name) = LOWER(d.stage::text)
    WHERE p.workspace_id = d.workspace_id
      AND p.is_default = true
  `.execute(db);

  // 4. Drop old stage column
  await db.schema.alterTable('deals').dropColumn('stage').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('deals').addColumn('stage', 'text', col => col.defaultTo('lead')).execute();
  await db.schema.alterTable('deals').dropColumn('pipeline_id').execute();
  await db.schema.alterTable('deals').dropColumn('stage_id').execute();
  await db.schema.dropTable('deal_field_values').execute();
  await db.schema.dropTable('stage_fields').execute();
  await db.schema.dropTable('pipeline_stages').execute();
  await db.schema.dropTable('pipelines').execute();
}
