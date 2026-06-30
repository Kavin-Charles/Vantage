import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { PluginTableDef, PluginColumnType } from '@vencore/plugin-types';

type DB = Kysely<any>;

const MIGRATION_LOG_TABLE = 'plugin_migration_log';
const IDENTIFIER_RE = /^[a-z][a-z0-9_]{0,62}$/;
const MAX_IDENTIFIER_LEN = 63;

const COLUMN_TYPE_MAP: Record<PluginColumnType, string> = {
  uuid: 'uuid',
  text: 'text',
  integer: 'integer',
  bigint: 'bigint',
  boolean: 'boolean',
  decimal: 'decimal(18,6)',
  timestamptz: 'timestamptz',
  jsonb: 'jsonb',
};

function validateIdentifier(name: string, context: string): void {
  if (!IDENTIFIER_RE.test(name)) {
    throw Object.assign(new Error(`Invalid identifier for ${context}: "${name}". Must match ^[a-z][a-z0-9_]{0,62}$`), {
      code: 'INVALID_IDENTIFIER',
    });
  }
  if (name.length > MAX_IDENTIFIER_LEN) {
    throw Object.assign(new Error(`Identifier too long for ${context}: "${name}" (${name.length} > ${MAX_IDENTIFIER_LEN})`), {
      code: 'IDENTIFIER_TOO_LONG',
    });
  }
}

function physicalTableName(pluginSlug: string, name: string): string {
  return `plugin_${pluginSlug.replace(/-/g, '_')}_${name}`;
}

