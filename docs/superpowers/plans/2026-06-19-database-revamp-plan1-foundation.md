# Database Module Revamp — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all new DB tables, extend types, wire new API endpoints, add logActivity calls to existing CRUD handlers, and extend the worker alert evaluator to fire alerts for database metrics.

**Architecture:** New `infra_db_thresholds` and `infra_db_query_history` tables. New routes appended to the existing `createInfraDatabasesRouter`. Worker `runAlertEval` extended with a database section mirroring the existing server section. Activity logging calls inserted into existing create/update/delete/test handlers.

**Tech Stack:** Kysely, Zod, Express, TypeScript strict. Migrations live in `packages/db/migrations/`. Schema interfaces in `packages/db/src/schema.ts`. API routes in `apps/api/src/routes/infra-databases.ts`. Worker in `apps/worker/src/jobs/alert-eval.ts`.

---

### Task 1: Create Feature Branch

**Files:** none (git only)

- [ ] **Step 1: Checkout branch**

```bash
git checkout -b feat/database-module-revamp
```

- [ ] **Step 2: Verify**

```bash
git branch --show-current
```
Expected output: `feat/database-module-revamp`

---

### Task 2: Write Migration

**Files:**
- Create: `packages/db/migrations/20260619_002_database_module_foundation.ts`

- [ ] **Step 1: Create the migration file**

