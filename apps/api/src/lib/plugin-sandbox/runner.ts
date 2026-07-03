/**
 * Plugin sandbox runner — spawned as a child process for each plugin+workspace.
 * Communicates with the parent via IPC (process.send / process.on('message')).
 *
 * Protocol:
 *   Parent → Child:
 *     { type: 'setup', bundlePath, pluginId, workspaceId, dataAccess, tables }
 *     { type: 'bridge_response', id, result }
 *     { type: 'bus_event', event, payload }
 *     { type: 'http_request', id, req }
 *
 *   Child → Parent:
 *     { type: 'ready' }
 *     { type: 'setup_done' }
 *     { type: 'setup_error', message }
 *     { type: 'bridge_call', id, method, payload }
 *     { type: 'http_handler_registered', path }
 *     { type: 'http_response', id, res }
 *     { type: 'log', level, data }
 */

import path from 'path';

interface SetupMsg {
  type: 'setup';
  bundlePath: string;
  pluginId: string;
  workspaceId: string;
  dataAccess: string[];
  tables: string[];
}

type BridgeResponseMsg = { type: 'bridge_response'; id: string; result: unknown };
type BusEventMsg = { type: 'bus_event'; event: string; payload: unknown };
type HttpRequestMsg = { type: 'http_request'; id: string; req: Record<string, unknown> };

type InboundMsg = SetupMsg | BridgeResponseMsg | BusEventMsg | HttpRequestMsg;

const pendingBridgeCalls = new Map<string, { resolve: (r: unknown) => void; reject: (e: unknown) => void }>();
const httpHandlers = new Map<string, (req: unknown) => Promise<unknown>>();
const busHandlers = new Map<string, Array<(payload: unknown) => void | Promise<void>>>();

let bridgeCallIdCounter = 0;

function sendToParent(msg: unknown): void {
  if (process.send) process.send(msg);
}

function log(level: 'info' | 'warn' | 'error', data: unknown): void {
  sendToParent({ type: 'log', level, data });
}

// Bridge function exposed to the plugin — sends calls to parent and awaits responses
async function bridge(method: string, payload: unknown): Promise<unknown> {
  const id = String(++bridgeCallIdCounter);
  return new Promise((resolve, reject) => {
    pendingBridgeCalls.set(id, { resolve, reject });
    sendToParent({ type: 'bridge_call', id, method, payload });
    // Per-call timeout: 30s
    setTimeout(() => {
      if (pendingBridgeCalls.has(id)) {
        pendingBridgeCalls.delete(id);
        reject({ code: 'BRIDGE_TIMEOUT', message: `Bridge call ${method} timed out` });
      }
    }, 30_000);
  });
}

process.on('message', async (msg: InboundMsg) => {
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'setup': {
      try {
        const { bundlePath, dataAccess: _da, tables: _t } = msg;

        // Load the plugin bundle (already compiled CJS)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(path.resolve(bundlePath)) as {
          default?: { setup(vencore: unknown): void | Promise<void> };
        };

        if (!mod.default?.setup) {
          sendToParent({ type: 'setup_error', message: 'Plugin has no default.setup export' });
          return;
        }

        // Build the vencore facade for the plugin
        const vencore = {
          storage: {
            get: (key: string) => bridge('storage.get', { key }),
            set: (key: string, value: unknown) => bridge('storage.set', { key, value }),
            delete: (key: string) => bridge('storage.delete', { key }),
          },
          settings: {
            get: (key: string) => bridge('settings.get', { key }),
            set: (key: string, value: unknown) => bridge('settings.set', { key, value }),
          },
          http: {
            fetch: (url: string, opts?: unknown) => bridge('http.fetch', { url, ...(opts as object ?? {}) }),
            onEndpoint: (endpointPath: string, handler: (req: unknown) => Promise<unknown>) => {
              httpHandlers.set(endpointPath, handler);
              sendToParent({ type: 'http_handler_registered', path: endpointPath });
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
              // Store cron handler locally; parent worker will trigger via bus_event or separate message
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
          on: (event: string, handler: (payload: unknown) => void | Promise<void>) => {
            const arr = busHandlers.get(event) ?? [];
            arr.push(handler);
            busHandlers.set(event, arr);
          },
          safe: {} as any,
        };

        await Promise.resolve(mod.default.setup(vencore));
        sendToParent({ type: 'setup_done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log('error', { message, stack: err instanceof Error ? err.stack : undefined });
        sendToParent({ type: 'setup_error', message });
      }
      break;
    }

    case 'bridge_response': {
      const pending = pendingBridgeCalls.get(msg.id);
      if (pending) {
        pendingBridgeCalls.delete(msg.id);
        // Unwrap the bridge envelope to match the SDK contract: reject on error,
        // resolve with the data payload. Plugins receive values, not { data, error }.
        const result = msg.result as { data: unknown; error: unknown } | null | undefined;
        if (result && result.error) pending.reject(result.error);
        else pending.resolve(result ? result.data : undefined);
      }
      break;
    }

    case 'bus_event': {
      const handlers = busHandlers.get(msg.event) ?? [];
      await Promise.allSettled(handlers.map((h) => h(msg.payload)));
      break;
    }

    case 'http_request': {
      const { id, req } = msg;
      // Find matching handler by path prefix
      let matchedHandler: ((req: unknown) => Promise<unknown>) | undefined;
      for (const [handlerPath, handler] of httpHandlers) {
        const reqPath = (req as any).path as string;
        if (reqPath === handlerPath || reqPath.startsWith(handlerPath + '/') || handlerPath === '*') {
          matchedHandler = handler;
          break;
        }
      }
      if (!matchedHandler) {
        sendToParent({ type: 'http_response', id, res: { status: 404, body: 'Not found', headers: {} } });
        return;
      }
      try {
        const pluginRes = await Promise.resolve(matchedHandler(req));
        sendToParent({ type: 'http_response', id, res: pluginRes });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendToParent({ type: 'http_response', id, res: { status: 500, body: message, headers: {} } });
      }
      break;
    }
  }
});

// Signal ready to parent
sendToParent({ type: 'ready' });
