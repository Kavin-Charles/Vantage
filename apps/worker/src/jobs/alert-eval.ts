import { db } from '../lib/db';
import { logger } from '../lib/logger';

interface AlertInsert {
  workspace_id: string;
  resource_type: 'server' | 'database' | 'website' | 'crm';
  resource_id: string;
  severity: 'critical' | 'warning' | 'info';
  message_type: string;
  message: string;
}

// Track consecutive high readings per resource (2-ping rule)
const consecutiveCounts = new Map<string, number>();

async function hasOpenAlert(
  workspaceId: string,
  resourceType: string,
  resourceId: string,
  messageType: string,
): Promise<boolean> {
  const existing = await db
    .selectFrom('alerts')
    .where('workspace_id', '=', workspaceId)
    .where('resource_type', '=', resourceType as 'server' | 'database' | 'website' | 'crm')
    .where('resource_id', '=', resourceId)
    .where('message', '=', messageType)
    .where('resolved', '=', false)
    .selectAll()
    .executeTakeFirst();
  return !!existing;
}

async function insertAlert(
  workspaceId: string,
  severity: 'critical' | 'warning' | 'info',
  resourceType: 'server' | 'database' | 'website' | 'crm',
  resourceId: string,
  messageType: string,
  humanMessage: string,
): Promise<void> {
  const already = await hasOpenAlert(workspaceId, resourceType, resourceId, messageType);
  if (already) return;
  // Store messageType in the message column for dedup; human-readable in a comment
  // We store messageType as the dedup key in `message`, and log the human message
  await db
    .insertInto('alerts')
    .values({
      workspace_id: workspaceId,
      resource_type: resourceType,
      resource_id: resourceId,
      severity,
      message: messageType,
      acknowledged: false,
      resolved: false,
    })
    .execute();
  logger.info({ workspaceId, resourceType, resourceId, messageType, humanMessage }, 'alert created');
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

      if (snapshot.cpu_pct !== null && snapshot.cpu_pct > cpuThresh) {
        const count = (consecutiveCounts.get(`${key}_cpu`) ?? 0) + 1;
        consecutiveCounts.set(`${key}_cpu`, count);
        if (count >= 2) {
          const severity = snapshot.cpu_pct > 95 ? 'critical' : 'warning';
          const messageType = severity === 'critical' ? 'cpu_critical' : 'cpu_warning';
          await insertAlert(
            workspaceId,
            severity,
            'server',
            snapshot.server_id,
            messageType,
            `CPU usage ${snapshot.cpu_pct}% exceeds ${severity} threshold (${cpuThresh}%)`,
          );
        }
      } else {
        consecutiveCounts.delete(`${key}_cpu`);
      }

      if (snapshot.mem_pct !== null && snapshot.mem_pct > memThresh) {
        const count = (consecutiveCounts.get(`${key}_mem`) ?? 0) + 1;
        consecutiveCounts.set(`${key}_mem`, count);
        if (count >= 2) {
          await insertAlert(
            workspaceId,
            'warning',
            'server',
            snapshot.server_id,
            'mem_warning',
            `Memory usage ${snapshot.mem_pct}% exceeds warning threshold (${memThresh}%)`,
          );
        }
      } else {
        consecutiveCounts.delete(`${key}_mem`);
      }

      if (snapshot.disk_pct !== null && snapshot.disk_pct > diskThresh) {
        const count = (consecutiveCounts.get(`${key}_disk`) ?? 0) + 1;
        consecutiveCounts.set(`${key}_disk`, count);
        if (count >= 2) {
          const severity = snapshot.disk_pct > 95 ? 'critical' : 'warning';
          const messageType = severity === 'critical' ? 'disk_critical' : 'disk_warning';
          await insertAlert(
            workspaceId,
            severity,
            'server',
            snapshot.server_id,
            messageType,
            `Disk usage ${snapshot.disk_pct}% exceeds ${severity} threshold (${diskThresh}%)`,
          );
        }
      } else {
        consecutiveCounts.delete(`${key}_disk`);
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
          'site_down',
          `${site.label ?? site.url} is offline`,
        );
      } else if (site.response_ms !== null && site.response_ms > responseThresh) {
        await insertAlert(
          workspaceId,
          'warning',
          'website',
          site.id,
          'site_slow',
          `${site.label ?? site.url} response time ${site.response_ms}ms exceeds threshold`,
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
        'db_unreachable',
        `Database "${db_row.name}" (${db_row.engine}) is unreachable`,
      );
    }
  }
}
