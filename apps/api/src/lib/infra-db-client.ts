import type { InfraDatabase } from '@vantage/db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

type SupportedDialect = 'postgres' | 'mysql';
type SupportedEngine = Extract<InfraDatabase['engine'], SupportedDialect>;
type MongoEngine = Extract<InfraDatabase['engine'], 'mongo'>;
type DataRow = Record<string, unknown>;

export type SafeInfraDatabase = Omit<InfraDatabase, 'db_password'> & {
  has_password: boolean;
};

export interface InfraDbColumn {
  name: string;
  data_type: string;
  nullable: boolean;
  primary_key: boolean;
}

export interface InfraDbTable {
  schema: string;
  name: string;
  columns: InfraDbColumn[];
  primary_key: string[];
}

export interface InfraDbRowsResult {
  columns: InfraDbColumn[];
  rows: DataRow[];
  primary_key: string[];
  page: number;
  limit: number;
}

export interface InfraDbSqlResult {
  columns: string[];
  rows: DataRow[];
  row_count: number;
  kind: 'select' | 'dml';
}

export interface InfraDbConnectionTestResult {
  ok: boolean;
  latency_ms: number;
  message: string;
}

export type SqlClassification =
  | { kind: 'select' }
  | { kind: 'dml' }
  | { kind: 'blocked'; code: 'BLOCKED_SQL' | 'MULTI_STATEMENT_SQL' | 'EMPTY_SQL'; message: string };

const BLOCKED_SQL_VERBS = new Set(['drop', 'truncate', 'alter', 'create', 'grant', 'revoke']);
const DML_SQL_VERBS = new Set(['insert', 'update', 'delete']);

export function redactInfraDatabase(row: InfraDatabase): SafeInfraDatabase {
  const { db_password: dbPassword, ...safe } = row;
  return {
    ...safe,
    has_password: Boolean(dbPassword),
  };
}

export function classifySqlStatement(sql: string): SqlClassification {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { kind: 'blocked', code: 'EMPTY_SQL', message: 'SQL is required.' };
  }

  const withoutTrailingSemicolon = trimmed.replace(/;\s*$/, '');
  if (withoutTrailingSemicolon.includes(';')) {
    return {
      kind: 'blocked',
      code: 'MULTI_STATEMENT_SQL',
      message: 'Only one SQL statement can be run at a time.',
    };
  }

  const verb = withoutTrailingSemicolon.match(/^([a-z]+)/i)?.[1]?.toLowerCase();
  if (!verb) {
    return { kind: 'blocked', code: 'EMPTY_SQL', message: 'SQL is required.' };
  }

  if (BLOCKED_SQL_VERBS.has(verb)) {
    return {
      kind: 'blocked',
      code: 'BLOCKED_SQL',
      message: 'Schema-changing SQL is not allowed from Vantage.',
    };
  }

  if (verb === 'select' || verb === 'with') {
    if (verb === 'with' && /\b(drop|truncate|alter|create|grant|revoke)\b/i.test(withoutTrailingSemicolon)) {
      return {
        kind: 'blocked',
        code: 'BLOCKED_SQL',
        message: 'Schema-changing SQL is not allowed from Vantage.',
      };
    }
    if (verb === 'with' && /\b(insert|update|delete)\b/i.test(withoutTrailingSemicolon)) {
      return { kind: 'dml' };
    }
    return { kind: 'select' };
  }

  if (DML_SQL_VERBS.has(verb)) {
    return { kind: 'dml' };
  }

  return {
    kind: 'blocked',
    code: 'BLOCKED_SQL',
    message: 'Only SELECT, INSERT, UPDATE, and DELETE statements are allowed.',
  };
}

export function normalizeSql(sql: string): string {
  return sql.trim().replace(/;\s*$/, '');
}

