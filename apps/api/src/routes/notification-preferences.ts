import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const CHANNELS = ['email', 'push'] as const;
const SEVERITIES = ['critical', 'warning', 'info'] as const;

type Channel = (typeof CHANNELS)[number];
type Severity = (typeof SEVERITIES)[number];

interface PrefItem {
  channel: Channel;
  severity: Severity;
  enabled: boolean;
}

const patchSchema = z.array(
  z.object({
    channel: z.enum(CHANNELS),
    severity: z.enum(SEVERITIES),
    enabled: z.boolean(),
  }),
);

export function createNotificationPreferencesRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const rows = await db
        .selectFrom('notification_preferences')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .execute();

      const map = new Map(rows.map(r => [`${r.channel}:${r.severity}`, r.enabled]));

      const data: PrefItem[] = CHANNELS.flatMap(channel =>
        SEVERITIES.map(severity => ({
          channel,
          severity,
          enabled: map.get(`${channel}:${severity}`) ?? true,
        })),
      );

      res.json({ data, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/', async (req, res, next) => {
    try {
      const { workspace, isAdmin, permissions } = req as unknown as AuthenticatedRequest;

      if (!isAdmin && !permissions.has('workspace:manage')) {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Admin only' } });
        return;
      }

      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_BODY', message: parsed.error.message } });
        return;
      }

      await db.transaction().execute(async trx => {
        for (const item of parsed.data) {
          await trx
            .insertInto('notification_preferences')
            .values({
              workspace_id: workspace.id,
              channel: item.channel,
              severity: item.severity,
              enabled: item.enabled,
            })
            .onConflict(oc =>
              oc.columns(['workspace_id', 'channel', 'severity']).doUpdateSet({
                enabled: item.enabled,
                updated_at: new Date(),
              }),
            )
            .execute();
        }
      });

      res.json({ data: parsed.data, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
