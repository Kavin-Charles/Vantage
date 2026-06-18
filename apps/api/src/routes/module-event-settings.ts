import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { MODULE_REGISTRY } from '@vencore/modules';

const patchSchema = z.object({
  activity_on: z.boolean().optional(),
  alerts_on: z.boolean().optional(),
});

export function createModuleEventSettingsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const rows = await db
        .selectFrom('module_event_settings')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .execute();

      const settingsMap = new Map(rows.map(r => [r.module_id, r]));

      const emitters = MODULE_REGISTRY
        .filter(m => m.emitsActivity || m.emitsAlerts)
        .map(m => ({
          module_id: m.id,
          name: m.name,
          emits_activity: m.emitsActivity ?? false,
          emits_alerts: m.emitsAlerts ?? false,
          activity_on: settingsMap.get(m.id)?.activity_on ?? true,
          alerts_on: settingsMap.get(m.id)?.alerts_on ?? true,
        }));

      res.json({ data: emitters, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:moduleId', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;

      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Admin only' } });
        return;
      }

      const { moduleId } = req.params;
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_BODY', message: parsed.error.message } });
        return;
      }

      const { activity_on, alerts_on } = parsed.data;

      await db
        .insertInto('module_event_settings')
        .values({
          workspace_id: workspace.id,
          module_id: moduleId!,
          activity_on: activity_on ?? true,
          alerts_on: alerts_on ?? true,
        })
        .onConflict(oc =>
          oc.columns(['workspace_id', 'module_id']).doUpdateSet({
            ...(activity_on !== undefined && { activity_on }),
            ...(alerts_on !== undefined && { alerts_on }),
            updated_at: new Date(),
          }),
        )
        .execute();

      res.json({ data: { module_id: moduleId, ...parsed.data }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