export function quoteIdentifier(
  dialect: SupportedDialect,
  identifier: string,
  allowedIdentifiers: readonly string[],
): string {
  if (!allowedIdentifiers.includes(identifier)) {
    throw new Error('Unknown identifier');
  }

  if (dialect === 'mysql') {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }

  return `"${identifier.replace(/"/g, '""')}"`;
}

function isSupportedEngine(engine: InfraDatabase['engine']): engine is SupportedEngine {
  return engine === 'postgres' || engine === 'mysql';
}

function assertSupportedEngine(row: InfraDatabase): asserts row is InfraDatabase & { engine: SupportedEngine } {
  if (!isSupportedEngine(row.engine)) {
    throw new Error('Data browsing is only supported for Postgres and MySQL databases.');
  }
}

function requireConnectionConfig(row: InfraDatabase, passwordOverride?: string): {
  host: string;
  port: number;
  user: string;
  password: string | undefined;
  database: string;
  useSsl: boolean;
} {
  if (!row.host || !row.port || !row.db_user || !row.database_name) {
    throw new Error('Host, port, user, and database name are required.');
  }

  return {
    host: row.host,
    port: row.port,
    user: row.db_user,
    password: passwordOverride ?? row.db_password ?? undefined,
    database: row.database_name,
    useSsl: row.use_ssl,
  };
}

async function withPostgresClient<T>(
  row: InfraDatabase,
  passwordOverride: string | undefined,
  callback: (client: import('pg').Client) => Promise<T>,
): Promise<T> {
  const { Client } = await import('pg');
  const config = requireConnectionConfig(row, passwordOverride);
  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.useSsl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
  });

  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function withMysqlClient<T>(
  row: InfraDatabase,
  passwordOverride: string | undefined,
  callback: (client: import('mysql2/promise').Connection) => Promise<T>,
): Promise<T> {
  const mysql = await import('mysql2/promise');
  const config = requireConnectionConfig(row, passwordOverride);
  const client = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.useSsl ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 5000,
  });

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function withTargetClient<T>(
  row: InfraDatabase,
  passwordOverride: string | undefined,
  callback: {
    postgres: (client: import('pg').Client) => Promise<T>;
    mysql: (client: import('mysql2/promise').Connection) => Promise<T>;
  },
): Promise<T> {
  assertSupportedEngine(row);
  if (row.engine === 'postgres') {
    return withPostgresClient(row, passwordOverride, callback.postgres);
  }
  return withMysqlClient(row, passwordOverride, callback.mysql);
}

export async function testTargetDatabaseConnection(
  row: InfraDatabase,
  passwordOverride?: string,
): Promise<InfraDbConnectionTestResult> {
  if (isMongoEngine(row.engine)) {
    return testMongoConnection(row, passwordOverride);
  }
  const start = Date.now();
  try {
    await withTargetClient(row, passwordOverride, {
      postgres: async client => { await client.query('SELECT 1'); },
      mysql: async client => { await client.query('SELECT 1'); },
    });
    return { ok: true, latency_ms: Date.now() - start, message: 'Connection succeeded.' };
  } catch (err) {
    return {
      ok: false,
      latency_ms: Date.now() - start,
      message: err instanceof Error ? err.message : 'Connection failed.',
    };
  }
}

