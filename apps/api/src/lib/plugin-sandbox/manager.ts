/**
 * Plugin sandbox manager.
 * Spawns one child process per (pluginId, workspaceId) pair.
 * All bridge calls route through IPC to the parent, which executes them with full auth context.
 */
import { fork, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { PluginPermission, PluginManifest } from '@vencore/plugin-types';
import { dispatchBridgeCall, pluginEventBus } from '@vencore/plugin-runtime';
import { logger } from '../logger';

// Resolve runner script path — works for both tsx (dev) and compiled (prod)
function getRunnerPath(): string {
  // Production: compiled to dist/
  const distRunner = path.join(__dirname, 'runner.js');
  if (fs.existsSync(distRunner)) return distRunner;
  // Development: use source directly with tsx (must be in PATH or resolved via require)
  return path.join(__dirname, 'runner.ts');
}

function isUsingTsx(): boolean {
  return process.execArgv.some((a) => a.includes('tsx')) ||
    !fs.existsSync(path.join(__dirname, 'runner.js'));
}

interface ChildProcessSandboxEntry {
  inProcess?: false;
  child: ChildProcess;
  router: Router | null;
  pendingHttpRequests: Map<string, { resolve: (r: unknown) => void; reject: (e: unknown) => void }>;
  pluginId: string;
  workspaceId: string;
  busSubscriptions: Array<{ event: string; handler: (payload: unknown) => void | Promise<void> }>;
}

interface InProcessSandboxEntry {
  inProcess: true;
  router: Router;
  pluginId: string;
  workspaceId: string;
  busSubscriptions: Array<{ event: string; handler: (payload: unknown) => void }>;
  busHandlers: Map<string, Array<(payload: unknown) => void | Promise<void>>>;
}

type SandboxEntry = ChildProcessSandboxEntry | InProcessSandboxEntry;

let httpRequestIdCounter = 0;
const sandboxes = new Map<string, SandboxEntry>();
const routerCache = new Map<string, Router>();

function sandboxKey(pluginId: string, workspaceId: string): string {
  return `${pluginId}:${workspaceId}`;
}

function unsubscribeBus(entry: SandboxEntry): void {
  const bus = pluginEventBus.forWorkspace(entry.workspaceId);
  for (const sub of entry.busSubscriptions) {
    bus.off(sub.event, sub.handler as any);
  }
  entry.busSubscriptions = [];
}

/**
 * Spawns an in-process sandbox fallback when child process fork is blocked or fails.
 */
function spawnInProcessSandbox(
  pluginId: string,
  workspaceId: string,
  bundlePath: string,
  dataAccess: readonly PluginPermission[],
  tables: string[],
  db: Kysely<Database>,
  listens: readonly string[] = [],
  manifest?: PluginManifest,
): void {
  const key = sandboxKey(pluginId, workspaceId);
  const router = Router({ mergeParams: true });
  const busHandlers = new Map<string, Array<(payload: unknown) => void | Promise<void>>>();
  const busSubscriptions: Array<{ event: string; handler: (payload: unknown) => void }> = [];

  const entry: InProcessSandboxEntry = {
    inProcess: true,
    router,
    pluginId,
    workspaceId,
    busSubscriptions,
    busHandlers,
  };

  sandboxes.set(key, entry);
  routerCache.set(key, router);

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(path.resolve(bundlePath)) as {
      default?: { setup(vencore: unknown): void | Promise<void> };
    };

    if (!mod.default?.setup) {
      logger.error({ pluginId, workspaceId }, 'In-process plugin setup failed: default.setup not found');
      return;
    }

    const bridge = async (method: string, payload: unknown): Promise<unknown> => {
      const result = await dispatchBridgeCall(
        db as Kysely<any>,
        { workspaceId, pluginSlug: pluginId, dataAccess, tables, manifest },
        { method, payload: payload as any },
      );
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    };

    const vencore = {
      storage: {
        get: (k: string) => bridge('storage.get', { key: k }),
        set: (k: string, value: unknown) => bridge('storage.set', { key: k, value }),
        delete: (k: string) => bridge('storage.delete', { key: k }),
      },
      settings: {
        get: (k: string) => bridge('settings.get', { key: k }),
        set: (k: string, value: unknown) => bridge('settings.set', { key: k, value }),
      },
      http: {
        fetch: (url: string, opts?: unknown) => bridge('http.fetch', { url, ...(opts as object ?? {}) }),
        onEndpoint: (endpointPath: string, handler: (req: unknown) => Promise<unknown>) => {
          router.all(endpointPath, async (req, res) => {
            try {
              const result: any = await handler({
                method: req.method,
                path: req.path,
                query: req.query as Record<string, string>,
                headers: req.headers as Record<string, string>,
                body: req.body != null ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : null,
                params: req.params as Record<string, string>,
              });

              const status = result?.status ?? 200;
              const headers = result?.headers ?? {};
              for (const [k, v] of Object.entries(headers)) res.setHeader(k, v as string);
              res.status(status);
              if (typeof result?.body === 'string') res.send(result.body);
              else if (result?.body != null) res.json(result.body);
              else res.end();
            } catch (err) {
              logger.error({ err, pluginId, workspaceId }, 'In-process plugin HTTP endpoint error');
              res.status(500).json({ data: null, error: { code: 'PLUGIN_ERROR', message: 'Internal plugin error' } });
            }
          });
        },
      },
      table: (name: string) => ({
        list: (opts?: unknown) => bridge('table.list', { name, ...(opts as object ?? {}) }),
        get: (id: string) => bridge('table.get', { name, id }),
        insert: (data: unknown) => bridge('table.insert', { name, data }),
        update: (id: string, data: unknown) => bridge('table.update', { name, id, data }),
        delete: (id: string) => bridge('table.delete', { name, id }),
        upsert: (data: unknown, opts: unknown) => bridge('table.upsert', { name, data, ...(opts as object) }),
        count: (where?: unknown) => bridge('table.count', { name, where }),
      }),
      list: (resource: string, filter?: unknown) => bridge(`${resource}.list`, { filter }),
      get: (resource: string, id: string) => bridge(`${resource}.get`, { id }),
      create: (resource: string, data: unknown) => bridge(`${resource}.create`, { data }),
      update: (resource: string, id: string, data: unknown) => bridge(`${resource}.update`, { id, data }),
      delete: (resource: string, id: string) => bridge(`${resource}.delete`, { id }),
      action: (resource: string, action: string, payload?: unknown) => bridge(`${resource}.${action}`, { payload }),
      user: { get: () => bridge('user.get', {}) },
      workspace: { get: () => bridge('workspace.get', {}) },
      notify: (opts: unknown) => bridge('notify', opts),
      files: {
        upload: (buffer: Uint8Array, opts: unknown) => bridge('files.upload', { buffer: Buffer.from(buffer).toString('base64'), ...(opts as object) }),
        getUrl: (fileId: string) => bridge('files.getUrl', { fileId }),
        delete: (fileId: string) => bridge('files.delete', { fileId }),
      },
      cron: {
        register: (schedule: string, name: string, handler: () => void | Promise<void>) => {
          bridge('cron.register', { schedule, name }).catch(() => {});
          busHandlers.set(`cron:${name}`, [handler]);
        },
      },
      permissions: {
        check: (userId: string, permissionKey: string) => bridge('permissions.check', { userId, permissionKey }),
      },
      context: {
        get: () => bridge('context.get', {}),
      },
      bus: {
        on: (event: string, handler: (payload: unknown) => void | Promise<void>) => {
          const arr = busHandlers.get(event) ?? [];
          arr.push(handler);
          busHandlers.set(event, arr);
        },
        emit: (event: string, payload: unknown) => bridge('bus.emit', { event, payload }),
      },
    };

    Promise.resolve(mod.default.setup(vencore)).catch((err) => {
      logger.error({ err, pluginId, workspaceId }, 'In-process plugin setup promise rejected');
    });

    const parentBus = pluginEventBus.forWorkspace(workspaceId);
    for (const event of new Set(listens)) {
      const handler = (payload: unknown): void => {
        const arr = busHandlers.get(event) ?? [];
        for (const h of arr) {
          Promise.resolve(h(payload)).catch((err) => {
            logger.error({ err, pluginId, workspaceId, event }, 'In-process plugin event handler failed');
          });
        }
      };
      parentBus.on(event, handler);
      busSubscriptions.push({ event, handler });
    }

    logger.info({ pluginId, workspaceId }, 'In-process plugin sandbox loaded successfully');
  } catch (err) {
    logger.error({ err, pluginId, workspaceId }, 'In-process plugin sandbox require failed');
  }
}

