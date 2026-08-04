/**
 * In-process plugin sandbox strategy.
 *
 * Runs the plugin bundle inside the API process instead of a forked child.
 * Used where the host restricts child-process creation (see GH #93): the
 * dispatcher (manager.ts) selects this when PLUGIN_SANDBOX_MODE=in-process or
 * when `auto` mode detects that fork is unavailable.
 *
 * Trade-off: this removes OS process isolation — plugin code shares the API
 * process. The facade still never hands env/secrets to the plugin, but plugin
 * code can read process globals directly. `auto` mode keeps the isolated child
 * process wherever forking is allowed, so this path is only taken when forced.
 *
 * All data-access calls go straight to dispatchBridgeCall (no IPC). Bus/cron/
 * hook subscriptions register into a local map; declared `listens` topics are
 * subscribed on the workspace event bus and forwarded into that map — mirroring
 * how the parent forwards events to a child process.
 */
import path from 'path';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { PluginPermission } from '@vencore/plugin-types';
import { dispatchBridgeCall, pluginEventBus } from '@vencore/plugin-runtime';
import { logger } from '../logger';
import { buildVencoreFacade, type FacadeTransport, type PluginBusHandler, type PluginHttpHandler } from './facade';
import { sandboxKey, type SandboxSpawnInput, type SandboxStrategy } from './types';

interface InProcessEntry {
  router: Router | null;
  ready: boolean;
  httpHandlers: Map<string, PluginHttpHandler>;
  busHandlers: Map<string, PluginBusHandler[]>;
  busSubscriptions: Array<{ event: string; handler: (payload: unknown) => void | Promise<void> }>;
  pluginId: string;
  workspaceId: string;
}

const sandboxes = new Map<string, InProcessEntry>();

function unsubscribeBus(entry: InProcessEntry): void {
  const bus = pluginEventBus.forWorkspace(entry.workspaceId);
  for (const sub of entry.busSubscriptions) {
    bus.off(sub.event, sub.handler);
  }
  entry.busSubscriptions = [];
}

function teardown(key: string): void {
  const entry = sandboxes.get(key);
  if (!entry) return;
  unsubscribeBus(entry);
  sandboxes.delete(key);
}

/** Invoke every locally-registered handler for an event. */
async function dispatchBusEvent(entry: InProcessEntry, event: string, payload: unknown): Promise<void> {
  const handlers = entry.busHandlers.get(event) ?? [];
  await Promise.allSettled(handlers.map((h) => Promise.resolve(h(payload))));
}

function mountHttpRoute(
  router: Router,
  endpointPath: string,
  handler: PluginHttpHandler,
  pluginId: string,
  workspaceId: string,
): void {
  router.all(endpointPath, async (req, res) => {
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
        const timer = setTimeout(() => reject({ code: 'TIMEOUT', message: 'Plugin HTTP handler timed out' }), 30_000);
        Promise.resolve(handler(pluginReq)).then(
          (r) => { clearTimeout(timer); resolve(r); },
          (e) => { clearTimeout(timer); reject(e); },
        );
      });

      const status = result?.status ?? 200;
      const headers = result?.headers ?? {};
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v as string);
      res.status(status);
      if (typeof result?.body === 'string') res.send(result.body);
      else if (result?.body != null) res.json(result.body);
      else res.end();
    } catch (err) {
      logger.error({ err, pluginId, workspaceId }, 'Plugin HTTP endpoint error (in-process)');
      res.status(500).json({ data: null, error: { code: 'PLUGIN_ERROR', message: 'Internal plugin error' } });
    }
  });
}

