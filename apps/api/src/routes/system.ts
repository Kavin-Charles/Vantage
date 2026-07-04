import { Router, type RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { z } from 'zod';
import { currentVersion, isSemver, compareSemver, runUpdateCheck } from '../lib/update-check';

export interface SystemRouterEnv {
  CRON_SECRET: string;
  UPDATER_URL: string;
  UPDATER_SECRET?: string | undefined;
}

const updateBodySchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be x.y.z'),
});

export function createSystemRouter(
  db: Kysely<Database>,
  env: SystemRouterEnv,
  requireAuth: RequestHandler,
  requireAdmin: RequestHandler,
): Router {
  const router = Router();

  router.get('/version', (_req, res) => {
    res.json({ data: { version: currentVersion() }, error: null });
  });

  router.post('/internal-check', async (req, res, next) => {
    try {
      if (req.headers['x-cron-secret'] !== env.CRON_SECRET) {
        return res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' } });
      }
      const info = await runUpdateCheck(db);
      return res.json({ data: info, error: null });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/update-info', requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const running = currentVersion();
      const meta = await db.selectFrom('instance_meta').selectAll().where('id', '=', 1).executeTakeFirst();
      const latest = meta?.latest_version ?? null;
      const updateAvailable =
        latest !== null && isSemver(running) && compareSemver(latest, running) > 0;
      return res.json({
        data: {
          currentVersion: running,
          latestVersion: latest,
          updateAvailable,
          releaseUrl: meta?.release_url ?? null,
          lastCheckedAt: meta?.last_checked_at ?? null,
        },
        error: null,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/check-updates', requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const info = await runUpdateCheck(db);
      return res.json({ data: info, error: null });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/update', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      if (!env.UPDATER_SECRET) {
        return res.status(503).json({ data: null, error: { code: 'UPDATER_UNAVAILABLE', message: 'Updater is not configured on this instance' } });
      }
      const parsed = updateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'version must be x.y.z' } });
      }
      const meta = await db.selectFrom('instance_meta').select('latest_version').where('id', '=', 1).executeTakeFirst();
      if (parsed.data.version !== meta?.latest_version) {
        return res.status(400).json({ data: null, error: { code: 'VERSION_MISMATCH', message: 'Requested version is not the detected latest release' } });
      }
      const r = await fetch(`${env.UPDATER_URL}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-updater-secret': env.UPDATER_SECRET },
        body: JSON.stringify({ version: parsed.data.version }),
      });
      const json: unknown = await r.json();
      return res.status(r.status).json(json);
    } catch (err) {
      return next(err);
    }
  });

  router.get('/update-status', requireAuth, requireAdmin, async (_req, res) => {
    if (!env.UPDATER_SECRET) {
      return res.json({ data: { state: 'unavailable' }, error: null });
    }
    try {
      const r = await fetch(`${env.UPDATER_URL}/status`, {
        headers: { 'x-updater-secret': env.UPDATER_SECRET },
      });
      const json: unknown = await r.json();
      return res.status(r.status).json(json);
    } catch {
      return res.json({ data: { state: 'unreachable' }, error: null });
    }
  });

  return router;
}
