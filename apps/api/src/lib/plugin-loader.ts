import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { PluginManifest, PluginPermission } from '@vencore/plugin-types';
import { dispatchBridgeCall, pluginEventBus } from '@vencore/plugin-runtime';
import { logger } from './logger';

export function pluginStorageDir(): string {
  return process.env['PLUGIN_STORAGE_DIR'] ?? path.join(process.cwd(), 'plugin-storage');
}

export function pluginBundlePath(pluginId: string, file: string): string {
  return path.join(pluginStorageDir(), pluginId, file);
}

export function savePluginFile(pluginId: string, filename: string, data: Buffer): void {
  const dir = path.join(pluginStorageDir(), pluginId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), data);
}

export function loadPluginManifest(pluginId: string): PluginManifest | null {
  const p = pluginBundlePath(pluginId, 'plugin.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as PluginManifest;
  } catch {
    return null;
  }
}

interface PluginBackendDef {
  setup(vencore: any): void | Promise<void>;
}

const pluginInstances = new Map<string, any>();
const routerCache = new Map<string, Router>();

export function loadPluginBackend(pluginId: string, db: Kysely<Database>): void {
  const bundlePath = pluginBundlePath(pluginId, 'server.cjs');
  if (!fs.existsSync(bundlePath)) return;

  try {
    delete require.cache[require.resolve(bundlePath)];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(bundlePath) as {
      default?: PluginBackendDef;
      createRouter?: (db: Kysely<Database>) => Router;
    };

    const manifest = loadPluginManifest(pluginId);
    const dataAccess = (manifest?.data_access ?? []) as PluginPermission[];
    const tables = (manifest?.tables ?? []).map((t) => t.name);

    if (mod.default?.setup) {
      const bridge = async (call: { method: string; payload: unknown }) =>
        dispatchBridgeCall(db as Kysely<any>, {
          workspaceId: '__setup__',
          pluginSlug: pluginId,
          dataAccess,
          tables,
        }, call);

      type HttpEntry = { path: string; handler: (req: unknown) => Promise<unknown> | unknown };

      const vencore = {
        _hookHandlers: new Map<string, Array<(p: unknown) => void>>(),
        _httpHandlers: [] as HttpEntry[],
        on(event: string, handler: (p: unknown) => void) {
          const arr = this._hookHandlers.get(event) ?? [];
          arr.push(handler);
          this._hookHandlers.set(event, arr);
        },
        bus: {
          on(event: string, handler: (p: unknown) => void) {
            vencore._hookHandlers.set(`bus:${event}`, [
              ...(vencore._hookHandlers.get(`bus:${event}`) ?? []),
              handler,
            ]);
          },
          emit: async (event: string, payload: unknown) =>
            bridge({ method: 'bus.emit', payload: { event, payload } }),
        },
        storage: {
          get: (key: string) => bridge({ method: 'storage.get', payload: { key } }),
          set: (key: string, value: unknown) => bridge({ method: 'storage.set', payload: { key, value } }),
          delete: (key: string) => bridge({ method: 'storage.delete', payload: { key } }),
        },
        settings: {
          get: (key: string) => bridge({ method: 'settings.get', payload: { key } }),
          set: (key: string, value: unknown) => bridge({ method: 'settings.set', payload: { key, value } }),
        },
        http: {
          fetch: (url: string, opts?: unknown) => bridge({ method: 'http.fetch', payload: { url, ...((opts ?? {}) as object) } }),
          onEndpoint: (endpointPath: string, handler: (req: unknown) => Promise<unknown> | unknown) => {
            vencore._httpHandlers.push({ path: endpointPath, handler });
          },
        },
        table: (name: string) => ({
          list: (opts?: unknown) => bridge({ method: 'table.list', payload: { name, ...(opts ?? {}) } }),
          get: (id: string) => bridge({ method: 'table.get', payload: { name, id } }),
          insert: (data: unknown) => bridge({ method: 'table.insert', payload: { name, data } }),
          update: (id: string, data: unknown) => bridge({ method: 'table.update', payload: { name, id, data } }),
          delete: (id: string) => bridge({ method: 'table.delete', payload: { name, id } }),
          upsert: (data: unknown, opts: unknown) => bridge({ method: 'table.upsert', payload: { name, data, ...(opts as object) } }),
          count: (where?: unknown) => bridge({ method: 'table.count', payload: { name, where } }),
        }),
        list: (resource: string, filter?: unknown) => bridge({ method: `${resource}.list`, payload: { filter } }),
        get: (resource: string, id: string) => bridge({ method: `${resource}.get`, payload: { id } }),
        create: (resource: string, data: unknown) => bridge({ method: `${resource}.create`, payload: { data } }),
        update: (resource: string, id: string, data: unknown) => bridge({ method: `${resource}.update`, payload: { id, data } }),
        delete: (resource: string, id: string) => bridge({ method: `${resource}.delete`, payload: { id } }),
        action: (resource: string, action: string, payload?: unknown) => bridge({ method: `${resource}.${action}`, payload: { payload } }),
        user: { get: () => bridge({ method: 'user.get', payload: {} }) },
        workspace: { get: () => bridge({ method: 'workspace.get', payload: {} }) },
        notify: (opts: unknown) => bridge({ method: 'notify', payload: opts }),
        files: {
          upload: (buffer: Uint8Array, opts: unknown) => bridge({ method: 'files.upload', payload: { buffer: Buffer.from(buffer).toString('base64'), ...(opts as object) } }),
          getUrl: (fileId: string) => bridge({ method: 'files.getUrl', payload: { fileId } }),
          delete: (fileId: string) => bridge({ method: 'files.delete', payload: { fileId } }),
        },
        cron: {
          register: (schedule: string, name: string, _handler: () => void) => {
            logger.info({ pluginId, schedule, name }, 'Plugin cron job registered (stored for worker)');
          },
        },
        permissions: {
          check: (userId: string, permissionKey: string) =>
            bridge({ method: 'permissions.check', payload: { userId, permissionKey } }),
        },
        safe: {} as any,
      };

      void Promise.resolve(mod.default.setup(vencore)).then(() => {
        pluginInstances.set(pluginId, vencore);

        for (const [key, handlers] of vencore._hookHandlers) {
          if (key.startsWith('bus:')) {
            const event = key.slice(4);
            for (const handler of handlers) {
              pluginEventBus.forWorkspace('*').on(event, handler);
            }
          }
        }

        if (vencore._httpHandlers.length > 0) {
          const router = Router({ mergeParams: true });
          for (const entry of vencore._httpHandlers) {
            router.all(entry.path, async (req, res) => {
              try {
                const pluginReq = {
                  method: req.method,
                  path: req.path,
                  query: req.query as Record<string, string>,
                  headers: req.headers as Record<string, string>,
                  body: req.body != null ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : null,
                  params: req.params as Record<string, string>,
                };
                const pluginRes = (await Promise.resolve(entry.handler(pluginReq))) as {
                  status?: number;
                  headers?: Record<string, string>;
                  body?: string | Record<string, unknown>;
                };
                const status = pluginRes?.status ?? 200;
                const headers = pluginRes?.headers ?? {};
                for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
                res.status(status);
                if (typeof pluginRes?.body === 'string') {
                  res.send(pluginRes.body);
                } else if (pluginRes?.body != null) {
                  res.json(pluginRes.body);
                } else {
                  res.end();
                }
              } catch (err) {
                logger.error({ err, pluginId }, 'Plugin HTTP endpoint error');
                res.status(500).json({ data: null, error: { code: 'PLUGIN_ERROR', message: 'Internal plugin error' } });
              }
            });
          }
          routerCache.set(pluginId, router);
          logger.info({ pluginId, count: vencore._httpHandlers.length }, 'Plugin HTTP endpoints registered');
        }

        logger.info({ pluginId }, 'Plugin backend setup complete');
      });
    }

    if (typeof mod.createRouter === 'function') {
      const router = mod.createRouter(db);
      routerCache.set(pluginId, router);
    }

    logger.info({ pluginId }, 'Plugin bundle loaded');
  } catch (err) {
    logger.warn({ err, pluginId }, 'Failed to load plugin bundle');
  }
}

export function getPluginRouter(pluginId: string): Router | null {
  return routerCache.get(pluginId) ?? null;
}

export function invalidatePlugin(pluginId: string): void {
  routerCache.delete(pluginId);
  pluginInstances.delete(pluginId);
}