export async function listTargetDatabaseSchema(row: InfraDatabase): Promise<InfraDbTable[]> {
  assertSupportedEngine(row);

  if (row.engine === 'postgres') {
    return withPostgresClient(row, undefined, async client => {
      const result = await client.query<{
        table_schema: string;
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: 'YES' | 'NO';
        is_primary: boolean;
      }>(`
        SELECT
          c.table_schema,
          c.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          (tc.constraint_type = 'PRIMARY KEY') AS is_primary
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage kcu
          ON c.table_schema = kcu.table_schema
          AND c.table_name = kcu.table_name
          AND c.column_name = kcu.column_name
        LEFT JOIN information_schema.table_constraints tc
          ON kcu.constraint_schema = tc.constraint_schema
          AND kcu.constraint_name = tc.constraint_name
          AND tc.constraint_type = 'PRIMARY KEY'
        WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
      `);
      return groupColumnsIntoTables(result.rows);
    });
  }

  return withMysqlClient(row, undefined, async client => {
    const [rows] = await client.query<Array<RowDataPacket & {
      table_schema: string;
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: 'YES' | 'NO';
      column_key: string;
    }>>(
      `
        SELECT
          table_schema,
          table_name,
          column_name,
          data_type,
          is_nullable,
          column_key
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        ORDER BY table_schema, table_name, ordinal_position
      `,
    );
    return groupColumnsIntoTables(rows.map(r => ({
      table_schema: r.table_schema,
      table_name: r.table_name,
      column_name: r.column_name,
      data_type: r.data_type,
      is_nullable: r.is_nullable,
      is_primary: r.column_key === 'PRI',
    })));
  });
}

function groupColumnsIntoTables(rows: Array<{
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  is_primary: boolean;
}>): InfraDbTable[] {
  const byTable = new Map<string, InfraDbTable>();
  for (const row of rows) {
    const key = `${row.table_schema}.${row.table_name}`;
    const table = byTable.get(key) ?? {
      schema: row.table_schema,
      name: row.table_name,
      columns: [],
      primary_key: [],
    };
    table.columns.push({
      name: row.column_name,
      data_type: row.data_type,
      nullable: row.is_nullable === 'YES',
      primary_key: row.is_primary,
    });
    if (row.is_primary) table.primary_key.push(row.column_name);
    byTable.set(key, table);
  }
  return [...byTable.values()];
}

function findTableOrThrow(tables: InfraDbTable[], schema: string, table: string): InfraDbTable {
  const found = tables.find(t => t.schema === schema && t.name === table);
  if (!found) throw new Error('Unknown table');
  return found;
}

export async function listTargetDatabaseRows(
  row: InfraDatabase,
  schema: string,
  table: string,
  page: number,
  limit: number,
): Promise<InfraDbRowsResult> {
  assertSupportedEngine(row);
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const offset = (safePage - 1) * safeLimit;
  const tables = await listTargetDatabaseSchema(row);
  const tableMeta = findTableOrThrow(tables, schema, table);
  const schemas = [...new Set(tables.map(t => t.schema))];
  const tableNames = tables.filter(t => t.schema === schema).map(t => t.name);

  if (row.engine === 'postgres') {
    return withPostgresClient(row, undefined, async client => {
      const schemaSql = quoteIdentifier('postgres', schema, schemas);
      const tableSql = quoteIdentifier('postgres', table, tableNames);
      const result = await client.query<DataRow>(
        `SELECT * FROM ${schemaSql}.${tableSql} LIMIT $1 OFFSET $2`,
        [safeLimit, offset],
      );
      return {
        columns: tableMeta.columns,
        rows: result.rows,
        primary_key: tableMeta.primary_key,
        page: safePage,
        limit: safeLimit,
      };
    });
  }

  return withMysqlClient(row, undefined, async client => {
    const schemaSql = quoteIdentifier('mysql', schema, schemas);
    const tableSql = quoteIdentifier('mysql', table, tableNames);
    const [rows] = await client.query<RowDataPacket[]>(
      `SELECT * FROM ${schemaSql}.${tableSql} LIMIT ? OFFSET ?`,
      [safeLimit, offset],
    );
    return {
      columns: tableMeta.columns,
      rows: rows.map(r => ({ ...r })),
      primary_key: tableMeta.primary_key,
      page: safePage,
      limit: safeLimit,
    };
  });
}

