import { Router, type Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database, InfraDatabase, InfraDatabaseUpdate } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  classifySqlStatement,
  listTargetDatabaseRows,
  listTargetDatabaseSchema,
  redactInfraDatabase,
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
      res.json({ data: result, error: null });
    } catch (err) { next(err); }
  });

  router.get('/:id/schema', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      const result = await listTargetDatabaseSchema(infraDb);
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
      const result = await listTargetDatabaseRows(infraDb, query.schema, req.params['table'] as string, query.page, query.limit);
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

  router.post('/:id/sql', async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      const { workspace, user } = auth;
      const body = sqlSchema.parse(req.body);
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
      const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
      if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      const result = await runTargetDatabaseSql(infraDb, body.sql);
      res.json({ data: result, error: null });
    } catch (err) {
      if (!sendInfraError(res, err)) next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const deleted = await db
        .deleteFrom('infra_databases')
        .where('id', '=', req.params['id'] as string)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!deleted) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