```typescript
import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Per-database alert threshold overrides.
  // NULL database_id = workspace-level default; set = per-DB override.
  await db.schema
    .createTable('infra_db_thresholds')
    .ifNotExists()
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('database_id', 'uuid', c => c.references('infra_databases.id').onDelete('cascade'))
    .addColumn('connection_count_max', 'integer')
    .addColumn('replication_lag_s_max', 'float4')
    .addColumn('storage_gb_max', 'float4')
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    CREATE UNIQUE INDEX infra_db_thresholds_workspace_default_idx
    ON infra_db_thresholds (workspace_id)
    WHERE database_id IS NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX infra_db_thresholds_database_idx
    ON infra_db_thresholds (database_id)
    WHERE database_id IS NOT NULL
  `.execute(db);

  // Persisted SQL/Mongo query history. Rolling 100 per (database_id, user_id).
  await db.schema
    .createTable('infra_db_query_history')
    .ifNotExists()
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('database_id', 'uuid', c => c.notNull().references('infra_databases.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('engine', 'varchar(20)', c => c.notNull())
    .addColumn('query_text', 'text', c => c.notNull())
    .addColumn('query_type', 'varchar(10)', c => c.notNull().check(sql`query_type IN ('sql', 'mongo')`))
    .addColumn('executed_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('row_count', 'integer')
    .addColumn('duration_ms', 'integer')
    .execute();

  await sql`
    CREATE INDEX infra_db_query_history_lookup_idx
    ON infra_db_query_history (database_id, user_id, executed_at DESC)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('infra_db_query_history_lookup_idx').execute();
  await db.schema.dropTable('infra_db_query_history').ifExists().execute();
  await db.schema.dropIndex('infra_db_thresholds_database_idx').execute();
  await db.schema.dropIndex('infra_db_thresholds_workspace_default_idx').execute();
  await db.schema.dropTable('infra_db_thresholds').ifExists().execute();
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/migrations/20260619_002_database_module_foundation.ts
git commit -m "feat(db): add infra_db_thresholds and infra_db_query_history tables"
```

---

### Task 3: Update Schema Types

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Add missing `ModuleEventSettingsTable` and `NotificationPreferencesTable` interfaces**

These were referenced in the `Database` interface but never defined (bug in the activity-alerts PR). Add them before the `Database` interface (around line 1055):

```typescript
export interface ModuleEventSettingsTable {
  workspace_id: string;
  module_id: string;
  activity_on: Generated<boolean>;
  alerts_on: Generated<boolean>;
  updated_at: Generated<Date>;
}

export interface NotificationPreferencesTable {
  workspace_id: string;
  channel: string;
  severity: string;
  enabled: Generated<boolean>;
  updated_at: Generated<Date>;
}
```

- [ ] **Step 2: Add new table interfaces** (also before the `Database` interface)

```typescript
export interface InfraDbThresholdTable {
  id: Generated<string>;
  workspace_id: string;
  database_id: string | null;
  connection_count_max: number | null;
  replication_lag_s_max: number | null;
  storage_gb_max: number | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface InfraDbQueryHistoryTable {
  id: Generated<string>;
  workspace_id: string;
  database_id: string;
  user_id: string;
  engine: string;
  query_text: string;
  query_type: 'sql' | 'mongo';
  executed_at: Generated<string>;
  row_count: number | null;
  duration_ms: number | null;
}
```

- [ ] **Step 3: Add new tables to the `Database` interface** (around line 1068 after `infra_databases`)

```typescript
infra_db_thresholds: InfraDbThresholdTable;
infra_db_query_history: InfraDbQueryHistoryTable;
```

- [ ] **Step 4: Add convenience types** (at the bottom of schema.ts)

```typescript
export type InfraDbThreshold = Selectable<InfraDbThresholdTable>;
export type NewInfraDbThreshold = Insertable<InfraDbThresholdTable>;
export type InfraDbThresholdUpdate = Updateable<InfraDbThresholdTable>;

export type InfraDbQueryHistory = Selectable<InfraDbQueryHistoryTable>;
export type NewInfraDbQueryHistory = Insertable<InfraDbQueryHistoryTable>;
```

- [ ] **Step 5: Extend `ActivityTable.type` union** (line 94)

Change:
```typescript
type: 'email' | 'call' | 'note' | 'meeting' | 'deal_change' | 'infra_alert' | 'contact_created' | 'task_done';
```
To:
```typescript
type: 'email' | 'call' | 'note' | 'meeting' | 'deal_change' | 'infra_alert' | 'contact_created' | 'task_done' | 'database_added' | 'database_removed' | 'database_settings_changed' | 'database_connection_tested';
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd packages/db && pnpm tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat(db): add InfraDbThreshold/QueryHistory schema types, fix missing ModuleEventSettings interfaces"
```

---

### Task 4: Extend ActivityType in API and Worker

**Files:**
- Modify: `apps/api/src/lib/log-activity.ts`
- Modify: `apps/worker/src/lib/log-activity.ts`

- [ ] **Step 1: Update `apps/api/src/lib/log-activity.ts` ActivityType**

Change the `ActivityType` export (lines 5–14):
```typescript
export type ActivityType =
  | 'email'
  | 'call'
  | 'note'
  | 'meeting'
  | 'deal_change'
  | 'infra_alert'
  | 'contact_created'
  | 'task_done'
  | 'database_added'
  | 'database_removed'
  | 'database_settings_changed'
  | 'database_connection_tested';
```

- [ ] **Step 2: Update `apps/worker/src/lib/log-activity.ts` ActivityType**

Same change — find the `ActivityType` type export in that file and apply the identical union extension.

- [ ] **Step 3: Verify**

```bash
cd apps/api && pnpm tsc --noEmit
cd apps/worker && pnpm tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/log-activity.ts apps/worker/src/lib/log-activity.ts
git commit -m "feat(activity): add database_added/removed/settings_changed/connection_tested activity types"
```

---

### Task 5: Update DATABASES_MODULE Definition

**Files:**
- Modify: `packages/modules/src/databases/index.ts`

- [ ] **Step 1: Add flags**

```typescript
import type { ModuleDefinition } from '../types';

export const DATABASES_MODULE: ModuleDefinition = {
  id: 'databases',
  name: 'Databases',
  description: 'Database health monitoring and connection management.',
  icon: 'Database',
  defaultEnabled: true,
  emitsActivity: true,
  emitsAlerts: true,
  permissions: [
    { key: 'databases:view',   label: 'View databases',   defaultRoles: ['admin', 'member'] },
    { key: 'databases:create', label: 'Add databases',    defaultRoles: ['admin', 'member'] },
    { key: 'databases:edit',   label: 'Edit databases',   defaultRoles: ['admin', 'member'] },
    { key: 'databases:delete', label: 'Delete databases', defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Databases', path: '/databases', icon: 'Database' }],
  apiPrefixes: ['/databases'],
  workers: [],
};
```

- [ ] **Step 2: Rebuild modules package**

```bash
cd packages/modules && pnpm build
```
Expected: dist files updated, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/modules/src/databases/index.ts
git commit -m "feat(modules): set emitsActivity and emitsAlerts on DATABASES_MODULE"
```

---

### Task 6: Add DB Thresholds API Routes

**Files:**
- Modify: `apps/api/src/routes/infra-databases.ts`

Add the following routes inside `createInfraDatabasesRouter`, after the existing `/:id/mongo-query` route, before the closing `return router`.

- [ ] **Step 1: Add threshold helper function**

Add this helper near the top of the file alongside `getWorkspaceDatabase`:

```typescript
async function getEffectiveDbThresholds(
  db: Kysely<Database>,
  workspaceId: string,
  databaseId: string,
): Promise<{ connection_count_max: number; replication_lag_s_max: number; storage_gb_max: number }> {
  const override = await db
    .selectFrom('infra_db_thresholds')
    .where('workspace_id', '=', workspaceId)
    .where('database_id', '=', databaseId)
    .selectAll()
    .executeTakeFirst();

  const defaultRow = await db
    .selectFrom('infra_db_thresholds')
    .where('workspace_id', '=', workspaceId)
    .where('database_id', 'is', null)
    .selectAll()
    .executeTakeFirst();

  return {
    connection_count_max:
      override?.connection_count_max ?? defaultRow?.connection_count_max ?? 100,
    replication_lag_s_max:
      override?.replication_lag_s_max ?? defaultRow?.replication_lag_s_max ?? 30,
    storage_gb_max:
      override?.storage_gb_max ?? defaultRow?.storage_gb_max ?? 500,
  };
}
```

- [ ] **Step 2: Add Zod schemas for thresholds** (at the top with other schemas)

```typescript
const dbThresholdSchema = z.object({
  connection_count_max: z.number().int().positive().optional(),
  replication_lag_s_max: z.number().positive().optional(),
  storage_gb_max: z.number().positive().optional(),
});
```

- [ ] **Step 3: Add threshold routes**

```typescript
// GET /api/databases/:id/thresholds
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
      connection_count_max:
        override?.connection_count_max ?? workspaceDefault?.connection_count_max ?? 100,
      replication_lag_s_max:
        override?.replication_lag_s_max ?? workspaceDefault?.replication_lag_s_max ?? 30,
      storage_gb_max:
        override?.storage_gb_max ?? workspaceDefault?.storage_gb_max ?? 500,
    };

    res.json({ data: { effective, override: override ?? null, workspace_default: workspaceDefault ?? null }, error: null });
  } catch (err) { next(err); }
});

