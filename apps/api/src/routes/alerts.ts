import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

export function createAlertsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const resolvedParam = req.query['resolved'];
      const severity = req.query['severity'] as string | undefined;
      const limit = Math.min(Number(req.query['limit'] ?? 25), 100);

      let query = db
        .selectFrom('alerts')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(limit);

      if (resolvedParam !== undefined) {
        query = query.where('resolved', '=', resolvedParam === 'true');
      }

      if (severity) {
        const severities = severity.split(',') as Array<'critical' | 'warning' | 'info'>;
        query = query.where('severity', 'in', severities);
      }

      const alerts = await query.execute();
      res.json({ data: alerts, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/acknowledge', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const alert = await db
        .updateTable('alerts')
        .set({ acknowledged: true, acknowledged_by: user.id })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      if (!alert) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Alert not found' } });
        return;
      }
      res.json({ data: alert, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/resolve', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const alert = await db
        .updateTable('alerts')
        .set({ resolved: true, resolved_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      if (!alert) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Alert not found' } });
        return;
      }
      res.json({ data: alert, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
