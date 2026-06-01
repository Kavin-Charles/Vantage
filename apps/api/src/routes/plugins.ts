import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth';
import { dispatchBridgeCall, runMigrations } from '@vantage/plugin-runtime';
import type { PluginPermission } from '@vantage/plugin-types';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const bridgeCallSchema = z.object({
  plugin_id: z.string().min(1),
  permissions: z.array(z.string()),
  tables: z.array(z.string()).default([]),
  method: z.string().min(1),
  payload: z.unknown(),
});

const installSchema = z.object({
  manifest: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    permissions: z.array(z.string()),
    migrations: z
      .array(
        z.object({
          version: z.string(),
          up: z.string(),
          down: z.string().optional(),
        }),
      )
      .optional()
      .default([]),
  }),
});

// ── Router ────────────────────────────────────────────────────────────────────

export function createPluginsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  /**
   * POST /api/plugins/bridge
   *
   * Receives a bridge call from the plugin runtime (backend isolate or iframe host).
   * Validates the request, then dispatches to the bridge-router for DB execution.
   *
   * Body: { plugin_id, permissions, tables, method, payload }
   * Response: BridgeResult — { data, error: null } | { data: null, error: PluginError }
   */
  router.post('/bridge', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const parsed = bridgeCallSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          data: null,
          error: { code: 'INVALID_REQUEST', message: parsed.error.message },
        });
      }

      const { plugin_id, permissions, tables, method, payload } = parsed.data;

      const result = await dispatchBridgeCall(
        db as Kysely<any>,
        {
          workspaceId: workspace.id,
          pluginSlug: plugin_id,
          permissions: permissions as readonly PluginPermission[],
          tables,
        },
        { method, payload },
      );

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/plugins/install
   *
   * Called when a plugin is installed or upgraded in a workspace.
   * Runs any pending migrations defined in the plugin manifest.
   *
   * Body: { manifest: PluginManifest }
   */
  router.post('/install', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const parsed = installSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          data: null,
          error: { code: 'INVALID_REQUEST', message: parsed.error.message },
        });
      }

      const { manifest } = parsed.data;
      await runMigrations(db as Kysely<any>, manifest.id, workspace.id, manifest.migrations);
      return res.json({ data: { ok: true }, error: null });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
