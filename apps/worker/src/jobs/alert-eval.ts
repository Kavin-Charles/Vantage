import { db } from '../lib/db';
import { logger } from '../lib/logger';

// Track consecutive high readings per resource (2-ping rule)
// Stores { count, lastRecordedAt } to require distinct snapshots
const consecutiveCounts = new Map<string, { count: number; lastRecordedAt: string }>();

function shouldFire(key: string, recordedAt: string, required: number): boolean {
  const entry = consecutiveCounts.get(key);
  if (!entry || entry.lastRecordedAt === recordedAt) {
    // Same snapshot or first time — register but don't increment
    consecutiveCounts.set(key, { count: entry ? entry.count : 1, lastRecordedAt: recordedAt });
    return entry ? entry.count >= required : false;
  }
  // New snapshot — increment
  const newCount = entry.count + 1;
  consecutiveCounts.set(key, { count: newCount, lastRecordedAt: recordedAt });
  return newCount >= required;
}

function resetCount(key: string): void {
  consecutiveCounts.delete(key);
}

async function hasOpenAlert(
  workspaceId: string,
  resourceType: string,
  resourceId: string,
  messagePrefix: string,
): Promise<boolean> {
  const existing = await db
    .selectFrom('alerts')
    .where('workspace_id', '=', workspaceId)
    .where('resource_type', '=', resourceType as 'server' | 'database' | 'website' | 'crm')
    .where('resource_id', '=', resourceId)
    .where('message', 'like', `${messagePrefix}%`)
    .where('resolved', '=', false)
    .select('id')
    .executeTakeFirst();
  return existing !== undefined;
}

async function insertAlert(
  workspaceId: string,
  severity: 'critical' | 'warning' | 'info',
  resourceType: 'server' | 'database' | 'website' | 'crm',
  resourceId: string,
  messagePrefix: string,
  message: string,
): Promise<void> {
  const already = await hasOpenAlert(workspaceId, resourceType, resourceId, messagePrefix);
  if (already) return;
  await db
    .insertInto('alerts')
    .values({
      workspace_id: workspaceId,
      resource_type: resourceType,
      resource_id: resourceId,
      severity,
      message,
      acknowledged: false,
      resolved: false,
    })
    .execute();
  logger.info({ workspaceId, resourceType, resourceId, message }, 'alert created');
}

export async function runAlertEval(): Promise<void> {
  const workspaces = await db.selectFrom('workspaces').select(['id']).execute();

  for (const { id: workspaceId } of workspaces) {
    const thresholds = await db
      .selectFrom('alert_thresholds')
      .where('workspace_id', '=', workspaceId)
      .selectAll()
      .executeTakeFirst();

    const cpuThresh = thresholds?.cpu_pct ?? 85;
    const memThresh = thresholds?.mem_pct ?? 90;
    const diskThresh = thresholds?.disk_pct ?? 80;
    const responseThresh = thresholds?.response_ms ?? 2000;

    // Server alerts — read latest metrics_snapshots row per server
    const snapshots = await db
      .selectFrom('metrics_snapshots as ms')
      .innerJoin(
        db
          .selectFrom('metrics_snapshots')
          .select(['server_id', (eb) => eb.fn.max('recorded_at').as('max_recorded_at')])
          .groupBy('server_id')
          .as('latest'),
        (join) =>
          join
            .onRef('ms.server_id', '=', 'latest.server_id')
            .onRef('ms.recorded_at', '=', 'latest.max_recorded_at'),
      )
      .innerJoin('servers', 'servers.id', 'ms.server_id')
      .where('servers.workspace_id', '=', workspaceId)
      .select([
        'ms.server_id',
        'ms.cpu_pct',
        'ms.mem_pct',
        'ms.disk_pct',
        'ms.recorded_at',
        'servers.workspace_id',
      ])
      .execute();

    for (const snapshot of snapshots) {
      const key = snapshot.server_id;
      const recordedAt = String(snapshot.recorded_at);

      if (snapshot.cpu_pct !== null && snapshot.cpu_pct > cpuThresh) {
        const cpuKey = `${key}_cpu`;
        if (shouldFire(cpuKey, recordedAt, 2)) {
          const severity = snapshot.cpu_pct > 95 ? 'critical' : 'warning';
          const prefix =
            severity === 'critical'
              ? 'CPU usage exceeds critical'
              : 'CPU usage exceeds warning';
          await insertAlert(
            workspaceId,
            severity,
            'server',
            snapshot.server_id,
            prefix,
            `${prefix} threshold (${snapshot.cpu_pct.toFixed(1)}%)`,
          );
        }
      } else {
        resetCount(`${key}_cpu`);
      }

      if (snapshot.mem_pct !== null && snapshot.mem_pct > memThresh) {
        const memKey = `${key}_mem`;
        if (shouldFire(memKey, recordedAt, 2)) {
          await insertAlert(
            workspaceId,
            'warning',
            'server',
            snapshot.server_id,
            'Memory usage exceeds warning',
            `Memory usage exceeds warning threshold (${snapshot.mem_pct.toFixed(1)}%)`,
          );
        }
      } else {
        resetCount(`${key}_mem`);
      }

      if (snapshot.disk_pct !== null && snapshot.disk_pct > diskThresh) {
        const diskKey = `${key}_disk`;
        if (shouldFire(diskKey, recordedAt, 2)) {
          const severity = snapshot.disk_pct > 95 ? 'critical' : 'warning';
          const prefix =
            severity === 'critical'
              ? 'Disk usage exceeds critical'
              : 'Disk usage exceeds warning';
          await insertAlert(
            workspaceId,
            severity,
            'server',
            snapshot.server_id,
            prefix,
            `${prefix} threshold (${snapshot.disk_pct.toFixed(1)}%)`,
          );
        }
      } else {
        resetCount(`${key}_disk`);
      }
    }

    // Website alerts
    const websites = await db
      .selectFrom('websites')
      .where('workspace_id', '=', workspaceId)
      .selectAll()
      .execute();

    for (const site of websites) {
      if (site.status === 'offline') {
        await insertAlert(
          workspaceId,
          'critical',
          'website',
          site.id,
          'Website is down',
          `Website is down (HTTP ${site.status})`,
        );
      } else if (site.response_ms !== null && site.response_ms > responseThresh) {
        await insertAlert(
          workspaceId,
          'warning',
          'website',
          site.id,
          'Website is slow',
          `Website is slow (${site.response_ms}ms)`,
        );
      }
    }

    // DB unreachable alerts
    const offlineDbs = await db
      .selectFrom('infra_databases')
      .where('workspace_id', '=', workspaceId)
      .where('status', '=', 'offline')
      .select(['id', 'name', 'engine'])
      .execute();

    for (const db_row of offlineDbs) {
      await insertAlert(
        workspaceId,
        'warning',
        'database',
        db_row.id,
        'Database',
        `Database "${db_row.name}" (${db_row.engine}) is unreachable`,
      );
    }
  }
}
