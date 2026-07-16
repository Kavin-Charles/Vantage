/**
 * Pure rollup mappers for the analytics hub endpoints. DB rows in, response
 * shapes out — keeps the SQL glue in routes/analytics.ts thin and testable.
 */

export interface InfraSummary {
  servers: { online: number; degraded: number; offline: number; stopped: number; avg_cpu: number; avg_mem: number; avg_disk: number };
  websites: { total: number; avg_uptime: number; ssl_expiring_soon: number };
  alerts: { critical: number; warning: number; info: number };
}

interface ServerRow { status: string; cpu_pct: number | null; mem_pct: number | null; disk_pct: number | null }
interface WebsiteRow { uptime_pct_30d: number | null; ssl_expiry_date: Date | string | null }
interface AlertCountRow { severity: string; count: number | string }

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function summarizeInfra(
  servers: ServerRow[],
  websites: WebsiteRow[],
  alerts: AlertCountRow[],
  now: Date = new Date(),
): InfraSummary {
  const byStatus = (s: string) => servers.filter(r => r.status === s).length;
  const online = servers.filter(r => r.status === 'online');
  const metric = (key: 'cpu_pct' | 'mem_pct' | 'disk_pct') =>
    avg(online.map(r => r[key]).filter((v): v is number => v !== null));

  const sslCutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sslExpiringSoon = websites.filter(w => {
    if (!w.ssl_expiry_date) return false;
    return new Date(w.ssl_expiry_date) <= sslCutoff;
  }).length;

  const alertCount = (sev: string) =>
    Number(alerts.find(a => a.severity === sev)?.count ?? 0);

  return {
    servers: {
      online: byStatus('online'),
      degraded: byStatus('degraded'),
      offline: byStatus('offline'),
      stopped: byStatus('stopped'),
      avg_cpu: metric('cpu_pct'),
      avg_mem: metric('mem_pct'),
      avg_disk: metric('disk_pct'),
    },
    websites: {
      total: websites.length,
      avg_uptime: avg(websites.map(w => w.uptime_pct_30d).filter((v): v is number => v !== null)),
      ssl_expiring_soon: sslExpiringSoon,
    },
    alerts: {
      critical: alertCount('critical'),
      warning: alertCount('warning'),
      info: alertCount('info'),
    },
  };
}

export interface PmSummary {
  projects: { active: number };
  tasks: { total: number; done: number; overdue: number; open: number; completion_rate: number };
  velocity: Array<{ sprint_name: string; velocity: number | null; end_date: string | null }>;
  workload: Array<{ user_id: string; name: string; total: number; done: number; overdue: number }>;
}

interface TaskStatsRow { total: number | string; done: number | string; overdue: number | string; open: number | string }
interface VelocityRow { name: string; velocity: number | null; end_date: Date | string | null }
interface WorkloadRow { user_id: string; name: string; total: number | string; done: number | string; overdue: number | string }

export function summarizePm(
  activeProjectCount: number | string,
  taskStats: TaskStatsRow | undefined,
  velocityRows: VelocityRow[],
  workloadRows: WorkloadRow[],
): PmSummary {
  const total = Number(taskStats?.total ?? 0);
  const done = Number(taskStats?.done ?? 0);
  return {
    projects: { active: Number(activeProjectCount) },
    tasks: {
      total,
      done,
      overdue: Number(taskStats?.overdue ?? 0),
      open: Number(taskStats?.open ?? 0),
      completion_rate: total > 0 ? Math.round((done / total) * 100) : 0,
    },
    velocity: velocityRows.map(r => ({
      sprint_name: r.name,
      velocity: r.velocity === null ? null : Number(r.velocity),
      end_date: r.end_date ? new Date(r.end_date).toISOString() : null,
    })),
    workload: workloadRows.map(r => ({
      user_id: r.user_id,
      name: r.name,
      total: Number(r.total),
      done: Number(r.done),
      overdue: Number(r.overdue),
    })),
  };
}
