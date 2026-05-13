"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
const kysely_1 = require("kysely");
async function up(db) {
    await db.schema
        .createTable('servers')
        .addColumn('id', 'uuid', col => col.primaryKey().defaultTo((0, kysely_1.sql) `gen_random_uuid()`))
        .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
        .addColumn('name', 'varchar(255)', col => col.notNull())
        .addColumn('region', 'varchar(100)')
        .addColumn('ip_address', 'varchar(45)')
        .addColumn('agent_token_hash', 'varchar(64)', col => col.notNull().unique())
        .addColumn('cpu_pct', 'float4')
        .addColumn('mem_pct', 'float4')
        .addColumn('disk_pct', 'float4')
        .addColumn('uptime_seconds', 'integer')
        .addColumn('load_avg_1m', 'float4')
        .addColumn('net_in_bytes', 'integer')
        .addColumn('net_out_bytes', 'integer')
        .addColumn('status', 'varchar(20)', col => col.notNull().defaultTo('offline'))
        .addColumn('last_ping_at', 'timestamptz')
        .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .execute();
    await db.schema
        .createTable('infra_databases')
        .addColumn('id', 'uuid', col => col.primaryKey().defaultTo((0, kysely_1.sql) `gen_random_uuid()`))
        .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
        .addColumn('name', 'varchar(255)', col => col.notNull())
        .addColumn('engine', 'varchar(50)', col => col.notNull())
        .addColumn('version', 'varchar(50)')
        .addColumn('host', 'varchar(255)')
        .addColumn('port', 'integer')
        .addColumn('storage_gb', 'float4')
        .addColumn('connection_count', 'integer')
        .addColumn('replication_lag_s', 'float4')
        .addColumn('status', 'varchar(20)', col => col.notNull().defaultTo('offline'))
        .addColumn('last_checked_at', 'timestamptz')
        .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .execute();
    await db.schema
        .createTable('websites')
        .addColumn('id', 'uuid', col => col.primaryKey().defaultTo((0, kysely_1.sql) `gen_random_uuid()`))
        .addColumn('workspace_id', 'uuid', col => col.notNull().references('workspaces.id').onDelete('cascade'))
        .addColumn('url', 'varchar(2048)', col => col.notNull())
        .addColumn('label', 'varchar(255)')
        .addColumn('host', 'varchar(255)')
        .addColumn('response_ms', 'integer')
        .addColumn('uptime_pct_30d', 'float4')
        .addColumn('ssl_expiry_date', 'date')
        .addColumn('status', 'varchar(20)', col => col.notNull().defaultTo('offline'))
        .addColumn('last_checked_at', 'timestamptz')
        .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .execute();
    await db.schema
        .createTable('metrics_snapshots')
        .addColumn('id', 'uuid', col => col.notNull().defaultTo((0, kysely_1.sql) `gen_random_uuid()`))
        .addColumn('server_id', 'uuid', col => col.notNull().references('servers.id').onDelete('cascade'))
        .addColumn('workspace_id', 'uuid', col => col.notNull())
        .addColumn('cpu_pct', 'float4', col => col.notNull())
        .addColumn('mem_pct', 'float4', col => col.notNull())
        .addColumn('disk_pct', 'float4', col => col.notNull())
        .addColumn('load_avg_1m', 'float4', col => col.notNull())
        .addColumn('net_in_bytes', 'integer', col => col.notNull())
        .addColumn('net_out_bytes', 'integer', col => col.notNull())
        .addColumn('recorded_at', 'timestamptz', col => col.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .addPrimaryKeyConstraint('metrics_snapshots_pkey', ['id', 'recorded_at'])
        .execute();
    // TimescaleDB hypertable
    await (0, kysely_1.sql) `SELECT create_hypertable('metrics_snapshots', 'recorded_at')`.execute(db);
    // Retention: drop chunks older than 30 days
    await (0, kysely_1.sql) `SELECT add_retention_policy('metrics_snapshots', INTERVAL '30 days')`.execute(db);
    await db.schema
        .createTable('alert_thresholds')
        .addColumn('id', 'uuid', col => col.primaryKey().defaultTo((0, kysely_1.sql) `gen_random_uuid()`))
        .addColumn('workspace_id', 'uuid', col => col.notNull().unique().references('workspaces.id').onDelete('cascade'))
        .addColumn('cpu_pct', 'float4', col => col.notNull().defaultTo(85))
        .addColumn('mem_pct', 'float4', col => col.notNull().defaultTo(90))
        .addColumn('disk_pct', 'float4', col => col.notNull().defaultTo(80))
        .addColumn('response_ms', 'integer', col => col.notNull().defaultTo(2000))
        .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .execute();
}
async function down(db) {
    await db.schema.dropTable('alert_thresholds').execute();
    await db.schema.dropTable('metrics_snapshots').execute();
    await db.schema.dropTable('websites').execute();
    await db.schema.dropTable('infra_databases').execute();
    await db.schema.dropTable('servers').execute();
}
//# sourceMappingURL=20240102_002_infra_monitoring.js.map