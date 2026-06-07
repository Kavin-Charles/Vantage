import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { z } from 'zod';
import multer from 'multer';
import AdmZip from 'adm-zip';
import * as esbuild from 'esbuild';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/auth';
import { dispatchBridgeCall, runMigrations } from '@vencore/plugin-runtime';
import { savePluginFile, loadPluginBackend, invalidatePlugin } from '../lib/plugin-loader';

// ── Esbuild Global Shim Plugin ────────────────────────────────────────────────
const globalExternalsPlugin: esbuild.Plugin = {
  name: 'global-externals',
  setup(build) {
    // Intercept exact imports for react, react-dom, and sdk
    build.onResolve({ filter: /^(react|react-dom|@vencore\/plugin-sdk|@vencore\/plugin-sdk\/react)$/ }, args => ({
      path: args.path,
      namespace: 'global-externals-stub',
    }));

    build.onLoad({ filter: /.*/, namespace: 'global-externals-stub' }, args => {
      let contents = '';
      if (args.path === 'react') {
        contents = 'module.exports = window.React;';
      } else if (args.path === 'react-dom') {
        contents = 'module.exports = window.ReactDOM;';
      } else if (args.path === '@vencore/plugin-sdk/react') {
        contents = `
          export function createFrontendPlugin(config) {
            return config;
          }
        `;
      } else if (args.path === '@vencore/plugin-sdk') {
        // Fallback for general SDK imports in the client if any
        contents = `module.exports = {};`;
      }
      return { contents, resolveDir: process.cwd() };
    });
  },
};

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
  method: z.string().min(1),
  payload: z.unknown(),
});

const permissionDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  defaultRoles: z.array(z.enum(['admin', 'member'])),
});

const settingsFieldSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), key: z.string(), label: z.string(), secret: z.boolean().optional(), default: z.string().optional() }),
  z.object({ type: z.literal('boolean'), key: z.string(), label: z.string(), secret: z.boolean().optional(), default: z.boolean().optional() }),
  z.object({ type: z.literal('number'), key: z.string(), label: z.string(), secret: z.boolean().optional(), default: z.number().optional(), min: z.number().optional(), max: z.number().optional() }),
  z.object({ type: z.literal('select'), key: z.string(), label: z.string(), secret: z.boolean().optional(), options: z.array(z.string()), default: z.string().optional() }),
]);

const manifestSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(255),
  version: z.string().min(1).max(32),
  description: z.string().max(512).optional(),
  icon: z.string().max(64).optional(),
  author: z.string().max(255).optional(),
  homepage: z.string().url().optional(),
  permissions: z.array(permissionDefSchema).optional().default([]),
  data_access: z.array(z.string()).optional().default([]),
  tables: z.array(z.object({
    name: z.string(),
    columns: z.array(z.object({ name: z.string(), type: z.string(), nullable: z.boolean().optional(), primary: z.boolean().optional(), unique: z.boolean().optional(), default: z.string().optional() })),
    drop_on_uninstall: z.boolean().optional(),
  })).optional().default([]),
  migrations: z.array(z.object({ version: z.string(), up: z.string(), down: z.string().optional() })).optional().default([]),
  hooks: z.array(z.string()).optional().default([]),
  emits: z.array(z.string()).optional().default([]),
  surfaces: z.object({
    nav: z.array(z.object({ label: z.string(), path: z.string(), icon: z.string().optional(), group: z.enum(['crm', 'infra', 'general']).optional() })).optional(),
    pages: z.array(z.object({ path: z.string(), title: z.string() })).optional(),
    widgets: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
    panels: z.array(z.object({ record_type: z.string(), id: z.string(), label: z.string() })).optional(),
  }).optional(),
  settings_schema: z.array(settingsFieldSchema).optional().default([]),
  build: z.object({ server: z.string().optional(), client: z.string().optional() }).optional(),
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

      const { plugin_id, method, payload } = parsed.data;

      const pluginRow = await db.selectFrom('workspace_plugins').select(['plugin_id', 'manifest', 'enabled'])
        .where('workspace_id', '=', workspace.id)
        .where('plugin_id', '=', plugin_id)
        .where('enabled', '=', true)
        .executeTakeFirst();

      if (!pluginRow) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Plugin not found or disabled' } });
      }

      const manifest = pluginRow.manifest as unknown as import('@vencore/plugin-types').PluginManifest;
      const dataAccess = (manifest.data_access ?? []) as readonly import('@vencore/plugin-types').PluginPermission[];
      const tables = (manifest.tables ?? []).map((t) => t.name);

      const result = await dispatchBridgeCall(
        db as Kysely<any>,
        { workspaceId: workspace.id, pluginSlug: plugin_id, dataAccess, tables },
        { method, payload },
      );

      return res.json(result);
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
   * GET /api/plugins/:id
   * Returns a single plugin by row id.
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const plugin = await db.selectFrom('workspace_plugins').selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
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
   * GET /api/plugins/:id/client.js
   * Serves the compiled client bundle for a plugin.
   */
  router.get('/:id/client.js', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const plugin = await db.selectFrom('workspace_plugins').select(['plugin_id', 'enabled'])
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!plugin || !plugin.enabled) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Plugin not found' } });
      }
      const storageDir = process.env['PLUGIN_STORAGE_DIR'] ?? path.join(process.cwd(), 'plugin-storage');
      const filePath = path.join(storageDir, plugin.plugin_id, 'client.js');
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ data: null, error: { code: 'NO_CLIENT', message: 'No client bundle for this plugin' } });
      }
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(filePath);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * GET /api/plugins/:id/settings
   * Returns non-secret plugin settings for the workspace.
   */
  router.get('/:id/settings', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const plugin = await db.selectFrom('workspace_plugins').select(['plugin_id', 'manifest'])
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!plugin) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Plugin not found' } });
      }

      const manifest = plugin.manifest as unknown as import('@vencore/plugin-types').PluginManifest;
      const schema = manifest.settings_schema ?? [];
      const secretKeys = new Set(schema.filter((f) => f.secret).map((f) => f.key));

      const rows = await (db as any).selectFrom('plugin_settings')
        .select(['key', 'value'])
        .where('workspace_id', '=', workspace.id)
        .where('plugin_id', '=', plugin.plugin_id)
        .execute() as Array<{ key: string; value: unknown }>;

      const settings: Record<string, unknown> = {};
      for (const row of rows) {
        if (!secretKeys.has(row.key)) {
          settings[row.key] = row.value;
        }
      }
      return res.json({ data: settings, error: null });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * PUT /api/plugins/:id/settings
   * Upserts plugin settings for the workspace.
   */
  router.put('/:id/settings', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const plugin = await db.selectFrom('workspace_plugins').select(['plugin_id', 'manifest'])
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!plugin) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Plugin not found' } });
      }

      const manifest = plugin.manifest as unknown as import('@vencore/plugin-types').PluginManifest;
      const schema = manifest.settings_schema ?? [];
      const validKeys = new Set(schema.map((f) => f.key));
      const secretKeys = new Set(schema.filter((f) => f.secret).map((f) => f.key));

      const body = z.record(z.unknown()).parse(req.body);

      for (const [key, value] of Object.entries(body)) {
        if (!validKeys.has(key)) continue;
        await (db as any).insertInto('plugin_settings')
          .values({
            workspace_id: workspace.id,
            plugin_id: plugin.plugin_id,
            key,
            value: value as any,
            encrypted: secretKeys.has(key),
          })
          .onConflict((oc: any) =>
            oc.columns(['workspace_id', 'plugin_id', 'key']).doUpdateSet({ value: value as any, updated_at: new Date() })
          )
          .execute();
      }
      return res.json({ data: { ok: true }, error: null });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/plugins/upload
   * Accepts a .zip containing plugin.json. Extracts, validates, compiles with
   * esbuild, saves bundles, runs migrations, then upserts the plugin record.
   */
  router.post('/upload', requireAdmin, upload.single('plugin'), async (req, res, next) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vencore-plugin-'));
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      if (!req.file) {
        return res.status(400).json({ data: null, error: { code: 'MISSING_FILE', message: 'No zip file uploaded' } });
      }

      // Extract zip to temp dir
      const zip = new AdmZip(req.file.buffer);
      zip.extractAllTo(tmpDir, true);

      // Read plugin.json
      const pluginJsonPath = path.join(tmpDir, 'plugin.json');
      if (!fs.existsSync(pluginJsonPath)) {
        return res.status(400).json({ data: null, error: { code: 'MISSING_PLUGIN_JSON', message: 'plugin.json not found in zip root' } });
      }
      let manifestRaw: unknown;
      try {
        manifestRaw = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      } catch {
        return res.status(400).json({ data: null, error: { code: 'INVALID_JSON', message: 'plugin.json is not valid JSON' } });
      }

      const parsed = manifestSchema.safeParse(manifestRaw);
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_MANIFEST', message: parsed.error.message } });
      }
      const mf = parsed.data;

      // Compile server bundle
      if (mf.build?.server) {
        const entryPath = path.join(tmpDir, mf.build.server);
        if (!fs.existsSync(entryPath)) {
          return res.status(400).json({ data: null, error: { code: 'MISSING_ENTRY', message: `build.server entry not found: ${mf.build.server}` } });
        }
        const outfile = path.join(tmpDir, '_server_out.cjs');
        const result = await esbuild.build({
          entryPoints: [entryPath],
          bundle: true,
          platform: 'node',
          format: 'cjs',
          outfile,
          external: ['@vencore/plugin-sdk', '@vencore/plugin-types'],
          logLevel: 'silent',
        });
        if (result.errors.length > 0) {
          return res.status(400).json({ data: null, error: { code: 'BUILD_FAILED', message: result.errors.map((e) => e.text).join('\n') } });
        }
        savePluginFile(mf.id, 'server.cjs', fs.readFileSync(outfile));
      }

      // Compile client bundle
      if (mf.build?.client) {
        const entryPath = path.join(tmpDir, mf.build.client);
        if (!fs.existsSync(entryPath)) {
          return res.status(400).json({ data: null, error: { code: 'MISSING_ENTRY', message: `build.client entry not found: ${mf.build.client}` } });
        }
        const outfile = path.join(tmpDir, '_client_out.js');
        const result = await esbuild.build({
          entryPoints: [entryPath],
          bundle: true,
          platform: 'browser',
          format: 'esm',
          outfile,
          plugins: [globalExternalsPlugin],
          logLevel: 'silent',
        });
        if (result.errors.length > 0) {
          return res.status(400).json({ data: null, error: { code: 'BUILD_FAILED', message: result.errors.map((e) => e.text).join('\n') } });
        }
        savePluginFile(mf.id, 'client.js', fs.readFileSync(outfile));
      }

      // Save plugin.json
      savePluginFile(mf.id, 'plugin.json', Buffer.from(JSON.stringify(mf)));

      // Run DB migrations
      await runMigrations(db as Kysely<any>, mf.id, workspace.id, mf.migrations);

      // Upsert workspace_plugins
      const plugin = await db
        .insertInto('workspace_plugins')
        .values({
          workspace_id: workspace.id,
          plugin_id: mf.id,
          name: mf.name,
          version: mf.version,
          manifest: mf as unknown as Record<string, unknown>,
          enabled: true,
        })
        .onConflict((oc) =>
          oc.constraint('workspace_plugins_workspace_plugin_unique').doUpdateSet({
            name: mf.name,
            version: mf.version,
            manifest: mf as unknown as Record<string, unknown>,
            enabled: true,
          })
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      // Load backend bundle
      loadPluginBackend(mf.id, db);

      return res.status(201).json({ data: plugin, error: null });
    } catch (err) {
      return next(err);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
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

      if (!enabled) invalidatePlugin(plugin.plugin_id);

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

      invalidatePlugin(deleted.plugin_id);

      return res.json({ data: { ok: true }, error: null });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
