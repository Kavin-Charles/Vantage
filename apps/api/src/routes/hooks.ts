import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { PluginManifest } from '@vencore/plugin-types';
import { HOOK_REGISTRY } from '../modules/registry';
import { getActiveProviderForContract, resolveProviderName } from '@vencore/plugin-runtime';
import { listPluginHookFeatures } from '../lib/hook-features';
import { CRM_HOOK_FEATURES } from '../lib/crm-hook-features';
import type { AuthenticatedRequest } from '../middleware/auth';

/**
 * Per-module hook features not (yet) declared in the shared @vencore/modules
 * registry. Merged on top of HOOK_REGISTRY by module id so a moduleId can be
 * sourced from either registry without callers caring which.
 */
const EXTRA_HOOK_FEATURES: Record<string, typeof CRM_HOOK_FEATURES> = {
  crm: CRM_HOOK_FEATURES,
};

function getHookFeaturesForModule(moduleId: string) {
  return [...(HOOK_REGISTRY[moduleId] ?? []), ...(EXTRA_HOOK_FEATURES[moduleId] ?? [])];
}

interface ProviderRef { id: string; name: string }

/**
 * Compatible providers for a feature = static builtin entries + any enabled
 * workspace plugin that provides the feature's requires_contract.
 */
async function computeCompatibleProviders(
  db: Kysely<Database>,
  workspaceId: string,
  feature: { requires_contract?: string; compatible_providers: ProviderRef[] },
): Promise<ProviderRef[]> {
  const result: ProviderRef[] = [...feature.compatible_providers];
  if (!feature.requires_contract) return result;

  const plugins = await db
    .selectFrom('workspace_plugins')
    .select(['plugin_id', 'name', 'manifest'])
    .where('workspace_id', '=', workspaceId)
    .where('enabled', '=', true)
    .execute();

  for (const p of plugins) {
    const mf = p.manifest as unknown as PluginManifest;
    const provides = (mf.provides ?? []).some((pr) => pr.contract === feature.requires_contract);
    if (provides && !result.some((r) => r.id === p.plugin_id)) {
      result.push({ id: p.plugin_id, name: p.name });
    }
  }
  return result;
}

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
      const { workspace, isAdmin, permissions } = req as unknown as AuthenticatedRequest;
      if (!isAdmin && !permissions.has('integrations:manage')) {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }

      const features = getHookFeaturesForModule(req.params['moduleId']!);
      if (features.length === 0) {
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

      const data = await Promise.all(features.map(async feature => {
        const config = configMap.get(feature.id);

        // Switch model: contract-backed features are powered by the group's
        // active provider (chosen once in Settings → Data providers), not a
        // per-feature selection. Only the enable toggle remains per feature.
        if (feature.requires_contract) {
          const active = await getActiveProviderForContract(db as Kysely<any>, workspace.id, feature.requires_contract);
          if (active) {
            const providerName = await resolveProviderName(db as Kysely<any>, workspace.id, active.provider);
            const enabled = config?.enabled ?? false;
            return {
              id: feature.id,
              name: feature.name,
              description: feature.description,
              requires_contract: feature.requires_contract,
              powered_by: { id: active.provider, name: providerName, pending_selection: active.status === 'pending_selection' },
              compatible_providers: [],
              installed_providers: [],
              state: enabled ? 'enabled' as const : 'available' as const,
              selected_provider_id: null,
              selected_provider_name: providerName,
              enabled,
            };
          }
        }

        // Legacy path — features without a grouped contract keep explicit
        // provider selection from PR #48.
        const compatible = await computeCompatibleProviders(db, workspace.id, feature);
        const compatibleInstalled = compatible
          .map(cp => installedMap.get(cp.id))
          .filter((p): p is NonNullable<typeof p> => p !== undefined);

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
          requires_contract: feature.requires_contract ?? null,
          powered_by: null,
          compatible_providers: compatible.map(cp => ({
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
      }));

      res.json({ data, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/settings/hooks/:moduleId/:featureId
  router.patch('/hooks/:moduleId/:featureId', async (req, res, next) => {
    try {
      const { workspace, isAdmin, permissions } = req as unknown as AuthenticatedRequest;
      if (!isAdmin && !permissions.has('integrations:manage')) {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }

      const { moduleId, featureId } = req.params as { moduleId: string; featureId: string };

      const features = getHookFeaturesForModule(moduleId);
      const feature = features.find(f => f.id === featureId);
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

      // Contract-backed features: provider comes from group selection, only
      // the enable toggle is stored (provider_id ignored)
      if (feature.requires_contract) {
        await db
          .insertInto('workspace_hook_configs')
          .values({
            workspace_id: workspace.id,
            module_id: moduleId,
            feature_id: featureId,
            provider_id: null,
            enabled,
          })
          .onConflict(oc =>
            oc.columns(['workspace_id', 'module_id', 'feature_id']).doUpdateSet({
              enabled,
              updated_at: new Date(),
            }),
          )
          .execute();
        res.json({ data: { module_id: moduleId, feature_id: featureId, enabled }, error: null });
        return;
      }

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

        const compatible = await computeCompatibleProviders(db, workspace.id, feature);
        const isCompatible = compatible.some(cp => cp.id === installed.provider_id);
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

  // GET /api/settings/plugin-hooks
  // Hook features declared by installed plugins — admin can toggle + configure.
  router.get('/plugin-hooks', async (req, res, next) => {
    try {
      const { workspace, isAdmin, permissions } = req as unknown as AuthenticatedRequest;
      if (!isAdmin && !permissions.has('integrations:manage')) {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }

      const entries = await listPluginHookFeatures(db, workspace.id);
      const configs = await db.selectFrom('workspace_hook_configs')
        .select(['module_id', 'feature_id', 'enabled', 'config'])
        .where('workspace_id', '=', workspace.id)
        .execute();
      const configMap = new Map(configs.map(c => [`${c.module_id}:${c.feature_id}`, c]));

      const data = await Promise.all(entries.map(async ({ plugin_id, plugin_name, feature }) => {
        const cfg = configMap.get(`${plugin_id}:${feature.id}`);
        let available = true;
        let powered_by: string | null = null;
        if (feature.requires_contract) {
          const active = await getActiveProviderForContract(db as Kysely<any>, workspace.id, feature.requires_contract);
          available = !!active;
          powered_by = active
            ? await resolveProviderName(db as Kysely<any>, workspace.id, active.provider)
            : null;
        }
        return {
          plugin_id, plugin_name,
          id: feature.id,
          name: feature.name,
          description: feature.description ?? null,
          trigger: feature.trigger,
          requires_contract: feature.requires_contract ?? null,
          config_schema: feature.config_schema ?? [],
          available,
          powered_by,
          enabled: cfg?.enabled ?? false,
          config: cfg?.config ?? {},
        };
      }));

      res.json({ data, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/settings/plugin-hooks/:pluginId/:featureId
  router.patch('/plugin-hooks/:pluginId/:featureId', async (req, res, next) => {
    try {
      const { workspace, isAdmin, permissions } = req as unknown as AuthenticatedRequest;
      if (!isAdmin && !permissions.has('integrations:manage')) {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }
      const { pluginId, featureId } = req.params as { pluginId: string; featureId: string };

      const entries = await listPluginHookFeatures(db, workspace.id);
      const entry = entries.find(e => e.plugin_id === pluginId && e.feature.id === featureId);
      if (!entry) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Hook feature not found' } });
        return;
      }

      const parsed = z.object({
        enabled: z.boolean(),
        config: z.record(z.unknown()).optional(),
      }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_BODY' } });
        return;
      }

      const configJson = parsed.data.config
        ? sql`${JSON.stringify(parsed.data.config)}::jsonb`
        : null;

      await db.insertInto('workspace_hook_configs')
        .values({
          workspace_id: workspace.id,
          module_id: pluginId,
          feature_id: featureId,
          provider_id: null,
          enabled: parsed.data.enabled,
          config: configJson as never,
        })
        .onConflict(oc =>
          oc.columns(['workspace_id', 'module_id', 'feature_id']).doUpdateSet({
            enabled: parsed.data.enabled,
            ...(parsed.data.config ? { config: configJson as never } : {}),
            updated_at: new Date(),
          }),
        )
        .execute();

      res.json({ data: { plugin_id: pluginId, feature_id: featureId, enabled: parsed.data.enabled }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/settings/providers
  router.get('/providers', async (req, res, next) => {
    try {
      const { workspace, isAdmin, permissions } = req as unknown as AuthenticatedRequest;
      if (!isAdmin && !permissions.has('integrations:manage')) {
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
      const { workspace, isAdmin, permissions } = req as unknown as AuthenticatedRequest;
      if (!isAdmin && !permissions.has('integrations:manage')) {
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
      const { workspace, isAdmin, permissions } = req as unknown as AuthenticatedRequest;
      if (!isAdmin && !permissions.has('integrations:manage')) {
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