export async function updateTargetDatabaseRow(
  row: InfraDatabase,
  schema: string,
  table: string,
  original: DataRow,
  changes: DataRow,
): Promise<{ ok: true }> {
  assertSupportedEngine(row);
  const tables = await listTargetDatabaseSchema(row);
  const tableMeta = findTableOrThrow(tables, schema, table);
  const columnNames = tableMeta.columns.map(c => c.name);
  const changedColumns = Object.keys(changes).filter(key => columnNames.includes(key));
  if (changedColumns.length === 0) return { ok: true };

  const whereColumns = tableMeta.primary_key.length > 0 ? tableMeta.primary_key : columnNames;
  const schemas = [...new Set(tables.map(t => t.schema))];
  const tableNames = tables.filter(t => t.schema === schema).map(t => t.name);

  if (row.engine === 'postgres') {
    return withPostgresClient(row, undefined, async client => {
      const values: unknown[] = [];
      const setSql = changedColumns.map(column => {
        values.push(changes[column]);
        return `${quoteIdentifier('postgres', column, columnNames)} = $${values.length}`;
      });
      const whereSql = whereColumns.map(column => {
        const quoted = quoteIdentifier('postgres', column, columnNames);
        const value = original[column];
        if (value === null || value === undefined) return `${quoted} IS NULL`;
        values.push(value);
        return `${quoted} = $${values.length}`;
      });
      const result = await client.query(
        `UPDATE ${quoteIdentifier('postgres', schema, schemas)}.${quoteIdentifier('postgres', table, tableNames)}
         SET ${setSql.join(', ')}
         WHERE ${whereSql.join(' AND ')}`,
        values,
      );
      if (result.rowCount !== 1) throw new Error('CONFLICT');
      return { ok: true };
    });
  }

  return withMysqlClient(row, undefined, async client => {
    const values: unknown[] = [];
    const setSql = changedColumns.map(column => {
      values.push(changes[column]);
      return `${quoteIdentifier('mysql', column, columnNames)} = ?`;
    });
    const whereSql = whereColumns.map(column => {
      const quoted = quoteIdentifier('mysql', column, columnNames);
      const value = original[column];
      if (value === null || value === undefined) return `${quoted} IS NULL`;
      values.push(value);
      return `${quoted} = ?`;
    });
    const [result] = await client.query<ResultSetHeader>(
      `UPDATE ${quoteIdentifier('mysql', schema, schemas)}.${quoteIdentifier('mysql', table, tableNames)}
       SET ${setSql.join(', ')}
       WHERE ${whereSql.join(' AND ')}`,
      values,
    );
    if (result.affectedRows !== 1) throw new Error('CONFLICT');
    return { ok: true };
  });
}

