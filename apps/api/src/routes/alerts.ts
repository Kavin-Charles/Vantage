import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { queueWebhook } from '../lib/queue-webhook';

export function createAlertsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const resolvedParam = req.query['resolved'];
      const severity = req.query['severity'] as string | undefined;
      const resourceType = req.query['resource_type'] as string | undefined;
      const resourceId = req.query['resource_id'] as string | undefined;
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

      if (resourceType) {
        query = query.where('resource_type', '=', resourceType);
      }
      if (resourceId) {
        query = query.where('resource_id', '=', resourceId);
      }

      if (severity) {
        const severities = severity.split(',') as Array<'critical' | 'warning' | 'info'>;
        query = query.where('severity', 'in', severities);
      }

      const alerts = await query.execute();
      res.json({ data: alerts, total: alerts.length, error: null });
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

      queueWebhook(db, workspace.id, 'alert.resolved', {
        alert_id: alert.id,
        severity: alert.severity,
        message: alert.message,
        resource_type: alert.resource_type,
        resource_id: alert.resource_id,
        workspace_id: workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

      res.json({ data: alert, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