export function spawnPluginSandbox(
  pluginId: string,
  workspaceId: string,
  bundlePath: string,
  dataAccess: readonly PluginPermission[],
  tables: string[],
  db: Kysely<Database>,
  listens: readonly string[] = [],
  manifest?: PluginManifest,
): void {
  const key = sandboxKey(pluginId, workspaceId);

  // Kill existing sandbox for this plugin+workspace
  const existing = sandboxes.get(key);
  if (existing) {
    unsubscribeBus(existing);
    if (!existing.inProcess) {
      existing.child.kill('SIGTERM');
    }
    sandboxes.delete(key);
    routerCache.delete(key);
  }

  const runnerPath = getRunnerPath();
  const execArgs: string[] = isUsingTsx()
    ? ['--import', 'tsx']
    : [];

  let child: ChildProcess;
  try {
    child = fork(runnerPath, [], {
      execArgv: execArgs,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        NODE_ENV: process.env['NODE_ENV'] ?? 'production',
      },
    });
  } catch (err) {
    logger.warn({ pluginId, workspaceId, error: err instanceof Error ? err.message : String(err) }, 'Failed to spawn plugin sandbox child process. Falling back to in-process execution.');
    spawnInProcessSandbox(pluginId, workspaceId, bundlePath, dataAccess, tables, db, listens, manifest);
    return;
  }

  const entry: ChildProcessSandboxEntry = {
    child,
    router: null,
    pendingHttpRequests: new Map(),
    pluginId,
    workspaceId,
    busSubscriptions: [],
  };
  sandboxes.set(key, entry);

  // Build router for HTTP endpoint calls (populated after setup_done)
  const router = Router({ mergeParams: true });

  child.on('message', async (msg: Record<string, unknown>) => {
    switch (msg['type']) {
      case 'ready': {
        child.send({
          type: 'setup',
          bundlePath,
          pluginId,
          workspaceId,
          dataAccess: [...dataAccess],
          tables,
        });
        break;
      }

      case 'setup_done': {
        entry.router = router;
        routerCache.set(key, router);

        const bus = pluginEventBus.forWorkspace(workspaceId);
        for (const event of new Set(listens)) {
          const handler = (payload: unknown): void => {
            if (child.connected) {
              child.send({ type: 'bus_event', event, payload });
            }
          };
          bus.on(event, handler);
          entry.busSubscriptions.push({ event, handler });
        }

        logger.info({ pluginId, workspaceId, listens: [...new Set(listens)] }, 'Plugin sandbox setup complete');
        break;
      }

      case 'setup_error': {
        logger.warn({ pluginId, workspaceId, message: msg['message'] }, 'Plugin sandbox setup failed');
        unsubscribeBus(entry);
        child.kill('SIGTERM');
        sandboxes.delete(key);
        break;
      }

      case 'bridge_call': {
        const { id, method, payload } = msg as { id: string; method: string; payload: unknown };
        try {
          const result = await dispatchBridgeCall(
            db as Kysely<any>,
            { workspaceId, pluginSlug: pluginId, dataAccess, tables, manifest },
            { method, payload: payload as any },
          );
          child.send({ type: 'bridge_response', id, result });
        } catch (err) {
          const errResult = {
            data: null,
            error: { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) },
          };
          child.send({ type: 'bridge_response', id, result: errResult });
        }
        break;
      }

      case 'http_handler_registered': {
        const endpointPath = msg['path'] as string;
        router.all(endpointPath, async (req, res) => {
          const reqId = String(++httpRequestIdCounter);
          const pluginReq = {
            method: req.method,
            path: req.path,
            query: req.query as Record<string, string>,
            headers: req.headers as Record<string, string>,
            body: req.body != null ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : null,
            params: req.params as Record<string, string>,
          };

          try {
            const result = await new Promise<any>((resolve, reject) => {
              entry.pendingHttpRequests.set(reqId, { resolve, reject });
              child.send({ type: 'http_request', id: reqId, req: pluginReq });
              setTimeout(() => {
                if (entry.pendingHttpRequests.has(reqId)) {
                  entry.pendingHttpRequests.delete(reqId);
                  reject({ code: 'TIMEOUT', message: 'Plugin HTTP handler timed out' });
                }
              }, 30_000);
            });

            const status = result?.status ?? 200;
            const headers = result?.headers ?? {};
            for (const [k, v] of Object.entries(headers)) res.setHeader(k, v as string);
            res.status(status);
            if (typeof result?.body === 'string') res.send(result.body);
            else if (result?.body != null) res.json(result.body);
            else res.end();
          } catch (err) {
            logger.error({ err, pluginId, workspaceId }, 'Plugin HTTP endpoint error');
            res.status(500).json({ data: null, error: { code: 'PLUGIN_ERROR', message: 'Internal plugin error' } });
          }
        });
        break;
      }

      case 'http_response': {
        const { id, res: pluginRes } = msg as { id: string; res: unknown };
        const pending = entry.pendingHttpRequests.get(id);
        if (pending) {
          entry.pendingHttpRequests.delete(id);
          pending.resolve(pluginRes);
        }
        break;
      }

      case 'log': {
        const level = msg['level'] as 'info' | 'warn' | 'error';
        logger[level]({ pluginId, workspaceId, sandboxLog: msg['data'] }, 'Plugin sandbox log');
        break;
      }

      default:
        break;
    }
  });

  child.on('error', (err) => {
    logger.error({ err, pluginId, workspaceId }, 'Plugin sandbox process error');
  });

  child.on('exit', (code, signal) => {
    logger.warn({ pluginId, workspaceId, code, signal }, 'Plugin sandbox process exited');
    unsubscribeBus(entry);
    sandboxes.delete(key);
    routerCache.delete(key);
    if (signal !== 'SIGTERM' && code !== 0) {
      logger.info({ pluginId, workspaceId }, 'Restarting plugin sandbox after crash');
      setTimeout(() => {
        if (fs.existsSync(bundlePath)) {
          spawnPluginSandbox(pluginId, workspaceId, bundlePath, dataAccess, tables, db, listens, manifest);
        }
      }, 5_000);
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    logger.warn({ pluginId, workspaceId }, `Plugin stderr: ${chunk.toString().trim()}`);
  });
}

