import { Router, type Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database, InfraDatabase, InfraDatabaseUpdate } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { logActivity } from '../lib/log-activity';
import {
  classifySqlStatement,
  listMongoRows,
  listMongoSchema,
  listTargetDatabaseRows,
  listTargetDatabaseSchema,
  redactInfraDatabase,
  runMongoQuery,
  runTargetDatabaseSql,
  testTargetDatabaseConnection,
  updateTargetDatabaseRow,
} from '../lib/infra-db-client';

const createSchema = z.object({
  name: z.string().min(1),
  engine: z.enum(['postgres', 'mysql', 'redis', 'clickhouse', 'mongo', 'other']),
  host: z.string().optional(),
  port: z.number().int().optional(),
  version: z.string().optional(),
  db_user: z.string().optional(),
  db_password: z.string().optional(),
  database_name: z.string().optional(),
  use_ssl: z.boolean().optional(),
});

const updateSchema = createSchema.partial();
const testSchema = z.object({ db_password: z.string().optional() });
const rowsQuerySchema = z.object({
  schema: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const updateRowSchema = z.object({
  schema: z.string().min(1),
  original: z.record(z.unknown()),
  changes: z.record(z.unknown()),
});
const sqlSchema = z.object({
  sql: z.string().min(1),
  confirmed: z.boolean().optional(),
});

const dbThresholdSchema = z.object({
  connection_count_max: z.number().int().positive().optional(),
  replication_lag_s_max: z.number().positive().optional(),
  storage_gb_max: z.number().positive().optional(),
});

function isAdmin(req: AuthenticatedRequest): boolean {
  return req.user.role === 'admin';
}

function forbidden(res: Response): void {
  res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Admin role required' } });
}

async function getWorkspaceDatabase(
  db: Kysely<Database>,
  workspaceId: string,
  id: string,
): Promise<InfraDatabase | undefined> {
  return db
    .selectFrom('infra_databases')
    .where('id', '=', id)
    .where('workspace_id', '=', workspaceId)
    .selectAll()
    .executeTakeFirst();
}

function buildConnectionString(infraDb: {
  engine: string;
  host: string | null;
  port: number | null;
  db_user: string | null;
  db_password: string | null;
  database_name: string | null;
  use_ssl: boolean;
}, reveal: boolean): string {
  const password = reveal ? (infraDb.db_password ?? '') : '****';
  const host = infraDb.host ?? 'localhost';
  const port = infraDb.port;
  switch (infraDb.engine) {
    case 'postgres': {
      const portPart = port ? `:${port}` : ':5432';
      const user = infraDb.db_user ? `${infraDb.db_user}:${password}@` : '';
      const dbName = infraDb.database_name ?? '';
      const ssl = infraDb.use_ssl ? '?sslmode=require' : '';
      return `postgresql://${user}${host}${portPart}/${dbName}${ssl}`;
    }
    case 'mysql': {
      const portPart = port ? `:${port}` : ':3306';
      const user = infraDb.db_user ? `${infraDb.db_user}:${password}@` : '';
      const dbName = infraDb.database_name ?? '';
      return `mysql://${user}${host}${portPart}/${dbName}`;
    }
    case 'redis': {
      const portPart = port ? `:${port}` : ':6379';
      const auth = password ? `:${password}@` : '';
      return `redis://${auth}${host}${portPart}`;
    }
    case 'mongo': {
      const portPart = port ? `:${port}` : ':27017';
      const user = infraDb.db_user ? `${infraDb.db_user}:${password}@` : '';
      const dbName = infraDb.database_name ?? '';
      return `mongodb://${user}${host}${portPart}/${dbName}`;
    }
    case 'clickhouse': {
      const portPart = port ? `:${port}` : ':8123';
      const user = infraDb.db_user ? `${infraDb.db_user}:${password}@` : '';
      const dbName = infraDb.database_name ?? 'default';
      return `clickhouse://${user}${host}${portPart}/${dbName}`;
    }
    default: {
      const portPart = port ? `:${port}` : '';
      const user = infraDb.db_user ? `${infraDb.db_user}:${password}@` : '';
      return `${infraDb.engine}://${user}${host}${portPart}`;
    }
  }
}

async function insertQueryHistory(
  db: Kysely<Database>,
  params: {
    workspaceId: string;
    databaseId: string;
    userId: string;
    engine: string;
    queryText: string;
    queryType: 'sql' | 'mongo';
    rowCount: number | null;
    durationMs: number | null;
  },
): Promise<void> {
  await db
    .insertInto('infra_db_query_history')
    .values({
      workspace_id: params.workspaceId,
      database_id: params.databaseId,
      user_id: params.userId,
      engine: params.engine,
      query_text: params.queryText,
      query_type: params.queryType,
      row_count: params.rowCount,
      duration_ms: params.durationMs,
    })
    .execute();

  const oldest = await db
    .selectFrom('infra_db_query_history')
    .where('database_id', '=', params.databaseId)
    .where('user_id', '=', params.userId)
    .select('id')
    .orderBy('executed_at', 'desc')
    .offset(100)
    .execute();

  if (oldest.length > 0) {
    await db
      .deleteFrom('infra_db_query_history')
      .where('id', 'in', oldest.map(r => r.id))
      .execute();
  }
}

function sendInfraError(res: Response, err: unknown): boolean {
  const message = err instanceof Error ? err.message : 'Database operation failed';
  if (message === 'CONFLICT') {
    res.status(409).json({ data: null, error: { code: 'CONFLICT', message: 'Row changed or matched multiple rows' } });
    return true;
  }
  if (message === 'BLOCKED_SQL' || message === 'MULTI_STATEMENT_SQL' || message === 'EMPTY_SQL') {
    res.status(400).json({ data: null, error: { code: message, message: 'SQL is not allowed' } });
    return true;
  }
  if (message.includes('only supported') || message.includes('required') || message.includes('Unknown')) {
    res.status(400).json({ data: null, error: { code: 'DATABASE_OPERATION_ERROR', message } });
    return true;
  }
  return false;
}

export function createInfraDatabasesRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // Static routes MUST come before /:id to avoid param capture

  // POST /test-connection — stateless, no DB record required
  router.post('/test-connection', async (req, res, next) => {
    try {
      const body = createSchema.parse(req.body);
      const tempDb = {
        engine: body.engine,
        host: body.host ?? null,
        port: body.port ?? null,
        db_user: body.db_user ?? null,
        db_password: body.db_password ?? null,
        database_name: body.database_name ?? null,
        use_ssl: body.use_ssl ?? false,
      };
      const result = await testTargetDatabaseConnection(tempDb as Parameters<typeof testTargetDatabaseConnection>[0], undefined);
      res.json({ data: result, error: null });
    } catch (err) { next(err); }
  });

  // GET /thresholds/defaults
  router.get('/thresholds/defaults', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const row = await db
        .selectFrom('infra_db_thresholds')
        .where('workspace_id', '=', workspace.id)
        .where('database_id', 'is', null)
        .selectAll()
        .executeTakeFirst();
      res.json({ data: row ?? { connection_count_max: 100, replication_lag_s_max: 30, storage_gb_max: 500 }, error: null });
    } catch (err) { next(err); }
  });

  // PUT /thresholds/defaults
  router.put('/thresholds/defaults', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      if (!isAdmin(req as unknown as AuthenticatedRequest)) { forbidden(res); return; }
      const body = dbThresholdSchema.parse(req.body);
      const existing = await db
        .selectFrom('infra_db_thresholds')
        .where('workspace_id', '=', workspace.id)
        .where('database_id', 'is', null)
        .select('id')
        .executeTakeFirst();
      let result;
      if (existing) {
        result = await db
          .updateTable('infra_db_thresholds')
          .set({ ...body, updated_at: new Date().toISOString() })
          .where('id', '=', existing.id)
          .returningAll()
          .executeTakeFirstOrThrow();
      } else {
        result = await db
          .insertInto('infra_db_thresholds')
          .values({ workspace_id: workspace.id, database_id: null, ...body })
          .returningAll()
          .executeTakeFirstOrThrow();
      }
      res.json({ data: result, error: null });
    } catch (err) { next(err); }
  });

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const dbs = await db
        .selectFrom('infra_databases')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .execute();
      res.json({ data: dbs.map(redactInfraDatabase), total: dbs.length, error: null });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      if (!isAdmin(req as unknown as AuthenticatedRequest)) { forbidden(res); return; }
      const body = createSchema.parse(req.body);
      const result = await db
        .insertInto('infra_databases')
        .values({
          workspace_id: workspace.id,
          ...body,
          host: body.host ?? null,
          port: body.port ?? null,
          version: body.version ?? null,
          db_user: body.db_user ?? null,
          db_password: body.db_password ?? null,
          database_name: body.database_name ?? null,
          use_ssl: body.use_ssl ?? false,
          status: 'offline',
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: (req as unknown as AuthenticatedRequest).user.id,
        type: 'database_added',
        source_module_id: 'databases',
        record_id: result.id,
        body: `Added database "${result.name}"`,
        meta: { engine: result.engine, host: result.host },
      });
      res.status(201).json({ data: redactInfraDatabase(result), error: null });
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const result = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!result) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      res.json({ data: redactInfraDatabase(result), error: null });
    } catch (err) { next(err); }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      if (!isAdmin(req as unknown as AuthenticatedRequest)) { forbidden(res); return; }
      const body = updateSchema.parse(req.body);
      const { db_password: dbPassword, ...rest } = body;
      const updateValues: InfraDatabaseUpdate = {
        updated_at: new Date().toISOString(),
      };
      for (const [key, value] of Object.entries(rest) as Array<[keyof typeof rest, (typeof rest)[keyof typeof rest]]>) {
        if (value !== undefined) Object.assign(updateValues, { [key]: value });
      }
      if (dbPassword && dbPassword.length > 0) {
        Object.assign(updateValues, { db_password: body.db_password });
      }
      const result = await db
        .updateTable('infra_databases')
        .set(updateValues)
        .where('id', '=', req.params['id'] as string)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!result) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: (req as unknown as AuthenticatedRequest).user.id,
        type: 'database_settings_changed',
        source_module_id: 'databases',
        record_id: result.id,
        body: `Updated settings for "${result.name}"`,
      });
      res.json({ data: redactInfraDatabase(result), error: null });
    } catch (err) { next(err); }
  });

  router.post('/:id/test', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = testSchema.parse(req.body);
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      const result = await testTargetDatabaseConnection(infraDb, body.db_password);
      // Persist status so list/detail pages reflect real health.
      // Also save the password if one was provided and the test succeeded — ensures
      // the background worker can use the same credentials without needing a manual save.
      const newStatus: InfraDatabase['status'] = result.ok ? 'healthy' : 'offline';
      logger.info({ ok: result.ok, newStatus, id: req.params['id'] }, 'db test result');
      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (result.ok && body.db_password) {
        updatePayload['db_password'] = body.db_password;
      }
      await db
        .updateTable('infra_databases')
        .set(updatePayload)
        .where('id', '=', req.params['id'] as string)
        .where('workspace_id', '=', workspace.id)
        .execute();
      logger.info({ newStatus }, 'db status updated');
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: (req as unknown as AuthenticatedRequest).user.id,
        type: 'database_connection_tested',
        source_module_id: 'databases',
        record_id: infraDb.id,
        body: `Connection test ${result.ok ? 'succeeded' : 'failed'} in ${result.latency_ms}ms: ${result.message}`,
        meta: { ok: result.ok, latency_ms: result.latency_ms },
      });
      res.json({ data: result, error: null });
    } catch (err) { next(err); }
  });

  router.get('/:id/schema', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      const result = infraDb.engine === 'mongo'
        ? await listMongoSchema(infraDb)
        : await listTargetDatabaseSchema(infraDb);
      res.json({ data: result, error: null });
    } catch (err) {
      if (!sendInfraError(res, err)) next(err);
    }
  });

  router.get('/:id/tables/:table/rows', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const query = rowsQuerySchema.parse(req.query);
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      const result = infraDb.engine === 'mongo'
        ? await listMongoRows(infraDb, req.params['table'] as string, query.page, query.limit)
        : await listTargetDatabaseRows(infraDb, query.schema, req.params['table'] as string, query.page, query.limit);
      res.json({ data: result, error: null });
    } catch (err) {
      if (!sendInfraError(res, err)) next(err);
    }
  });

  router.patch('/:id/tables/:table/rows', async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      const { workspace, user } = auth;
      if (user.role !== 'admin') { forbidden(res); return; }
      const body = updateRowSchema.parse(req.body);
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      const result = await updateTargetDatabaseRow(infraDb, body.schema, req.params['table'] as string, body.original, body.changes);
      res.json({ data: result, error: null });
    } catch (err) {
      if (!sendInfraError(res, err)) next(err);
    }
  });

  // MongoDB query endpoint: POST /:id/mongo-query
  // Body: { collection: string, query: string (JSON) }
  router.post('/:id/mongo-query', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = z.object({ collection: z.string().min(1), query: z.string().default('{}') }).parse(req.body);
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      if (infraDb.engine !== 'mongo') {
        res.status(400).json({ data: null, error: { code: 'WRONG_ENGINE', message: 'This endpoint is only for MongoDB databases' } });
        return;
      }
      const result = await runMongoQuery(infraDb, body.collection, body.query);
      void insertQueryHistory(db, {
        workspaceId: workspace.id,
        databaseId: infraDb.id,
        userId: (req as unknown as AuthenticatedRequest).user.id,
        engine: 'mongo',
        queryText: body.query,
        queryType: 'mongo',
        rowCount: result.kind === 'select' ? result.rows.length : null,
        durationMs: null,
      });
      res.json({ data: result, error: null });
    } catch (err) {
      if (!sendInfraError(res, err)) next(err);
    }
  });

  router.post('/:id/sql', async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      const { workspace, user } = auth;
      const body = sqlSchema.parse(req.body);
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      // MongoDB uses the dedicated /mongo-query endpoint
      if (infraDb.engine === 'mongo') {
        res.status(400).json({ data: null, error: { code: 'WRONG_ENGINE', message: 'Use /mongo-query for MongoDB databases' } });
        return;
      }
      const classification = classifySqlStatement(body.sql);
      if (classification.kind === 'blocked') {
        res.status(400).json({ data: null, error: { code: classification.code, message: classification.message } });
        return;
      }
      if (classification.kind === 'dml') {
        if (user.role !== 'admin') { forbidden(res); return; }
        if (!body.confirmed) {
          res.status(400).json({ data: null, error: { code: 'CONFIRMATION_REQUIRED', message: 'Confirm before running write SQL' } });
          return;
        }
      }
      const result = await runTargetDatabaseSql(infraDb, body.sql);
      const sqlRowCount = result.kind === 'dml' ? result.row_count : result.rows.length;
      void insertQueryHistory(db, {
        workspaceId: workspace.id,
        databaseId: infraDb.id,
        userId: user.id,
        engine: infraDb.engine,
        queryText: body.sql,
        queryType: 'sql',
        rowCount: sqlRowCount,
        durationMs: null,
      });
      res.json({ data: result, error: null });
    } catch (err) {
      if (!sendInfraError(res, err)) next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      if (!isAdmin(req as unknown as AuthenticatedRequest)) { forbidden(res); return; }
      const deleted = await db
        .deleteFrom('infra_databases')
        .where('id', '=', req.params['id'] as string)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!deleted) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: (req as unknown as AuthenticatedRequest).user.id,
        type: 'database_removed',
        source_module_id: 'databases',
        record_id: req.params['id'] as string,
        body: `Removed database "${deleted.name}"`,
      });
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  // GET /:id/thresholds
  router.get('/:id/thresholds', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      const override = await db
        .selectFrom('infra_db_thresholds')
        .where('workspace_id', '=', workspace.id)
        .where('database_id', '=', infraDb.id)
        .selectAll()
        .executeTakeFirst();
      const workspaceDefault = await db
        .selectFrom('infra_db_thresholds')
        .where('workspace_id', '=', workspace.id)
        .where('database_id', 'is', null)
        .selectAll()
        .executeTakeFirst();
      const effective = {
        connection_count_max: override?.connection_count_max ?? workspaceDefault?.connection_count_max ?? 100,
        replication_lag_s_max: override?.replication_lag_s_max ?? workspaceDefault?.replication_lag_s_max ?? 30,
        storage_gb_max: override?.storage_gb_max ?? workspaceDefault?.storage_gb_max ?? 500,
      };
      res.json({ data: { effective, override: override ?? null, workspace_default: workspaceDefault ?? null }, error: null });
    } catch (err) { next(err); }
  });

  // PUT /:id/thresholds
  router.put('/:id/thresholds', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      if (!isAdmin(req as unknown as AuthenticatedRequest)) { forbidden(res); return; }
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      const body = dbThresholdSchema.parse(req.body);
      const existing = await db
        .selectFrom('infra_db_thresholds')
        .where('workspace_id', '=', workspace.id)
        .where('database_id', '=', infraDb.id)
        .select('id')
        .executeTakeFirst();
      let result;
      if (existing) {
        result = await db
          .updateTable('infra_db_thresholds')
          .set({ ...body, updated_at: new Date().toISOString() })
          .where('id', '=', existing.id)
          .returningAll()
          .executeTakeFirstOrThrow();
      } else {
        result = await db
          .insertInto('infra_db_thresholds')
          .values({ workspace_id: workspace.id, database_id: infraDb.id, ...body })
          .returningAll()
          .executeTakeFirstOrThrow();
      }
      res.json({ data: result, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /:id/thresholds
  router.delete('/:id/thresholds', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      if (!isAdmin(req as unknown as AuthenticatedRequest)) { forbidden(res); return; }
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      await db
        .deleteFrom('infra_db_thresholds')
        .where('workspace_id', '=', workspace.id)
        .where('database_id', '=', infraDb.id)
        .execute();
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  // GET /:id/query-history
  router.get('/:id/query-history', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      const queryType = req.query['type'] as 'sql' | 'mongo' | undefined;
      const rows = await db
        .selectFrom('infra_db_query_history')
        .where('workspace_id', '=', workspace.id)
        .where('database_id', '=', infraDb.id)
        .where('user_id', '=', user.id)
        .$if(queryType === 'sql' || queryType === 'mongo', qb => qb.where('query_type', '=', queryType!))
        .select(['id', 'query_text', 'query_type', 'executed_at', 'row_count', 'duration_ms'])
        .orderBy('executed_at', 'desc')
        .limit(100)
        .execute();
      res.json({ data: rows, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /:id/query-history
  router.delete('/:id/query-history', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      await db
        .deleteFrom('infra_db_query_history')
        .where('workspace_id', '=', workspace.id)
        .where('database_id', '=', infraDb.id)
        .where('user_id', '=', user.id)
        .execute();
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  // GET /:id/connection-string
  router.get('/:id/connection-string', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      const reveal = req.query['reveal'] === 'true';
      if (reveal && user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Admin role required to reveal credentials' } });
        return;
      }
      const connectionString = buildConnectionString(infraDb, reveal);
      res.json({ data: { connection_string: connectionString, revealed: reveal }, error: null });
    } catch (err) { next(err); }
  });

  // GET /:id/alerts
  router.get('/:id/alerts', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      const resolved = req.query['resolved'];
      const alerts = await db
        .selectFrom('alerts')
        .where('workspace_id', '=', workspace.id)
        .where('resource_type', '=', 'database')
        .where('resource_id', '=', infraDb.id)
        .$if(resolved === 'true', qb => qb.where('resolved', '=', true))
        .$if(resolved === 'false', qb => qb.where('resolved', '=', false))
        .selectAll()
        .orderBy('created_at', 'desc')
        .execute();
      res.json({ data: alerts, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
