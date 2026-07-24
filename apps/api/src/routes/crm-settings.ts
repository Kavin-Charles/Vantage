import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

// Workspace-scoped CRM preferences, backed by the generic cross_module_settings
// table (setting_key = 'crm.preferences', arbitrary JSON in `config`). There is
// no dedicated schema for this — the shape doesn't fit the boolean toggles the
// table was originally built for, so `enabled` is always stored as `true` and
// the real payload lives in `config`.
const SETTING_KEY = 'crm.preferences';

export interface CrmPreferences {
  defaultPipelineId: string;
  defaultPageSize: number;
  showCompanyColumn: boolean;
  showOwnerColumn: boolean;
}

export const DEFAULT_CRM_PREFERENCES: CrmPreferences = {
  defaultPipelineId: '',
  defaultPageSize: 25,
  showCompanyColumn: true,
  showOwnerColumn: true,
};

const crmPreferencesSchema = z.object({
  defaultPipelineId: z.string(),
  defaultPageSize: z.number().int().positive(),
  showCompanyColumn: z.boolean(),
  showOwnerColumn: z.boolean(),
});

export function createCrmSettingsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const row = await db
        .selectFrom('cross_module_settings')
        .select('config')
        .where('workspace_id', '=', workspace.id)
        .where('setting_key', '=', SETTING_KEY)
        .executeTakeFirst();

      const stored = (row?.config ?? null) as Partial<CrmPreferences> | null;
      const data: CrmPreferences = { ...DEFAULT_CRM_PREFERENCES, ...(stored ?? {}) };

      res.json({ data, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.put('/', async (req, res, next) => {
    try {
      const { workspace, isAdmin, permissions } = req as unknown as AuthenticatedRequest;

      if (!isAdmin && !permissions.has('workspace:manage')) {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Admin only' } });
        return;
      }

      const parsed = crmPreferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_BODY', message: parsed.error.message } });
        return;
      }

      await db
        .insertInto('cross_module_settings')
        .values({
          workspace_id: workspace.id,
          setting_key: SETTING_KEY,
          enabled: true,
          config: parsed.data,
        })
        .onConflict(oc =>
          oc.columns(['workspace_id', 'setting_key']).doUpdateSet({
            enabled: true,
            config: parsed.data,
            updated_at: new Date(),
          }),
        )
        .execute();

      res.json({ data: parsed.data, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