// PUT /api/databases/:id/thresholds
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

// DELETE /api/databases/:id/thresholds
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

// GET /api/databases/thresholds/defaults
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

// PUT /api/databases/thresholds/defaults
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
```

> **Note:** The `/thresholds/defaults` static routes MUST be registered BEFORE `/:id` routes in the router to avoid Express matching "defaults" as an `:id` param. Place them at the top of the new routes section.

- [ ] **Step 4: Verify TypeScript**

```bash
cd apps/api && pnpm tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/infra-databases.ts
git commit -m "feat(api): add database threshold CRUD routes with workspace defaults and per-DB overrides"
```

---

### Task 7: Add Query History Routes

**Files:**
- Modify: `apps/api/src/routes/infra-databases.ts`

- [ ] **Step 1: Add helper to insert history entry** (add near top of file with other helpers)

```typescript
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

  // Enforce rolling 100-entry cap per (database_id, user_id)
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
```

- [ ] **Step 2: Add GET and DELETE history routes**

```typescript
// GET /api/databases/:id/query-history
router.get('/:id/query-history', async (req, res, next) => {
  try {
    const { workspace, user } = req as unknown as AuthenticatedRequest;
    const infraDb = await getWorkspaceDatabase(db, workspace.id, req.params['id'] as string);
    if (!infraDb) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Database not found' } }); return; }

    const rows = await db
      .selectFrom('infra_db_query_history')
      .where('workspace_id', '=', workspace.id)
      .where('database_id', '=', infraDb.id)
      .where('user_id', '=', user.id)
      .select(['id', 'query_text', 'query_type', 'executed_at', 'row_count', 'duration_ms'])
      .orderBy('executed_at', 'desc')
      .limit(100)
      .execute();

    res.json({ data: rows, error: null });
  } catch (err) { next(err); }
});

