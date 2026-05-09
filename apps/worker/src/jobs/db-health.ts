import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { logger } from '../lib/logger';

async function checkPostgres(
  host: string,
  port: number,
  dbUser: string,
  dbPassword: string,
  databaseName: string,
  useSsl: boolean,
): Promise<{
  ok: boolean;
  latency_ms: number;
  connection_count?: number;
  storage_gb?: number;
  replication_lag_s?: number;
}> {
  const { Client } = await import('pg');
  const start = Date.now();
  const client = new Client({
    host, port, user: dbUser, password: dbPassword, database: databaseName,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const [connRes, storageRes, lagRes] = await Promise.all([
      client.query<{ count: string }>('SELECT count(*) FROM pg_stat_activity'),
      client.query<{ size: string }>('SELECT pg_database_size(current_database()) AS size'),
      client.query<{ lag: string | null }>(`
        SELECT extract(epoch from max(write_lag)) AS lag
        FROM pg_stat_replication
      `),
    ]);
    const latency_ms = Date.now() - start;
    await client.end();
    return {
      ok: true,
      latency_ms,
      connection_count: parseInt(connRes.rows[0]?.count ?? '0', 10),
      storage_gb: parseInt(storageRes.rows[0]?.size ?? '0', 10) / 1e9,
      replication_lag_s: lagRes.rows[0]?.lag != null ? parseFloat(lagRes.rows[0].lag) : undefined,
    };
  } catch {
    try { await client.end(); } catch { /* ignore */ }
    return { ok: false, latency_ms: Date.now() - start };
  }
}

async function checkRedis(
  host: string,
  port: number,
  password?: string,
): Promise<{
  ok: boolean;
  latency_ms: number;
  memory_used_mb?: number;
  connected_clients?: number;
  uptime_seconds?: number;
}> {
  const { default: Redis } = await import('ioredis');
  const start = Date.now();
  const client = new Redis({ host, port, password, connectTimeout: 5000, lazyConnect: true });
  try {
    await client.connect();
    const info = await client.info('all');
    const latency_ms = Date.now() - start;
    const get = (key: string): string | undefined => {
      const match = info.match(new RegExp(`${key}:(\\S+)`));
      return match ? match[1] : undefined;
    };
    await client.disconnect();
    return {
      ok: true,
      latency_ms,
      memory_used_mb: get('used_memory') ? parseInt(get('used_memory')!, 10) / 1e6 : undefined,
      connected_clients: get('connected_clients') ? parseInt(get('connected_clients')!, 10) : undefined,
      uptime_seconds: get('uptime_in_seconds') ? parseInt(get('uptime_in_seconds')!, 10) : undefined,
    };
  } catch {
    try { client.disconnect(); } catch { /* ignore */ }
    return { ok: false, latency_ms: Date.now() - start };
  }
}

async function checkMysql(
  host: string,
  port: number,
  dbUser: string,
  dbPassword: string,
  databaseName: string,
): Promise<{ ok: boolean; latency_ms: number; connection_count?: number; uptime_seconds?: number }> {
  const mysql = await import('mysql2/promise');
  const start = Date.now();
  let conn: Awaited<ReturnType<typeof mysql.createConnection>> | undefined;
  try {
    conn = await mysql.createConnection({
      host, port, user: dbUser, password: dbPassword, database: databaseName, connectTimeout: 5000,
    });
    const [rows] = await conn.query<any[]>(
      'SHOW GLOBAL STATUS WHERE Variable_name IN ("Connections","Uptime")'
    );
    const latency_ms = Date.now() - start;
    const map = new Map((rows as { Variable_name: string; Value: string }[]).map(r => [r.Variable_name, r.Value]));
    await conn.end();
    return {
      ok: true,
      latency_ms,
      connection_count: map.has('Connections') ? parseInt(map.get('Connections')!, 10) : undefined,
      uptime_seconds: map.has('Uptime') ? parseInt(map.get('Uptime')!, 10) : undefined,
    };
  } catch {
    try { await conn?.end(); } catch { /* ignore */ }
    return { ok: false, latency_ms: Date.now() - start };
  }
}

async function checkMongo(
  host: string,
  port: number,
  dbUser: string,
  dbPassword: string,
  databaseName: string,
): Promise<{ ok: boolean; latency_ms: number; connection_count?: number; uptime_seconds?: number }> {
  const { MongoClient } = await import('mongodb');
  const uri = `mongodb://${dbUser}:${encodeURIComponent(dbPassword)}@${host}:${port}/${databaseName}`;
  const start = Date.now();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const status = await client.db('admin').command({ serverStatus: 1 });
    const latency_ms = Date.now() - start;
    await client.close();
    return {
      ok: true,
      latency_ms,
      connection_count: status.connections?.current as number | undefined,
      uptime_seconds: status.uptime as number | undefined,
    };
  } catch {
    try { await client.close(); } catch { /* ignore */ }
    return { ok: false, latency_ms: Date.now() - start };
  }
}

