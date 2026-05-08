import { db } from '../lib/db';
import { logger } from '../lib/logger';

interface AlertInsert {
  workspace_id: string;
  resource_type: 'server' | 'database' | 'website' | 'crm';
  resource_id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

// Track consecutive high readings per resource (2-ping rule)
const consecutiveCounts = new Map<string, number>();

async function hasOpenAlert(workspaceId: string, resourceId: string, message: string): Promise<boolean> {
  const existing = await db
    .selectFrom('alerts')
    .where('workspace_id', '=', workspaceId)
    .where('resource_id', '=', resourceId)
    .where('message', '=', message)
    .where('resolved', '=', false)
    .selectAll()
    .executeTakeFirst();
  return !!existing;
}

async function createAlert(alert: AlertInsert): Promise<void> {
  const exists = await hasOpenAlert(alert.workspace_id, alert.resource_id, alert.message);
  if (exists) return;
  await db.insertInto('alerts').values({ ...alert, acknowledged: false, resolved: false }).execute();
  logger.info({ alert }, 'alert created');
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

    // Server alerts — 2-consecutive-ping rule
    const servers = await db
      .selectFrom('servers')
      .where('workspace_id', '=', workspaceId)
      .selectAll()
      .execute();

    for (const server of servers) {
      const key = server.id;

      if (server.cpu_pct !== null && server.cpu_pct > cpuThresh) {
        const count = (consecutiveCounts.get(`${key}_cpu`) ?? 0) + 1;
        consecutiveCounts.set(`${key}_cpu`, count);
        if (count >= 2) {
          const severity = server.cpu_pct > 95 ? 'critical' : 'warning';
          await createAlert({ workspace_id: workspaceId, resource_type: 'server', resource_id: server.id, severity, message: `CPU usage ${server.cpu_pct}% exceeds threshold` });
        }
      } else {
        consecutiveCounts.delete(`${key}_cpu`);
      }

      if (server.mem_pct !== null && server.mem_pct > memThresh) {
        const count = (consecutiveCounts.get(`${key}_mem`) ?? 0) + 1;
        consecutiveCounts.set(`${key}_mem`, count);
        if (count >= 2) {
          await createAlert({ workspace_id: workspaceId, resource_type: 'server', resource_id: server.id, severity: 'warning', message: `Memory usage ${server.mem_pct}% exceeds threshold` });
        }
      } else {
        consecutiveCounts.delete(`${key}_mem`);
      }

      if (server.disk_pct !== null && server.disk_pct > diskThresh) {
        const severity = server.disk_pct > 95 ? 'critical' : 'warning';
        await createAlert({ workspace_id: workspaceId, resource_type: 'server', resource_id: server.id, severity, message: `Disk usage ${server.disk_pct}% exceeds threshold` });
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
        await createAlert({ workspace_id: workspaceId, resource_type: 'website', resource_id: site.id, severity: 'critical', message: `${site.label ?? site.url} is offline` });
      } else if (site.response_ms !== null && site.response_ms > responseThresh) {
        await createAlert({ workspace_id: workspaceId, resource_type: 'website', resource_id: site.id, severity: 'warning', message: `${site.label ?? site.url} response time ${site.response_ms}ms exceeds threshold` });
      }
    }
  }
}
