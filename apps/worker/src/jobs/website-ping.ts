import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { apiEnvSchema } from '@vantage/config';

const env = apiEnvSchema.parse(process.env);
const API_URL = process.env['API_URL'] ?? 'http://localhost:3001';

export async function runWebsitePing(): Promise<void> {
  const websites = await db.selectFrom('websites').selectAll().execute();

  for (const site of websites) {
    try {
      const start = Date.now();
      let status: 'online' | 'degraded' | 'offline' = 'offline';
      let response_ms = 0;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(site.url, { signal: controller.signal, method: 'GET' });
        clearTimeout(timeout);
        response_ms = Date.now() - start;
        status = res.ok ? 'online' : 'degraded';
      } catch {
        response_ms = Date.now() - start;
        status = 'offline';
      }

      await fetch(`${API_URL}/api/websites/${site.id}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': env.CRON_SECRET,
        },
        body: JSON.stringify({ status, response_ms }),
      });

      logger.debug({ siteId: site.id, url: site.url, status, response_ms }, 'website ping');
    } catch (err) {
      logger.error({ err, siteId: site.id }, 'website ping error');
    }
  }
}