export async function ensureMigrationLog(db: DB): Promise<void> {
  await (db as any).schema
    .createTable(MIGRATION_LOG_TABLE)
    .ifNotExists()
    .addColumn('id', 'uuid', (col: any) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('plugin_slug', 'varchar', (col: any) => col.notNull())
    .addColumn('workspace_id', 'uuid', (col: any) => col.notNull())
    .addColumn('version', 'varchar', (col: any) => col.notNull())
    .addColumn('direction', 'varchar', (col: any) => col.notNull())
    .addColumn('applied_at', 'timestamptz', (col: any) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('plugin_migration_log_unique', ['plugin_slug', 'workspace_id', 'version', 'direction'])
    .execute();
}

/**
 * Generates and runs CREATE TABLE DDL from a PluginTableDef using Kysely's schema builder.
 * No raw SQL. All identifiers are validated before use.
 */
async function createPluginTable(db: DB, pluginSlug: string, tableDef: PluginTableDef): Promise<void> {
  validateIdentifier(pluginSlug.replace(/-/g, '_'), 'plugin slug');
  validateIdentifier(tableDef.name, `table "${tableDef.name}"`);

  const fullName = physicalTableName(pluginSlug, tableDef.name);
  if (fullName.length > MAX_IDENTIFIER_LEN) {
    throw Object.assign(new Error(`Physical table name too long: "${fullName}"`), { code: 'IDENTIFIER_TOO_LONG' });
  }

  let builder = (db as any).schema.createTable(fullName).ifNotExists();

  // Always add workspace_id as first column for row-level tenant scoping
  builder = builder.addColumn('workspace_id', 'uuid', (col: any) => col.notNull());

  for (const col of tableDef.columns) {
    validateIdentifier(col.name, `column "${col.name}" in table "${tableDef.name}"`);

    if (!(col.type in COLUMN_TYPE_MAP)) {
      throw Object.assign(new Error(`Unsupported column type "${col.type}" in column "${col.name}"`), {
        code: 'UNSUPPORTED_COLUMN_TYPE',
      });
    }

    const pgType = COLUMN_TYPE_MAP[col.type];

    builder = builder.addColumn(col.name, pgType, (c: any) => {
      if (col.primary) c = c.primaryKey();
      if (col.type === 'uuid' && col.primary) c = c.defaultTo(sql`gen_random_uuid()`);
      if (!col.nullable && !col.primary) c = c.notNull();
      if (col.unique) c = c.unique();
      // col.default is intentionally NOT passed through — plugins cannot supply raw SQL defaults
      return c;
    });
  }

  await builder.execute();

  // Indexes
  if (tableDef.indexes) {
    for (let i = 0; i < tableDef.indexes.length; i++) {
      const idx = tableDef.indexes[i]!;
      for (const col of idx.columns) {
        validateIdentifier(col, `index column "${col}" in table "${tableDef.name}"`);
      }
      const idxName = `${fullName}_idx_${i}`;
      let idxBuilder = (db as any).schema.createIndex(idxName).ifNotExists().on(fullName).columns(idx.columns);
      if (idx.unique) idxBuilder = idxBuilder.unique();
      await idxBuilder.execute();
    }
  }
}

/**
 * Adds any declared columns missing from an existing physical table.
 * Idempotent (ADD COLUMN IF NOT EXISTS). Lets a plugin add table columns in a
 * new version without an uninstall — the create step only runs IF NOT EXISTS,
 * so without this, schema changes to existing tables would never apply.
 */
async function reconcileColumns(db: DB, pluginSlug: string, tableDef: PluginTableDef): Promise<void> {
  validateIdentifier(pluginSlug.replace(/-/g, '_'), 'plugin slug');
  validateIdentifier(tableDef.name, `table "${tableDef.name}"`);
  const fullName = physicalTableName(pluginSlug, tableDef.name);

  for (const col of tableDef.columns) {
    validateIdentifier(col.name, `column "${col.name}" in table "${tableDef.name}"`);
    if (!(col.type in COLUMN_TYPE_MAP)) continue;
    const pgType = COLUMN_TYPE_MAP[col.type];
    // Identifiers are validated above; pgType is a fixed constant from the map.
    await sql`ALTER TABLE ${sql.ref(fullName)} ADD COLUMN IF NOT EXISTS ${sql.ref(col.name)} ${sql.raw(pgType)}`.execute(db);
  }
}

/**
 * Runs table migrations for a plugin in a workspace.
 * Generates DDL from PluginTableDef — no raw SQL accepted.
 * Creates missing tables and reconciles missing columns on every run.
 * Uses pg_advisory_xact_lock to prevent concurrent creation races.
 */
export async function runMigrations(
  db: DB,
  pluginSlug: string,
  workspaceId: string,
  tables: PluginTableDef[],
): Promise<void> {
  if (tables.length === 0) return;

  await ensureMigrationLog(db);

  await db.transaction().execute(async (trx) => {
    // Advisory lock scoped to this plugin+workspace combo, released at transaction end
    const lockKey = sql`hashtext(${`${pluginSlug}:${workspaceId}`})`;
    await sql`SELECT pg_advisory_xact_lock(${lockKey})`.execute(trx);

    const applied = await (trx as any)
      .selectFrom(MIGRATION_LOG_TABLE)
      .select('version')
      .where('plugin_slug', '=', pluginSlug)
      .where('workspace_id', '=', workspaceId)
      .where('direction', '=', 'up')
      .execute() as Array<{ version: string }>;

    const appliedVersions = new Set(applied.map((r: { version: string }) => r.version));

    for (const tableDef of tables) {
      const versionKey = `table:${tableDef.name}`;

      // Always reconcile: create the table if missing, then add any new columns.
      // Both steps are idempotent, so this is safe to run on every upload.
      await createPluginTable(trx, pluginSlug, tableDef);
      await reconcileColumns(trx, pluginSlug, tableDef);

      if (appliedVersions.has(versionKey)) continue;

      await (trx as any)
        .insertInto(MIGRATION_LOG_TABLE)
        .values({
          plugin_slug: pluginSlug,
          workspace_id: workspaceId,
          version: versionKey,
          direction: 'up',
        })
        .onConflict((oc: any) => oc.constraint('plugin_migration_log_unique').doNothing())
        .execute();
    }
  });
}

/**
 * Drops all plugin-owned tables for a workspace (only those with drop_on_uninstall: true).
 */
export async function dropPluginTables(
  db: DB,
  pluginSlug: string,
  workspaceId: string,
  tables: PluginTableDef[],
): Promise<void> {
  for (const tableDef of tables) {
    if (!tableDef.drop_on_uninstall) continue;
    validateIdentifier(pluginSlug.replace(/-/g, '_'), 'plugin slug');
    validateIdentifier(tableDef.name, `table "${tableDef.name}"`);
    const fullName = physicalTableName(pluginSlug, tableDef.name);
    await (db as any).schema.dropTable(fullName).ifExists().execute();
  }

  await (db as any)
    .deleteFrom(MIGRATION_LOG_TABLE)
    .where('plugin_slug', '=', pluginSlug)
    .where('workspace_id', '=', workspaceId)
    .execute();
}