async function tcpCheck(host: string, port: number): Promise<{ ok: boolean; latency_ms: number }> {
  const net = await import('net');
  const start = Date.now();
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port, timeout: 5000 });
    socket.on('connect', () => {
      socket.destroy();
      resolve({ ok: true, latency_ms: Date.now() - start });
    });
    socket.on('error', () => resolve({ ok: false, latency_ms: Date.now() - start }));
    socket.on('timeout', () => { socket.destroy(); resolve({ ok: false, latency_ms: Date.now() - start }); });
  });
}

export async function runDbHealth(db: Kysely<Database>): Promise<void> {
  const databases = await db
    .selectFrom('infra_databases')
    .where('host', 'is not', null)
    .where('port', 'is not', null)
    .selectAll()
    .execute();

  for (const infraDb of databases) {
    if (!infraDb.host || !infraDb.port) continue;

    try {
      let result: { ok: boolean; latency_ms: number; [key: string]: unknown };

      switch (infraDb.engine) {
        case 'postgres':
          result = (infraDb.db_user && infraDb.db_password && infraDb.database_name)
            ? await checkPostgres(
                infraDb.host, infraDb.port,
                infraDb.db_user, infraDb.db_password, infraDb.database_name,
                infraDb.use_ssl,
              )
            : await tcpCheck(infraDb.host, infraDb.port);
          break;
        case 'redis':
          result = await checkRedis(infraDb.host, infraDb.port, infraDb.db_password ?? undefined);
          break;
        case 'mysql':
          result = (infraDb.db_user && infraDb.db_password && infraDb.database_name)
            ? await checkMysql(
                infraDb.host, infraDb.port,
                infraDb.db_user, infraDb.db_password, infraDb.database_name,
              )
            : await tcpCheck(infraDb.host, infraDb.port);
          break;
        case 'mongo':
          result = (infraDb.db_user && infraDb.db_password && infraDb.database_name)
            ? await checkMongo(
                infraDb.host, infraDb.port,
                infraDb.db_user, infraDb.db_password, infraDb.database_name,
              )
            : await tcpCheck(infraDb.host, infraDb.port);
          break;
        default:
          result = await tcpCheck(infraDb.host, infraDb.port);
      }

      const update: Record<string, unknown> = {
        status: result.ok ? 'healthy' : 'offline',
        last_checked_at: new Date().toISOString(),
      };
      if (result['connection_count'] !== undefined) update['connection_count'] = result['connection_count'];
      if (result['storage_gb'] !== undefined) update['storage_gb'] = result['storage_gb'];
      if (result['replication_lag_s'] !== undefined) update['replication_lag_s'] = result['replication_lag_s'];
      if (result['memory_used_mb'] !== undefined) update['memory_used_mb'] = result['memory_used_mb'];
      if (result['connected_clients'] !== undefined) update['connected_clients'] = result['connected_clients'];
      if (result['uptime_seconds'] !== undefined) update['uptime_seconds'] = result['uptime_seconds'];

      await db
        .updateTable('infra_databases')
        .set(update as never)
        .where('id', '=', infraDb.id)
        .execute();

    } catch (err) {
      logger.error({ err, dbId: infraDb.id }, 'db-health check failed');
    }
  }
}
