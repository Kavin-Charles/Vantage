import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Backfill pipelines that have no record_type_id.
 *
 * seedDefaultPipeline originally created the "Sales" pipeline without a
 * record type. The 20260602_003 migration fixed workspaces that had legacy
 * deals rows, but fresh workspaces seeded after that migration were left with
 * record_type_id = NULL, making record creation impossible and crashing
 * RecordForm when pipeline.record_type.name was accessed.
 *
 * For each workspace with at least one pipeline missing a record type:
 *   1. Create-or-reuse a "Deal" record type.
 *   2. Add default fields and permissions (idempotent via ON CONFLICT).
 *   3. Link all pipelines in that workspace that still have record_type_id NULL.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Create the "Deal" record type for every workspace that has pipelines
  //    with no record_type_id but doesn't already have a "Deal" type.
  await sql`
    INSERT INTO record_types (
      workspace_id, name, icon,
      auto_number_enabled, auto_number_prefix, auto_number_format,
      auto_number_sequence, position
    )
    SELECT DISTINCT p.workspace_id, 'Deal', '💰', true, 'DEAL', 'PREFIX-YY-NNN', 0, 0
    FROM pipelines p
    WHERE p.record_type_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM record_types rt
        WHERE rt.workspace_id = p.workspace_id AND rt.name = 'Deal'
      )
  `.execute(db);

  // 2. Default permissions (idempotent)
  await sql`
    INSERT INTO record_type_permissions
      (record_type_id, role, can_view, can_create, can_edit, can_delete)
    SELECT rt.id, r.role, true, true, true, (r.role = 'admin')
    FROM record_types rt
    CROSS JOIN (VALUES ('admin'), ('member')) AS r(role)
    WHERE rt.name = 'Deal'
      AND NOT EXISTS (
        SELECT 1 FROM record_type_permissions rtp
        WHERE rtp.record_type_id = rt.id AND rtp.role = r.role
      )
  `.execute(db);

  // 3. Standard deal fields (idempotent — only insert if none exist for this type)
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
      AND NOT EXISTS (
        SELECT 1 FROM record_type_fields rtf
        WHERE rtf.record_type_id = rt.id AND rtf.label = f.label
      )
  `.execute(db);

  // 4. Link pipelines that still have no record type
  await sql`
    UPDATE pipelines p
    SET record_type_id = rt.id
    FROM record_types rt
    WHERE rt.workspace_id = p.workspace_id
      AND rt.name = 'Deal'
      AND p.record_type_id IS NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Intentionally a no-op: record types created here may now own records.
  // Reversing the link would orphan pipeline_records rows.
}
