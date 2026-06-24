import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { HOOK_REGISTRY } from '../modules/registry';
import type { AuthenticatedRequest } from '../middleware/auth';

const patchFeatureSchema = z.object({
  enabled: z.boolean(),
  provider_id: z.string().uuid().nullable().optional(),
});

const postProviderSchema = z.object({
  provider_id: z.string().min(1).max(120),
  name: z.string().min(1).max(255),
  source: z.enum(['builtin', 'plugin']),
  meta: z.record(z.unknown()).optional(),
});

export function createHooksRouter(db: Kysely<Database>): Router {
  const router = Router();

  // GET /api/settings/hooks/:moduleId
  router.get('/hooks/:moduleId', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }

      const features = HOOK_REGISTRY[req.params['moduleId']!];
      if (!features || features.length === 0) {
        res.json({ data: [], error: null });
        return;
      }

      const installedProviders = await db
        .selectFrom('hook_providers')
        .where('workspace_id', '=', workspace.id)
        .where('enabled', '=', true)
        .selectAll()
        .execute();

      const installedMap = new Map(installedProviders.map(p => [p.provider_id, p]));

      const configs = await db
        .selectFrom('workspace_hook_configs')
        .where('workspace_id', '=', workspace.id)
        .where('module_id', '=', req.params['moduleId']!)
        .selectAll()
        .execute();

      const configMap = new Map(configs.map(c => [c.feature_id, c]));

      const data = features.map(feature => {
        const compatibleInstalled = feature.compatible_providers
          .map(cp => installedMap.get(cp.id))
          .filter((p): p is NonNullable<typeof p> => p !== undefined);

        const config = configMap.get(feature.id);
        const selectedProvider = config?.provider_id
          ? installedProviders.find(p => p.id === config.provider_id) ?? null
          : null;

        let state: 'provider_required' | 'available' | 'enabled' | 'disabled' | 'unavailable';
        if (compatibleInstalled.length === 0) {
          state = 'provider_required';
        } else if (!config || !config.provider_id) {
          state = 'available';
        } else if (!selectedProvider) {
          state = 'unavailable';
        } else if (config.enabled) {
          state = 'enabled';
        } else {
          state = 'disabled';
        }

        return {
          id: feature.id,
          name: feature.name,
          description: feature.description,
          compatible_providers: feature.compatible_providers.map(cp => ({
            ...cp,
            installed: installedMap.has(cp.id),
          })),
          installed_providers: compatibleInstalled.map(p => ({
            id: p.id,
            provider_id: p.provider_id,
            name: p.name,
          })),
          state,
          selected_provider_id: config?.provider_id ?? null,
          selected_provider_name: selectedProvider?.name ?? null,
          enabled: config?.enabled ?? false,
        };
      });

      res.json({ data, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/settings/hooks/:moduleId/:featureId
  router.patch('/hooks/:moduleId/:featureId', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }

      const { moduleId, featureId } = req.params as { moduleId: string; featureId: string };

      const features = HOOK_REGISTRY[moduleId];
      const feature = features?.find(f => f.id === featureId);
      if (!feature) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Feature not found' } });
        return;
      }

      const parsed = patchFeatureSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_BODY' } });
        return;
      }

      const { enabled, provider_id } = parsed.data;

      // Validate provider_id is installed and compatible
      if (provider_id) {
        const installed = await db
          .selectFrom('hook_providers')
          .where('id', '=', provider_id)
          .where('workspace_id', '=', workspace.id)
          .where('enabled', '=', true)
          .select(['id', 'provider_id'])
          .executeTakeFirst();

        if (!installed) {
          res.status(422).json({ data: null, error: { code: 'PROVIDER_NOT_INSTALLED', message: 'Provider is not installed in this workspace' } });
          return;
        }

        const isCompatible = feature.compatible_providers.some(cp => cp.id === installed.provider_id);
        if (!isCompatible) {
          res.status(422).json({ data: null, error: { code: 'PROVIDER_INCOMPATIBLE', message: 'Provider is not compatible with this feature' } });
          return;
        }
      }

      await db
        .insertInto('workspace_hook_configs')
        .values({
          workspace_id: workspace.id,
          module_id: moduleId,
          feature_id: featureId,
          provider_id: provider_id ?? null,
          enabled,
        })
        .onConflict(oc =>
          oc.columns(['workspace_id', 'module_id', 'feature_id']).doUpdateSet({
            provider_id: provider_id ?? null,
            enabled,
            updated_at: new Date(),
          }),
        )
        .execute();

      res.json({ data: { module_id: moduleId, feature_id: featureId, enabled }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/settings/providers
  router.get('/providers', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }

      const providers = await db
        .selectFrom('hook_providers')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('name', 'asc')
        .execute();

      res.json({ data: providers, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/settings/providers
  router.post('/providers', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }

      const parsed = postProviderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_BODY' } });
        return;
      }

      const provider = await db
        .insertInto('hook_providers')
        .values({
          workspace_id: workspace.id,
          provider_id: parsed.data.provider_id,
          name: parsed.data.name,
          source: parsed.data.source,
          meta: parsed.data.meta ?? null,
          enabled: true,
        })
        .onConflict(oc =>
          oc.columns(['workspace_id', 'provider_id']).doUpdateSet({
            name: parsed.data.name,
            enabled: true,
            updated_at: new Date(),
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: provider, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/settings/providers/:id
  router.delete('/providers/:id', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }

      const deleted = await db
        .deleteFrom('hook_providers')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      // Null out + disable affected hook configs (ON DELETE SET NULL handles provider_id;
      // we still need to set enabled = false)
      await db
        .updateTable('workspace_hook_configs')
        .set({ enabled: false, updated_at: new Date() })
        .where('workspace_id', '=', workspace.id)
        .where('provider_id', 'is', null)
        .where('enabled', '=', true)
        .execute();

      res.json({ data: { id: req.params['id'] }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
