import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { z } from 'zod';
import multer from 'multer';
import AdmZip from 'adm-zip';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/auth';
import { dispatchBridgeCall, runMigrations } from '@vantage/plugin-runtime';
import type { PluginPermission } from '@vantage/plugin-types';

// ── Multer — memory storage, 10 MB limit ─────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are accepted'));
    }
  },
});

// ── Zod schemas ───────────────────────────────────────────────────────────────

const bridgeCallSchema = z.object({
  plugin_id: z.string().min(1),
  permissions: z.array(z.string()),
  tables: z.array(z.string()).default([]),
  method: z.string().min(1),
  payload: z.unknown(),
});

const manifestSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(255),
  version: z.string().min(1).max(32),
  permissions: z.array(z.string()).default([]),
  tables: z.array(z.string()).default([]),
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
});

const installSchema = z.object({
  manifest: manifestSchema,
});

// ── Router ────────────────────────────────────────────────────────────────────

export function createPluginsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  /**
   * POST /api/plugins/bridge
   * Dispatches a plugin bridge call.
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
   * Runs migrations for a plugin manifest (programmatic install).
   */
  router.post('/install', requireAdmin, async (req, res, next) => {
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

  /**
   * GET /api/plugins
   * Lists all plugins installed for the workspace.
   */
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const plugins = await db
        .selectFrom('workspace_plugins')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .orderBy('installed_at', 'asc')
        .execute();

      return res.json({ data: plugins, error: null });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/plugins/upload
   * Accepts a .zip containing manifest.json. Extracts + validates the manifest,
   * runs plugin migrations, then upserts the plugin record.
   */
  router.post('/upload', requireAdmin, upload.single('plugin'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      if (!req.file) {
        return res.status(400).json({
          data: null,
          error: { code: 'MISSING_FILE', message: 'No zip file uploaded' },
        });
      }

      // Extract manifest.json from zip
      let manifestRaw: unknown;
      try {
        const zip = new AdmZip(req.file.buffer);
        const entry = zip.getEntry('manifest.json');
        if (!entry) {
          return res.status(400).json({
            data: null,
            error: { code: 'MISSING_MANIFEST', message: 'manifest.json not found in zip' },
          });
        }
        const text = entry.getData().toString('utf8');
        manifestRaw = JSON.parse(text);
      } catch {
        return res.status(400).json({
          data: null,
          error: { code: 'INVALID_ZIP', message: 'Failed to read or parse zip file' },
        });
      }

      // Validate manifest shape
      const parsed = manifestSchema.safeParse(manifestRaw);
      if (!parsed.success) {
        return res.status(400).json({
          data: null,
          error: { code: 'INVALID_MANIFEST', message: parsed.error.message },
        });
      }

      const manifest = parsed.data;

      // Run plugin migrations
      await runMigrations(db as Kysely<any>, manifest.id, workspace.id, manifest.migrations);

      // Upsert plugin record
      const plugin = await db
        .insertInto('workspace_plugins')
        .values({
          workspace_id: workspace.id,
          plugin_id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          manifest: manifest as unknown as Record<string, unknown>,
          enabled: true,
        })
        .onConflict(oc =>
          oc.constraint('workspace_plugins_workspace_plugin_unique').doUpdateSet({
            name: manifest.name,
            version: manifest.version,
            manifest: manifest as unknown as Record<string, unknown>,
            enabled: true,
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      return res.status(201).json({ data: plugin, error: null });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * PATCH /api/plugins/:id
   * Toggle a plugin enabled/disabled.
   */
  router.patch('/:id', requireAdmin, async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);

      const plugin = await db
        .updateTable('workspace_plugins')
        .set({ enabled })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      if (!plugin) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Plugin not found' } });
      }

      return res.json({ data: plugin, error: null });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * DELETE /api/plugins/:id
   * Removes a plugin from the workspace.
   */
  router.delete('/:id', requireAdmin, async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const deleted = await db
        .deleteFrom('workspace_plugins')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      if (!deleted) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Plugin not found' } });
      }

      return res.json({ data: { ok: true }, error: null });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