export function getSandboxRouter(pluginId: string, workspaceId: string): Router | null {
  return routerCache.get(sandboxKey(pluginId, workspaceId)) ?? null;
}

export function sendBusEventToSandbox(
  pluginId: string,
  workspaceId: string,
  event: string,
  payload: unknown,
): boolean {
  const entry = sandboxes.get(sandboxKey(pluginId, workspaceId));
  if (!entry) return false;
  if (entry.inProcess) {
    const handlers = entry.busHandlers.get(event) ?? [];
    for (const h of handlers) {
      Promise.resolve(h(payload)).catch((err) => {
        logger.error({ err, pluginId, workspaceId, event }, 'In-process plugin cron event execution failed');
      });
    }
    return true;
  }
  if (!entry.child.connected) return false;
  entry.child.send({ type: 'bus_event', event, payload });
  return true;
}

export function isSandboxRunning(pluginId: string, workspaceId: string): boolean {
  const entry = sandboxes.get(sandboxKey(pluginId, workspaceId));
  if (!entry) return false;
  return entry.inProcess ? true : Boolean(entry.child.connected);
}

export function killSandbox(pluginId: string, workspaceId: string): void {
  const key = sandboxKey(pluginId, workspaceId);
  const entry = sandboxes.get(key);
  if (entry) {
    unsubscribeBus(entry);
    if (!entry.inProcess) {
      entry.child.kill('SIGTERM');
    }
    sandboxes.delete(key);
    routerCache.delete(key);
  }
}

export function killAllSandboxes(): void {
  for (const [, entry] of sandboxes) {
    unsubscribeBus(entry);
    if (!entry.inProcess) {
      entry.child.kill('SIGTERM');
    }
  }
  sandboxes.clear();
  routerCache.clear();
}
