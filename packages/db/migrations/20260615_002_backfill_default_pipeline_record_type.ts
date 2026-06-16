import type { Kysely } from 'kysely';

// This backfill was intended to run before 20260615_001_pipeline_overhaul,
// which dropped record_type_id from pipelines. Since pipeline_overhaul has
// already been applied, this migration is a no-op.
export async function up(_db: Kysely<unknown>): Promise<void> {}

export async function down(_db: Kysely<unknown>): Promise<void> {}
