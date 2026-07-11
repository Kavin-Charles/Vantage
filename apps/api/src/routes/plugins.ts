import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
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
import { dispatchBridgeCall, runMigrations, dropPluginTables, isKnownContract, hasHubPermission, removeProviderHubData, CONTRACT_ID_RE } from '@vencore/plugin-runtime';
import { savePluginFile, loadPluginBackend, invalidatePlugin } from '../lib/plugin-loader';
import { encryptSettingValue, isEncryptedValue, decryptSettingValue } from '../lib/plugin-settings-crypto';
import { logger } from '../lib/logger';
import { semverValid, semverValidRange } from '../lib/version';
import { checkVersionRules } from '../lib/plugin-version-rules';

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

// Allowed column types — enforced at manifest parse time, no arbitrary SQL types
const PLUGIN_COLUMN_TYPES = ['uuid', 'text', 'integer', 'bigint', 'boolean', 'decimal', 'timestamptz', 'jsonb'] as const;

// Valid plugin/table/column identifier: lowercase, starts with letter, alphanumeric + underscore
const identifierSchema = z.string().min(1).max(63).regex(/^[a-z][a-z0-9_]*$/, 'Must be lowercase, start with a letter, use only a-z 0-9 _');

const columnSchema = z.object({
  name: identifierSchema,
  type: z.enum(PLUGIN_COLUMN_TYPES),
  nullable: z.boolean().optional(),
  primary: z.boolean().optional(),
  unique: z.boolean().optional(),
  // default intentionally omitted — no raw SQL defaults from plugin manifests
});

const tableSchema = z.object({
  name: identifierSchema,
  columns: z.array(columnSchema).min(1),
  indexes: z.array(z.object({
    columns: z.array(identifierSchema).min(1),
    unique: z.boolean().optional(),
  })).optional(),
  drop_on_uninstall: z.boolean().optional(),
});

export const manifestSchema = z.object({
  id: z.string().min(1).max(128).regex(/^[a-z][a-z0-9-]*$/, 'Plugin ID must be lowercase kebab-case'),
  name: z.string().min(1).max(255),
  version: z.string().min(1).max(64)
    .refine((v) => semverValid(v) !== null, 'Version must be valid semver (e.g. 1.2.3 or 1.2.3-dev.1)'),
  sdk_version: z.string().max(64)
    .refine((v) => semverValid(v) !== null, 'sdk_version must be an exact semver version')
    .optional(),
  host_version: z.string().max(128)
    .refine((r) => semverValidRange(r) !== null, 'host_version must be a valid semver range (e.g. ">=1.2.0 <2")')
    .optional(),
  description: z.string().max(512).optional(),
  icon: z.string().max(64).optional(),
  author: z.string().max(255).optional(),
  homepage: z.string().url().optional(),
  permissions: z.array(permissionDefSchema).optional().default([]),
  data_access: z.array(z.string()).optional().default([]),
  tables: z.array(tableSchema).optional().default([]),
  // migrations field accepted for backward compat but ignored — DDL is generated from tables
  migrations: z.array(z.object({ version: z.string(), up: z.string(), down: z.string().optional() })).optional().default([]),
  hooks: z.array(z.string()).optional().default([]),
  emits: z.array(z.string()).optional().default([]),
  listens: z.array(z.string()).optional().default([]),
  provides: z.array(z.object({
    contract: z.string().regex(CONTRACT_ID_RE, 'Contract id must look like namespace.name@vN'),
    mode: z.literal('synced').optional(),
  })).optional().default([]),
  consumes: z.array(z.object({
    contract: z.string().regex(CONTRACT_ID_RE, 'Contract id must look like namespace.name@vN'),
    optional: z.boolean().optional(),
  })).optional().default([]),
  endpoints: z.array(z.string()).optional().default([]),
  surfaces: z.object({
    nav: z.array(z.object({ label: z.string(), path: z.string(), icon: z.string().optional(), group: z.enum(['crm', 'infra', 'general']).optional() })).optional(),
    pages: z.array(z.object({ path: z.string(), title: z.string() })).optional(),
    widgets: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
    panels: z.array(z.object({ record_type: z.string(), id: z.string(), label: z.string() })).optional(),
  }).optional(),
  settings_schema: z.array(settingsFieldSchema).optional().default([]),
  build: z.object({ server: z.string().optional(), client: z.string().optional() }).optional(),
});