export async function runTargetDatabaseSql(
  row: InfraDatabase,
  sql: string,
): Promise<InfraDbSqlResult> {
  assertSupportedEngine(row);
  const classification = classifySqlStatement(sql);
  if (classification.kind === 'blocked') {
    throw new Error(classification.code);
  }
  const normalized = normalizeSql(sql);

  if (row.engine === 'postgres') {
    return withPostgresClient(row, undefined, async client => {
      if (classification.kind === 'select') {
        const result = await client.query<DataRow>(`SELECT * FROM (${normalized}) vantage_sql_result LIMIT 100`);
        return {
          kind: 'select',
          columns: result.fields.map(field => field.name),
          rows: result.rows,
          row_count: result.rowCount ?? result.rows.length,
        };
      }
      const result = await client.query(normalized);
      return { kind: 'dml', columns: [], rows: [], row_count: result.rowCount ?? 0 };
    });
  }

  return withMysqlClient(row, undefined, async client => {
    if (classification.kind === 'select') {
      const [rows, fields] = await client.query<RowDataPacket[]>(`SELECT * FROM (${normalized}) AS vantage_sql_result LIMIT 100`);
      return {
        kind: 'select',
        columns: fields.map(field => field.name),
        rows: rows.map(r => ({ ...r })),
        row_count: rows.length,
      };
    }
    const [result] = await client.query<ResultSetHeader>(normalized);
    return { kind: 'dml', columns: [], rows: [], row_count: result.affectedRows };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MongoDB support
// ─────────────────────────────────────────────────────────────────────────────

// Suppress unused-type lint — MongoEngine is used as a guard type below
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _MongoGuard = MongoEngine;

function isMongoEngine(engine: InfraDatabase['engine']): engine is 'mongo' {
  return engine === 'mongo';
}

/**
 * Build a MongoDB connection URI from the InfraDatabase row.
 * Users may store a full URI in the `host` field or individual fields.
 */
function buildMongoUri(row: InfraDatabase, passwordOverride?: string): string {
  const host = row.host ?? 'localhost';

  // If host already looks like a full URI, use it directly (replacing password if overridden)
  if (host.startsWith('mongodb://') || host.startsWith('mongodb+srv://')) {
    if (passwordOverride) {
      // Inject password into existing URI  mongodb://user:PASS@host/db
      return host.replace(/(:\/\/[^:@]*:)[^@]+(@)/, `$1${encodeURIComponent(passwordOverride)}$2`);
    }
    return host;
  }

  const port = row.port ?? 27017;
  const user = row.db_user;
  const password = passwordOverride ?? row.db_password ?? undefined;
  const database = row.database_name ?? 'admin';

  if (user && password) {
    return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }
  if (user) {
    return `mongodb://${encodeURIComponent(user)}@${host}:${port}/${database}`;
  }
  return `mongodb://${host}:${port}/${database}`;
}

async function withMongoClient<T>(
  row: InfraDatabase,
  passwordOverride: string | undefined,
  callback: (
    client: import('mongodb').MongoClient,
    db: import('mongodb').Db,
  ) => Promise<T>,
): Promise<T> {
  const { MongoClient } = await import('mongodb');
  const uri = buildMongoUri(row, passwordOverride);
  const dbName = row.database_name ?? undefined;
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    tls: row.use_ssl,
    tlsAllowInvalidCertificates: row.use_ssl, // dev-friendly; prod can tighten
  });
  await client.connect();
  try {
    const db = client.db(dbName);
    return await callback(client, db);
  } finally {
    await client.close();
  }
}

/** Infer field types from a sample document. */
function inferDocumentFields(doc: Record<string, unknown>): InfraDbColumn[] {
  return Object.keys(doc).map(key => {
    const value = doc[key];
    let data_type = 'string';
    if (value === null || value === undefined) data_type = 'null';
    else if (typeof value === 'number') data_type = Number.isInteger(value) ? 'int' : 'double';
    else if (typeof value === 'boolean') data_type = 'boolean';
    else if (value instanceof Date) data_type = 'date';
    else if (typeof value === 'object' && !Array.isArray(value)) data_type = 'object';
    else if (Array.isArray(value)) data_type = 'array';
    else if (typeof value === 'string') {
      // ObjectId strings look like 24-char hex
      if (/^[0-9a-f]{24}$/i.test(value)) data_type = 'objectId';
      else data_type = 'string';
    }
    return {
      name: key,
      data_type,
      nullable: true,
      primary_key: key === '_id',
    };
  });
}

export async function testMongoConnection(
  row: InfraDatabase,
  passwordOverride?: string,
): Promise<InfraDbConnectionTestResult> {
  const start = Date.now();
  try {
    await withMongoClient(row, passwordOverride, async (client) => {
      await client.db('admin').command({ ping: 1 });
    });
    return { ok: true, latency_ms: Date.now() - start, message: 'Connection succeeded.' };
  } catch (err) {
    return {
      ok: false,
      latency_ms: Date.now() - start,
      message: err instanceof Error ? err.message : 'Connection failed.',
    };
  }
}

/** Returns MongoDB collections as InfraDbTable entries (schema = db name). */
export async function listMongoSchema(row: InfraDatabase): Promise<InfraDbTable[]> {
  return withMongoClient(row, undefined, async (_client, db) => {
    const dbName = db.databaseName;
    const collections = await db.listCollections().toArray();
    const tables: InfraDbTable[] = [];

    for (const coll of collections) {
      // Sample up to 5 docs to infer schema
      const rawDocs = await db.collection<Record<string, unknown>>(coll.name).find({}).limit(5).toArray();
      const docs: Record<string, unknown>[] = rawDocs.map(d => d as Record<string, unknown>);
      const merged: Record<string, unknown> = {};
      for (const doc of docs) {
        for (const [k, v] of Object.entries(doc)) {
          if (!(k in merged)) merged[k] = v;
        }
      }
      const columns = docs.length > 0
        ? inferDocumentFields(merged)
        : [{ name: '_id', data_type: 'objectId', nullable: false, primary_key: true }];

      tables.push({
        schema: dbName,
        name: coll.name,
        columns,
        primary_key: ['_id'],
      });
    }
    return tables;
  });
}

/** Browse documents in a MongoDB collection (paginated). */
export async function listMongoRows(
  row: InfraDatabase,
  collectionName: string,
  page: number,
  limit: number,
): Promise<InfraDbRowsResult> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const skip = (safePage - 1) * safeLimit;

  return withMongoClient(row, undefined, async (_client, db) => {
    const dbName = db.databaseName;
    const rawDocs = await db.collection<Record<string, unknown>>(collectionName).find({}).skip(skip).limit(safeLimit).toArray();
    const docs: Record<string, unknown>[] = rawDocs.map(d => d as Record<string, unknown>);

    // Infer columns from first page results
    const merged: Record<string, unknown> = {};
    for (const doc of docs) {
      for (const [k, v] of Object.entries(doc)) {
        if (!(k in merged)) merged[k] = v;
      }
    }
    const columns = docs.length > 0
      ? inferDocumentFields(merged)
      : [{ name: '_id', data_type: 'objectId', nullable: false, primary_key: true }];

    return {
      columns,
      rows: docs.map(doc => {
        const r: DataRow = {};
        for (const [k, v] of Object.entries(doc)) {
          // Serialize complex types to JSON strings for display
          if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
            r[k] = JSON.stringify(v);
          } else {
            r[k] = v;
          }
        }
        return r;
      }),
      primary_key: ['_id'],
      page: safePage,
      limit: safeLimit,
    };
  });
}