// DELETE /api/databases/:id/query-history
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
```

- [ ] **Step 3: Wire history insert into existing `/sql` route**

Find the existing `router.post('/:id/sql', ...)` handler. After the successful `runTargetDatabaseSql` call (where `setResult` would be called on the frontend), add:

```typescript
const rowCount = result.kind === 'dml' ? result.row_count : result.rows.length;
void insertQueryHistory(db, {
  workspaceId: workspace.id,
  databaseId: infraDb.id,
  userId: (req as unknown as AuthenticatedRequest).user.id,
  engine: infraDb.engine,
  queryText: body.sql,
  queryType: 'sql',
  rowCount,
  durationMs: null,
});
```

- [ ] **Step 4: Wire history insert into existing `/mongo-query` route**

Find the existing `router.post('/:id/mongo-query', ...)` handler. After the successful `runMongoQuery` call, add:

```typescript
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
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd apps/api && pnpm tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/infra-databases.ts
git commit -m "feat(api): add query history routes and auto-insert on SQL/Mongo execution"
```

---

### Task 8: Add Connection String Route

**Files:**
- Modify: `apps/api/src/routes/infra-databases.ts`

- [ ] **Step 1: Add connection string builder helper**

```typescript
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
      const db = infraDb.database_name ?? '';
      const ssl = infraDb.use_ssl ? '?sslmode=require' : '';
      return `postgresql://${user}${host}${portPart}/${db}${ssl}`;
    }
    case 'mysql': {
      const portPart = port ? `:${port}` : ':3306';
      const user = infraDb.db_user ? `${infraDb.db_user}:${password}@` : '';
      const db = infraDb.database_name ?? '';
      return `mysql://${user}${host}${portPart}/${db}`;
    }
    case 'redis': {
      const portPart = port ? `:${port}` : ':6379';
      const auth = password ? `:${password}@` : '';
      return `redis://${auth}${host}${portPart}`;
    }
    case 'mongo': {
      const portPart = port ? `:${port}` : ':27017';
      const user = infraDb.db_user ? `${infraDb.db_user}:${password}@` : '';
      const db = infraDb.database_name ?? '';
      return `mongodb://${user}${host}${portPart}/${db}`;
    }
    case 'clickhouse': {
      const portPart = port ? `:${port}` : ':8123';
      const user = infraDb.db_user ? `${infraDb.db_user}:${password}@` : '';
      const db = infraDb.database_name ?? 'default';
      return `clickhouse://${user}${host}${portPart}/${db}`;
    }
    default: {
      const portPart = port ? `:${port}` : '';
      const user = infraDb.db_user ? `${infraDb.db_user}:${password}@` : '';
      return `${infraDb.engine}://${user}${host}${portPart}`;
    }
  }
}
```

- [ ] **Step 2: Add connection string route**

```typescript
// GET /api/databases/:id/connection-string
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
```

- [ ] **Step 3: Add stateless test-connection route**

```typescript
// POST /api/databases/test-connection (stateless — no DB record required)
router.post('/test-connection', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    // Build a fake InfraDatabase-shaped object for the connection tester
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
```

> **Note:** `/test-connection` must be registered BEFORE `/:id` routes.

- [ ] **Step 4: Add alerts read route**

```typescript
// GET /api/databases/:id/alerts
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
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd apps/api && pnpm tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/infra-databases.ts
git commit -m "feat(api): add connection string, stateless test-connection, and database alerts routes"
```

---

### Task 9: Wire logActivity in Existing CRUD Handlers

**Files:**
- Modify: `apps/api/src/routes/infra-databases.ts`

- [ ] **Step 1: Import logActivity at the top of infra-databases.ts**

```typescript
import { logActivity } from '../lib/log-activity';
```

- [ ] **Step 2: Wire `database_added` in the POST `/` handler**

In `router.post('/')`, after the `res.status(201).json(...)` line, add (before it, so it fires even if json fails):

```typescript
void logActivity(db, {
  workspace_id: workspace.id,
  user_id: (req as unknown as AuthenticatedRequest).user.id,
  type: 'database_added',
  source_module_id: 'databases',
  record_id: result.id,
  body: `Added database "${result.name}"`,
  meta: { engine: result.engine, host: result.host },
});
```

- [ ] **Step 3: Wire `database_settings_changed` in the PATCH `/:id` handler**

In `router.patch('/:id')`, after the successful update and before `res.json(...)`:

```typescript
void logActivity(db, {
  workspace_id: workspace.id,
  user_id: (req as unknown as AuthenticatedRequest).user.id,
  type: 'database_settings_changed',
  source_module_id: 'databases',
  record_id: result.id,
  body: `Updated settings for "${result.name}"`,
});
```

- [ ] **Step 4: Wire `database_removed` in the DELETE `/:id` handler**

Find the existing `router.delete('/:id', ...)` handler (or add one if it doesn't exist). Before returning the success response:

```typescript
void logActivity(db, {
  workspace_id: workspace.id,
  user_id: (req as unknown as AuthenticatedRequest).user.id,
  type: 'database_removed',
  source_module_id: 'databases',
  record_id: req.params['id'],
  body: `Removed database`,
});
```

- [ ] **Step 5: Wire `database_connection_tested` in the POST `/:id/test` handler**

In the existing `router.post('/:id/test', ...)`, after the `res.json(...)`:

```typescript
void logActivity(db, {
  workspace_id: workspace.id,
  user_id: (req as unknown as AuthenticatedRequest).user.id,
  type: 'database_connection_tested',
  source_module_id: 'databases',
  record_id: infraDb.id,
  body: `Connection test ${result.ok ? 'succeeded' : 'failed'} in ${result.latency_ms}ms: ${result.message}`,
  meta: { ok: result.ok, latency_ms: result.latency_ms },
});
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd apps/api && pnpm tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/infra-databases.ts
git commit -m "feat(api): log activity on database create/update/delete/test"
```

---

### Task 10: Extend Worker Alert Evaluator for Databases

**Files:**
- Modify: `apps/worker/src/jobs/alert-eval.ts`

- [ ] **Step 1: Add database evaluation block**

In `runAlertEval`, after the existing website alerts section (after the `for (const site of websites)` loop), add:

```typescript
// Database alerts — check live metrics against per-DB / workspace thresholds
const databases = await db
  .selectFrom('infra_databases')
  .where('workspace_id', '=', workspaceId)
  .where('status', '!=', 'offline')
  .selectAll()
  .execute();

for (const database of databases) {
  const dbThresholdOverride = await db
    .selectFrom('infra_db_thresholds')
    .where('workspace_id', '=', workspaceId)
    .where('database_id', '=', database.id)
    .selectAll()
    .executeTakeFirst();

  const dbThresholdDefault = await db
    .selectFrom('infra_db_thresholds')
    .where('workspace_id', '=', workspaceId)
    .where('database_id', 'is', null)
    .selectAll()
    .executeTakeFirst();

  const connMax =
    dbThresholdOverride?.connection_count_max ??
    dbThresholdDefault?.connection_count_max ??
    100;
  const lagMax =
    dbThresholdOverride?.replication_lag_s_max ??
    dbThresholdDefault?.replication_lag_s_max ??
    30;
  const storageMax =
    dbThresholdOverride?.storage_gb_max ??
    dbThresholdDefault?.storage_gb_max ??
    500;

  // Replication lag — critical
  if (database.replication_lag_s !== null && database.replication_lag_s >= lagMax) {
    const message = `Replication lag critical (${database.replication_lag_s.toFixed(1)}s, threshold ${lagMax}s)`;
    await createAlert(db, {
      workspaceId,
      severity: 'critical',
      resourceType: 'database',
      resourceId: database.id,
      message,
      messagePrefix: 'Replication lag critical',
      sourceModuleId: 'databases',
    });
    void logActivity(db, {
      workspace_id: workspaceId,
      user_id: null,
      type: 'infra_alert',
      source_module_id: 'databases',
      body: message,
      record_id: database.id,
      meta: { resourceType: 'database', resourceId: database.id, severity: 'critical' },
    });
  }

  // Connection count — warning
  if (database.connection_count !== null && database.connection_count >= connMax) {
    const severity = database.connection_count >= connMax * 1.2 ? 'critical' : 'warning';
    const prefix = `Connection count exceeds ${severity}`;
    const message = `${prefix} threshold (${database.connection_count}, max ${connMax})`;
    await createAlert(db, {
      workspaceId,
      severity,
      resourceType: 'database',
      resourceId: database.id,
      message,
      messagePrefix: prefix,
      sourceModuleId: 'databases',
    });
    void logActivity(db, {
      workspace_id: workspaceId,
      user_id: null,
      type: 'infra_alert',
      source_module_id: 'databases',
      body: message,
      record_id: database.id,
      meta: { resourceType: 'database', resourceId: database.id, severity },
    });
  }

  // Storage — warning at 90%, critical at 100%
  if (database.storage_gb !== null && database.storage_gb >= storageMax * 0.9) {
    const severity = database.storage_gb >= storageMax ? 'critical' : 'warning';
    const prefix = severity === 'critical' ? 'Storage full critical' : 'Storage usage warning';
    const message = `${prefix} (${database.storage_gb.toFixed(1)} GB, max ${storageMax} GB)`;
    await createAlert(db, {
      workspaceId,
      severity,
      resourceType: 'database',
      resourceId: database.id,
      message,
      messagePrefix: prefix,
      sourceModuleId: 'databases',
    });
    void logActivity(db, {
      workspace_id: workspaceId,
      user_id: null,
      type: 'infra_alert',
      source_module_id: 'databases',
      body: message,
      record_id: database.id,
      meta: { resourceType: 'database', resourceId: database.id, severity },
    });
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/worker && pnpm tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/jobs/alert-eval.ts
git commit -m "feat(worker): evaluate database thresholds and fire alerts in alert-eval job"
```

---

### Task 11: Run Migration

- [ ] **Step 1: Apply the migration against your local DB**

```bash
cd apps/api && pnpm migrate
```
Expected: `20260619_002_database_module_foundation` migration applied.

- [ ] **Step 2: Verify tables exist**

```bash
psql $DATABASE_URL -c "\dt infra_db*"
```
Expected: `infra_db_thresholds` and `infra_db_query_history` listed.

- [ ] **Step 3: Run a quick smoke test of the API**

Start the API server:
```bash
cd apps/api && pnpm dev
```

In a separate terminal, test one new route (replace TOKEN and DB_ID with real values):
```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/databases/DB_ID/thresholds
```
Expected: `{ "data": { "effective": { "connection_count_max": 100, "replication_lag_s_max": 30, "storage_gb_max": 500 }, "override": null, "workspace_default": null }, "error": null }`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify plan 1 foundation complete"
```