// ── Hub declaration validation ────────────────────────────────────────────────

type ParsedManifest = z.infer<typeof manifestSchema>;

/**
 * Cross-checks provides/consumes against the contract registry and the
 * plugin's own data_access grants. Returns an error message or null.
 */
function validateHubDeclarations(mf: ParsedManifest): string | null {
  for (const p of mf.provides) {
    if (!isKnownContract(p.contract)) {
      return `provides: unknown contract '${p.contract}'`;
    }
    if (!hasHubPermission(mf.data_access, 'write', p.contract)) {
      return `provides '${p.contract}' requires data_access 'hub:write:${p.contract}'`;
    }
  }
  for (const c of mf.consumes) {
    if (!isKnownContract(c.contract)) {
      return `consumes: unknown contract '${c.contract}'`;
    }
    if (!hasHubPermission(mf.data_access, 'read', c.contract)) {
      return `consumes '${c.contract}' requires data_access 'hub:read:${c.contract}'`;
    }
  }
  return null;
}

/**
 * Keeps hook_providers in sync with plugin lifecycle: a plugin that provides
 * hub contracts is automatically available as a hook provider.
 */
async function syncHookProvider(
  db: Kysely<Database>,
  workspaceId: string,
  mf: Pick<ParsedManifest, 'id' | 'name' | 'provides'>,
  enabled: boolean,
): Promise<void> {
  if (mf.provides.length === 0) return;
  await db.insertInto('hook_providers')
    .values({
      workspace_id: workspaceId,
      provider_id: mf.id,
      name: mf.name,
      source: 'plugin',
      meta: { contracts: mf.provides.map((p) => p.contract) } as unknown as Record<string, unknown>,
      enabled,
    })
    .onConflict((oc) =>
      oc.columns(['workspace_id', 'provider_id']).doUpdateSet({
        name: mf.name,
        meta: { contracts: mf.provides.map((p) => p.contract) } as unknown as Record<string, unknown>,
        enabled,
        updated_at: new Date(),
      }),
    )
    .execute();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface MarketplacePlugin {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  version: string;
  pricing_type: 'free' | 'paid';
  price_cents: number | null;
  currency: string;
  icon_url: string | null;
  author_name: string;
  download_url?: string;
}

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
        { workspaceId: workspace.id, pluginSlug: plugin_id, dataAccess, tables, manifest },
        { method, payload },
      );

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * GET /api/plugins/marketplace
   * Lists approved plugins from the platform marketplace.
   */
  router.get('/marketplace', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const marketplaceUrl = process.env['MARKETPLACE_API_URL'] ?? '';
      if (!marketplaceUrl) {
        return res.json({ data: [], error: null });
      }

      const svcToken = process.env['MARKETPLACE_SERVICE_TOKEN'] ?? '';
      const r = await fetch(`${marketplaceUrl}/v1/plugins`, {
        headers: { 'x-service-token': svcToken },
      });
      if (!r.ok) {
        const errBody = await r.text().catch(() => '');
        return res.status(502).json({ data: null, error: { code: 'UPSTREAM_ERROR', message: `Platform returned ${r.status}: ${errBody.slice(0, 200)}` } });
      }
      const json = await (r.json() as Promise<{ data: MarketplacePlugin[]; error: null }>);

      const installed = await db
        .selectFrom('workspace_plugins')
        .select(['platform_plugin_id'])
        .where('workspace_id', '=', workspace.id)
        .where('platform_plugin_id', 'is not', null)
        .execute();

      const installedIds = new Set(installed.map(p => p.platform_plugin_id));

      const plugins = (json.data ?? []).map(p => ({
        ...p,
        installed: installedIds.has(p.id),
      }));

      return res.json({ data: plugins, error: null });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/plugins/marketplace/install/:platformPluginId
   * Downloads plugin from marketplace and installs it.
   * Paid plugins require a license_key in the body.
   */
  router.post('/marketplace/install/:platformPluginId', requireAdmin, async (req, res, next) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vencore-plugin-'));
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { platformPluginId } = req.params as { platformPluginId: string };
      const { license_key } = req.body as { license_key?: string };

      const marketplaceUrl = process.env['MARKETPLACE_API_URL'] ?? '';
      if (!marketplaceUrl) {
        return res.status(503).json({ data: null, error: { code: 'NO_MARKETPLACE', message: 'Marketplace not configured' } });
      }

      const svcToken = process.env['MARKETPLACE_SERVICE_TOKEN'] ?? '';
      const r = await fetch(`${marketplaceUrl}/v1/plugins/${platformPluginId}`, {
        headers: { 'x-service-token': svcToken },
      });
      if (!r.ok) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Plugin not found in marketplace' } });
      }
      const { data: mp } = await (r.json() as Promise<{ data: MarketplacePlugin & { download_url: string } }>);

      if (mp.pricing_type === 'paid') {
        if (!license_key) {
          return res.status(402).json({ data: null, error: { code: 'LICENSE_REQUIRED', message: 'License key required for paid plugin' } });
        }
        const licRes = await fetch(`${marketplaceUrl}/v1/licenses/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-service-token': svcToken },
          body: JSON.stringify({ plugin_id: mp.id, workspace_id: workspace.id, key: license_key }),
        });
        const licJson = await (licRes.json() as Promise<{ data: { valid: boolean } | null; error: { code: string; message: string } | null }>);
        if (licJson.error) {
          return res.status(licRes.status).json({ data: null, error: licJson.error });
        }
      }

      const zipRes = await fetch(mp.download_url);
      if (!zipRes.ok) {
        return res.status(502).json({ data: null, error: { code: 'DOWNLOAD_FAILED', message: 'Failed to download plugin' } });
      }
      const zipBuffer = Buffer.from(await zipRes.arrayBuffer());

      const zip = new AdmZip(zipBuffer);
      zip.extractAllTo(tmpDir, true);

      const pluginJsonPath = path.join(tmpDir, 'plugin.json');
      if (!fs.existsSync(pluginJsonPath)) {
        return res.status(400).json({ data: null, error: { code: 'MISSING_PLUGIN_JSON', message: 'plugin.json not found in zip' } });
      }
      const manifestRaw = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      const parsed = manifestSchema.safeParse(manifestRaw);
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_MANIFEST', message: parsed.error.message } });
      }
      const mf = parsed.data;

      const hubError = validateHubDeclarations(mf);
      if (hubError) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_MANIFEST', message: hubError } });
      }

      const versionCheck = await checkVersionRules(db, workspace.id, mf);
      if (versionCheck.error) {
        return res.status(409).json({ data: null, error: versionCheck.error });
      }

      // Use pre-built bundles from the zip (marketplace stores built artifacts)
      const serverBundlePath = path.join(tmpDir, 'server.cjs');
      if (fs.existsSync(serverBundlePath)) {
        savePluginFile(mf.id, 'server.cjs', fs.readFileSync(serverBundlePath));
      } else if (mf.build?.server) {
        const entryPath = path.join(tmpDir, mf.build.server);
        if (fs.existsSync(entryPath)) {
          const outfile = path.join(tmpDir, '_server_out.cjs');
          await esbuild.build({
            entryPoints: [entryPath], bundle: true, platform: 'node', format: 'cjs', outfile,
            external: ['@vencore/plugin-sdk', '@vencore/plugin-types'], logLevel: 'silent',
          });
          savePluginFile(mf.id, 'server.cjs', fs.readFileSync(outfile));
        }
      }

      const clientBundlePath = path.join(tmpDir, 'client.js');
      if (fs.existsSync(clientBundlePath)) {
        savePluginFile(mf.id, 'client.js', fs.readFileSync(clientBundlePath));
      } else if (mf.build?.client) {
        const entryPath = path.join(tmpDir, mf.build.client);
        if (fs.existsSync(entryPath)) {
          const outfile = path.join(tmpDir, '_client_out.js');
          await esbuild.build({
            entryPoints: [entryPath], bundle: true, platform: 'browser', format: 'esm', outfile,
            plugins: [globalExternalsPlugin], logLevel: 'silent',
          });
          savePluginFile(mf.id, 'client.js', fs.readFileSync(outfile));
        }
      }

      savePluginFile(mf.id, 'plugin.json', Buffer.from(JSON.stringify(mf)));
      await runMigrations(db as Kysely<any>, mf.id, workspace.id, mf.tables);

      const isPaid = mp.pricing_type === 'paid';
      const plugin = await db
        .insertInto('workspace_plugins')
        .values({
          workspace_id: workspace.id,
          plugin_id: mf.id,
          name: mf.name,
          version: mf.version,
          manifest: mf as unknown as Record<string, unknown>,
          enabled: isPaid ? true : true,
          pricing_type: mp.pricing_type,
          license_key: isPaid ? (license_key ?? null) : null,
          source: 'marketplace',
          platform_plugin_id: mp.id,
        })
        .onConflict((oc) =>
          oc.constraint('workspace_plugins_workspace_plugin_unique').doUpdateSet({
            name: mf.name,
            version: mf.version,
            manifest: mf as unknown as Record<string, unknown>,
            enabled: true,
            pricing_type: mp.pricing_type,
            license_key: isPaid ? (license_key ?? null) : null,
            source: 'marketplace',
            platform_plugin_id: mp.id,
          })
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      await syncHookProvider(db, workspace.id, mf, true);
      loadPluginBackend(mf.id, workspace.id, db);
      return res.status(201).json({ data: plugin, error: null, warnings: versionCheck.warnings });
    } catch (err) {
      return next(err);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
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
        .where(/^[0-9a-f-]{36}$/i.test(req.params['id']!) ? 'id' : 'plugin_id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!plugin) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Plugin not found' } });
      }

      // Hub observability: per-contract record counts + last publish time
      const mf = plugin.manifest as unknown as import('@vencore/plugin-types').PluginManifest;
      let hubStats: Array<{ contract: string; record_count: number; last_published_at: string | null }> = [];
      if ((mf.provides ?? []).length > 0) {
        const rows = await db.selectFrom('plugin_hub_records')
          .select(['contract'])
          .select((eb) => eb.fn.count('id').as('record_count'))
          .select((eb) => eb.fn.max('updated_at').as('last_published_at'))
          .where('workspace_id', '=', workspace.id)
          .where('provider_plugin_id', '=', plugin.plugin_id)
          .groupBy('contract')
          .execute();
        const byContract = new Map(rows.map((r) => [r.contract, r]));
        hubStats = (mf.provides ?? []).map((p) => {
          const s = byContract.get(p.contract);
          return {
            contract: p.contract,
            record_count: s ? Number(s.record_count) : 0,
            last_published_at: s?.last_published_at
              ? new Date(s.last_published_at as unknown as string | Date).toISOString()
              : null,
          };
        });
      }

      return res.json({ data: { ...plugin, hub_stats: hubStats }, error: null });
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
      // The iframe fetches by plugin_id (slug), not the row UUID
      const plugin = await db.selectFrom('workspace_plugins').select(['plugin_id', 'enabled'])
        .where('plugin_id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!plugin || !plugin.enabled) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Plugin not found' } });
      }
      const storageDir = process.env['PLUGIN_STORAGE_DIR'] ?? path.join(process.cwd(), 'plugin-storage');
      const filePath = path.join(storageDir, plugin.plugin_id, 'client.js');
      if (!fs.existsSync(filePath)) {
        logger.warn({ pluginId: plugin.plugin_id, filePath }, 'client.js not found on disk');
        return res.status(404).json({ data: null, error: { code: 'NO_CLIENT', message: 'No client bundle for this plugin' } });
      }
      const content = fs.readFileSync(filePath, 'utf8');
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(content);
    } catch (err) {
      logger.error({ err }, 'Error serving plugin client.js');
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
        .where(/^[0-9a-f-]{36}$/i.test(req.params['id']!) ? 'id' : 'plugin_id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!plugin) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Plugin not found' } });
      }

      const manifest = plugin.manifest as unknown as import('@vencore/plugin-types').PluginManifest;
      const schema = manifest.settings_schema ?? [];
      const secretKeys = new Set(schema.filter((f) => f.secret).map((f) => f.key));

      const rows = await (db as any).selectFrom('plugin_settings')
        .select(['key', 'value', 'encrypted'])
        .where('workspace_id', '=', workspace.id)
        .where('plugin_id', '=', plugin.plugin_id)
        .execute() as Array<{ key: string; value: unknown; encrypted: boolean }>;

      const settings: Record<string, unknown> = {};
      for (const row of rows) {
        if (secretKeys.has(row.key)) {
          // Never expose secret values in GET — return a placeholder
          settings[row.key] = row.encrypted ? '__encrypted__' : '••••••••';
        } else {
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
        .where(/^[0-9a-f-]{36}$/i.test(req.params['id']!) ? 'id' : 'plugin_id', '=', req.params['id']!)
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
        const isSecret = secretKeys.has(key);
        let storedValue: unknown = value;
        let encrypted = false;
        if (isSecret && typeof value === 'string' && process.env['PLUGIN_SETTINGS_KEY']) {
          storedValue = encryptSettingValue(value as string);
          encrypted = true;
        }
        // The value column is jsonb — JSON-encode scalars too (a bare string like
        // "groq" is not valid JSON to Postgres). Cast explicitly to jsonb.
        const jsonbValue = sql`${JSON.stringify(storedValue)}::jsonb`;
        await (db as any).insertInto('plugin_settings')
          .values({
            workspace_id: workspace.id,
            plugin_id: plugin.plugin_id,
            key,
            value: jsonbValue,
            encrypted,
          })
          .onConflict((oc: any) =>
            oc.columns(['workspace_id', 'plugin_id', 'key']).doUpdateSet({ value: jsonbValue, encrypted, updated_at: new Date() })
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

      const hubError = validateHubDeclarations(mf);
      if (hubError) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_MANIFEST', message: hubError } });
      }

      const versionCheck = await checkVersionRules(db, workspace.id, mf);
      if (versionCheck.error) {
        return res.status(409).json({ data: null, error: versionCheck.error });
      }

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

      // Run table migrations (DDL generated from typed schema — no raw SQL)
      await runMigrations(db as Kysely<any>, mf.id, workspace.id, mf.tables);

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

      await syncHookProvider(db, workspace.id, mf, true);

      // Load backend bundle
      loadPluginBackend(mf.id, workspace.id, db);

      return res.status(201).json({ data: plugin, error: null, warnings: versionCheck.warnings });
    } catch (err) {
      return next(err);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  /**
   * PATCH /api/plugins/:id
   * Toggle a plugin enabled/disabled.
   * Paid marketplace plugins: enabling requires license_key (validated with platform).
   * Disabling releases the license key back to the pool.
   */
  router.patch('/:id', requireAdmin, async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { enabled, license_key } = z.object({
        enabled: z.boolean(),
        license_key: z.string().optional(),
      }).parse(req.body);

      const existing = await db
        .selectFrom('workspace_plugins')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();

      if (!existing) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Plugin not found' } });
      }

      const marketplaceUrl = process.env['MARKETPLACE_API_URL'] ?? '';

      if (enabled && existing.pricing_type === 'paid') {
        const key = license_key ?? existing.license_key;
        if (!key) {
          return res.status(402).json({ data: null, error: { code: 'LICENSE_REQUIRED', message: 'License key required to enable this plugin' } });
        }
        if (marketplaceUrl && existing.platform_plugin_id) {
          const svcTok = process.env['MARKETPLACE_SERVICE_TOKEN'] ?? '';
          const licRes = await fetch(`${marketplaceUrl}/v1/licenses/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-service-token': svcTok },
            body: JSON.stringify({ plugin_id: existing.platform_plugin_id, workspace_id: workspace.id, key }),
          });
          const licJson = await (licRes.json() as Promise<{ data: { valid: boolean } | null; error: { code: string; message: string } | null }>);
          if (licJson.error) {
            return res.status(licRes.status).json({ data: null, error: licJson.error });
          }
        }
        const plugin = await db
          .updateTable('workspace_plugins')
          .set({ enabled: true, license_key: key })
          .where('id', '=', req.params['id']!)
          .where('workspace_id', '=', workspace.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return res.json({ data: plugin, error: null });
      }

      if (!enabled && existing.pricing_type === 'paid' && existing.license_key && existing.platform_plugin_id && marketplaceUrl) {
        const svcTok = process.env['MARKETPLACE_SERVICE_TOKEN'] ?? '';
        await fetch(`${marketplaceUrl}/v1/licenses/deactivate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-service-token': svcTok },
          body: JSON.stringify({ plugin_id: existing.platform_plugin_id, workspace_id: workspace.id, key: existing.license_key }),
        }).catch(() => { /* non-fatal — key stays in DB, platform may already be deactivated */ });
      }

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

      const mfDecl = plugin.manifest as unknown as import('@vencore/plugin-types').PluginManifest;
      const provides = (mfDecl.provides ?? []).map((pr) => ({ contract: pr.contract }));

      if (!enabled) {
        invalidatePlugin(plugin.plugin_id, workspace.id);
        // Disabled providers must not serve stale data to consumers
        await removeProviderHubData(db as Kysely<any>, workspace.id, plugin.plugin_id);
        await syncHookProvider(db, workspace.id, { id: plugin.plugin_id, name: plugin.name, provides }, false);
      } else {
        await syncHookProvider(db, workspace.id, { id: plugin.plugin_id, name: plugin.name, provides }, true);
        loadPluginBackend(plugin.plugin_id, workspace.id, db);
      }

      return res.json({ data: plugin, error: null });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * DELETE /api/plugins/:id
   * Removes a plugin from the workspace and cleans up all associated data.
   */
  router.delete('/:id', requireAdmin, async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const existing = await db
        .selectFrom('workspace_plugins')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();

      if (!existing) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Plugin not found' } });
      }

      const pluginId = existing.plugin_id;
      const manifest = existing.manifest as unknown as import('@vencore/plugin-types').PluginManifest;

      // Drop plugin-owned tables marked for cleanup
      if (manifest?.tables && manifest.tables.length > 0) {
        await dropPluginTables(db as Kysely<any>, pluginId, workspace.id, manifest.tables).catch((err) => {
          logger.warn({ err, pluginId }, 'Failed to drop plugin tables during uninstall');
        });
      }

      // Clean up all plugin data for this workspace
      await Promise.allSettled([
        (db as any).deleteFrom('plugin_storage')
          .where('workspace_id', '=', workspace.id)
          .where('key', 'like', `${pluginId}:%`)
          .execute(),
        (db as any).deleteFrom('plugin_settings')
          .where('workspace_id', '=', workspace.id)
          .where('plugin_id', '=', pluginId)
          .execute(),
        (db as any).deleteFrom('plugin_cron_jobs')
          .where('workspace_id', '=', workspace.id)
          .where('plugin_id', '=', pluginId)
          .execute(),
        (db as any).deleteFrom('plugin_notifications')
          .where('workspace_id', '=', workspace.id)
          .where('plugin_id', '=', pluginId)
          .execute(),
        (db as any).deleteFrom('plugin_files')
          .where('workspace_id', '=', workspace.id)
          .where('plugin_id', '=', pluginId)
          .execute(),
      ]);

      // Remove published hub data + hook provider registration
      await removeProviderHubData(db as Kysely<any>, workspace.id, pluginId).catch((err) => {
        logger.warn({ err, pluginId }, 'Failed to remove hub data during uninstall');
      });
      const removedProvider = await db
        .deleteFrom('hook_providers')
        .where('workspace_id', '=', workspace.id)
        .where('provider_id', '=', pluginId)
        .returningAll()
        .executeTakeFirst();
      if (removedProvider) {
        // ON DELETE SET NULL cleared provider_id on configs — disable them too
        await db
          .updateTable('workspace_hook_configs')
          .set({ enabled: false, updated_at: new Date() })
          .where('workspace_id', '=', workspace.id)
          .where('provider_id', 'is', null)
          .where('enabled', '=', true)
          .execute();
      }

      await db
        .deleteFrom('workspace_plugins')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .execute();

      invalidatePlugin(pluginId, workspace.id);

      return res.json({ data: { ok: true }, error: null });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