/**
 * Run a MongoDB query. `queryStr` is either:
 *   - A JSON object: `{"field": "value"}` → find filter
 *   - A JSON array:  `[{"$match": {...}}, {"$group": {...}}]` → aggregate pipeline
 */
export async function runMongoQuery(
  row: InfraDatabase,
  collectionName: string,
  queryStr: string,
): Promise<InfraDbSqlResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(queryStr.trim() || '{}');
  } catch {
    throw new Error('Invalid JSON query. Use {} for find-all, {"field":"value"} for filter, or [{$match:...},...] for aggregate pipeline.');
  }

  return withMongoClient(row, undefined, async (_client, db) => {
    const coll = db.collection(collectionName);
    let docs: Record<string, unknown>[];

    if (Array.isArray(parsed)) {
      // Aggregate pipeline
      docs = await coll.aggregate(parsed as object[]).limit(100).toArray() as Record<string, unknown>[];
    } else {
      // Find filter
      docs = await coll.find(parsed as object).limit(100).toArray() as Record<string, unknown>[];
    }

    // Collect columns from merged sample
    const merged: Record<string, unknown> = {};
    for (const doc of docs) {
      for (const [k, v] of Object.entries(doc)) {
        if (!(k in merged)) merged[k] = v;
      }
    }
    const columns = Object.keys(merged);

    return {
      kind: 'select',
      columns,
      rows: docs.map(doc => {
        const r: DataRow = {};
        for (const [k, v] of Object.entries(doc)) {
          r[k] = (v !== null && typeof v === 'object' && !(v instanceof Date))
            ? JSON.stringify(v)
            : v;
        }
        return r;
      }),
      row_count: docs.length,
    };
  });
}
