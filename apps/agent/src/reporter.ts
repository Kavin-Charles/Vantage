import type { Metrics, HostMeta } from './collect';
import type { DbCheck } from './db-checks';

export interface ReporterConfig {
  apiUrl: string;
  token: string;
}

export async function report(
  config: ReporterConfig,
  metrics: Metrics,
  dbChecks: DbCheck[],
  meta: HostMeta,
  attempt = 0,
): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/api/agent/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`,
      },
      body: JSON.stringify({ ...metrics, ...meta, db_checks: dbChecks }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[vencore-agent] ping failed ${res.status}: ${text}`);
    }
  } catch (err) {
    const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
    if (attempt < 5) {
      console.error(`[vencore-agent] network error, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      return report(config, metrics, dbChecks, meta, attempt + 1);
    }
    console.error('[vencore-agent] giving up after 5 retries:', err);
  }
}