function spawn(input: SandboxSpawnInput): void {
  const { pluginId, workspaceId, bundlePath, dataAccess, tables, db, listens, manifest } = input;
  const key = sandboxKey(pluginId, workspaceId);

  // Replace any existing in-process sandbox for this plugin+workspace.
  teardown(key);

  const router = Router({ mergeParams: true });
  const entry: InProcessEntry = {
    router: null,
    ready: false,
    httpHandlers: new Map(),
    busHandlers: new Map(),
    busSubscriptions: [],
    pluginId,
    workspaceId,
  };
  sandboxes.set(key, entry);

  const ctx = {
    workspaceId,
    pluginSlug: pluginId,
    dataAccess: dataAccess as readonly PluginPermission[],
    tables,
    manifest,
  };

  // Direct transport: data calls hit dispatchBridgeCall and unwrap the envelope
  // to match the SDK contract (reject on error, resolve the data payload).
  const transport: FacadeTransport = {
    bridge: async (method, payload) => {
      const result = await dispatchBridgeCall(db as Kysely<any>, ctx, { method, payload: payload as any });
      if (result.error) throw result.error;
      return result.data;
    },
    registerHttp: (endpointPath, handler) => {
      entry.httpHandlers.set(endpointPath, handler);
      mountHttpRoute(router, endpointPath, handler, pluginId, workspaceId);
    },
    registerBus: (event, handler) => {
      const arr = entry.busHandlers.get(event) ?? [];
      arr.push(handler);
      entry.busHandlers.set(event, arr);
    },
    persistCron: (schedule, name) => {
      dispatchBridgeCall(db as Kysely<any>, ctx, { method: 'cron.register', payload: { schedule, name } as any }).catch(() => {});
    },
  };

  // Load and set the plugin up asynchronously; spawn() itself is fire-and-forget
  // to match the child-process strategy (the router becomes available once setup
  // completes, exactly like the child's setup_done).
  void (async () => {
    try {
      // Bust the require cache so re-enable / upgrade picks up new bundle code.
      const resolved = require.resolve(path.resolve(bundlePath));
      delete require.cache[resolved];
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(resolved) as { default?: { setup(vencore: unknown): void | Promise<void> } };

      if (!mod.default?.setup) {
        logger.warn({ pluginId, workspaceId }, 'Plugin has no default.setup export (in-process)');
        teardown(key);
        return;
      }

      const vencore = buildVencoreFacade(transport);
      await Promise.resolve(mod.default.setup(vencore));

      // Only register once setup succeeded, mirroring the child's setup_done.
      // A newer spawn may have replaced this entry while we awaited — bail if so.
      if (sandboxes.get(key) !== entry) return;

      entry.router = router;
      entry.ready = true;

      // Forward declared listen topics from the workspace bus into local
      // handlers — the same set the parent forwards to a forked child.
      const bus = pluginEventBus.forWorkspace(workspaceId);
      for (const event of new Set(listens)) {
        const handler = (payload: unknown): void => { void dispatchBusEvent(entry, event, payload); };
        bus.on(event, handler);
        entry.busSubscriptions.push({ event, handler });
      }

      logger.info({ pluginId, workspaceId, listens: [...new Set(listens)] }, 'Plugin in-process sandbox setup complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ pluginId, workspaceId, message }, 'Plugin in-process sandbox setup failed');
      if (sandboxes.get(key) === entry) teardown(key);
    }
  })();
}

function getRouter(pluginId: string, workspaceId: string): Router | null {
  return sandboxes.get(sandboxKey(pluginId, workspaceId))?.router ?? null;
}

function sendBusEvent(pluginId: string, workspaceId: string, event: string, payload: unknown): boolean {
  const entry = sandboxes.get(sandboxKey(pluginId, workspaceId));
  if (!entry) return false;
  void dispatchBusEvent(entry, event, payload);
  return true;
}

function isRunning(pluginId: string, workspaceId: string): boolean {
  return sandboxes.has(sandboxKey(pluginId, workspaceId));
}

function has(pluginId: string, workspaceId: string): boolean {
  return sandboxes.has(sandboxKey(pluginId, workspaceId));
}

function kill(pluginId: string, workspaceId: string): void {
  teardown(sandboxKey(pluginId, workspaceId));
}

function killAll(): void {
  for (const key of [...sandboxes.keys()]) teardown(key);
}

export const inProcessStrategy: SandboxStrategy = {
  spawn,
  getRouter,
  sendBusEvent,
  isRunning,
  has,
  kill,
  killAll,
};
