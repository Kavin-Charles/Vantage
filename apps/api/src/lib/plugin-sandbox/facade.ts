/**
 * Shared `vencore` facade builder.
 *
 * The object passed to a plugin's `setup(vencore)` must be byte-for-byte
 * identical whether the plugin runs in an isolated child process (IPC
 * transport, see runner.ts) or in-process (direct dispatchBridgeCall transport,
 * see in-process.ts). Both strategies build the facade from this one function so
 * the plugin-facing API can never drift between the two.
 *
 * The differences between the two runtimes are isolated behind FacadeTransport:
 *   - `bridge`       — perform a data-access call and resolve the UNWRAPPED value
 *                      (reject on error). Child does this over IPC; in-process
 *                      calls dispatchBridgeCall directly.
 *   - `registerHttp` — register an HTTP endpoint handler.
 *   - `registerBus`  — subscribe a handler to a bus/cron/hook/hub topic.
 *   - `persistCron`  — persist a cron schedule (fire-and-forget).
 */

export type PluginHttpHandler = (req: unknown) => Promise<unknown> | unknown;
export type PluginBusHandler = (payload: unknown) => void | Promise<void>;

export interface FacadeTransport {
  /** Resolves with the unwrapped data payload; rejects with the plugin error. */
  bridge(method: string, payload: unknown): Promise<unknown>;
  registerHttp(path: string, handler: PluginHttpHandler): void;
  registerBus(event: string, handler: PluginBusHandler): void;
  persistCron(schedule: string, name: string): void;
}

export function buildVencoreFacade(t: FacadeTransport): Record<string, unknown> {
  return {
    storage: {
      get: (key: string) => t.bridge('storage.get', { key }),
      set: (key: string, value: unknown) => t.bridge('storage.set', { key, value }),
      delete: (key: string) => t.bridge('storage.delete', { key }),
    },
    settings: {
      get: (key: string) => t.bridge('settings.get', { key }),
      set: (key: string, value: unknown) => t.bridge('settings.set', { key, value }),
    },
    http: {
      fetch: (url: string, opts?: unknown) => t.bridge('http.fetch', { url, ...(opts as object ?? {}) }),
      onEndpoint: (endpointPath: string, handler: PluginHttpHandler) => {
        t.registerHttp(endpointPath, handler);
      },
    },
    table: (name: string) => ({
      list: (opts?: unknown) => t.bridge('table.list', { name, ...(opts as object ?? {}) }),
      get: (id: string) => t.bridge('table.get', { name, id }),
      insert: (data: unknown) => t.bridge('table.insert', { name, data }),
      update: (id: string, data: unknown) => t.bridge('table.update', { name, id, data }),
      delete: (id: string) => t.bridge('table.delete', { name, id }),
      upsert: (data: unknown, opts: unknown) => t.bridge('table.upsert', { name, data, ...(opts as object) }),
      count: (where?: unknown) => t.bridge('table.count', { name, where }),
    }),
    list: (resource: string, filter?: unknown) => t.bridge(`${resource}.list`, { filter }),
    get: (resource: string, id: string) => t.bridge(`${resource}.get`, { id }),
    create: (resource: string, data: unknown) => t.bridge(`${resource}.create`, { data }),
    update: (resource: string, id: string, data: unknown) => t.bridge(`${resource}.update`, { id, data }),
    delete: (resource: string, id: string) => t.bridge(`${resource}.delete`, { id }),
    action: (resource: string, action: string, payload?: unknown) => t.bridge(`${resource}.${action}`, { payload }),
    user: { get: () => t.bridge('user.get', {}) },
    workspace: { get: () => t.bridge('workspace.get', {}) },
    notify: (opts: unknown) => t.bridge('notify', opts),
    files: {
      upload: (buffer: Uint8Array, opts: unknown) => t.bridge('files.upload', { buffer: Buffer.from(buffer).toString('base64'), ...(opts as object) }),
      getUrl: (fileId: string) => t.bridge('files.getUrl', { fileId }),
      delete: (fileId: string) => t.bridge('files.delete', { fileId }),
    },
    cron: {
      register: (schedule: string, name: string, handler: () => void | Promise<void>) => {
        // Persist the schedule (fire-and-forget) and store the handler locally
        // under cron:<name>; the parent cron worker pokes it via a bus event.
        t.persistCron(schedule, name);
        t.registerBus(`cron:${name}`, handler);
      },
    },
    permissions: {
      check: (userId: string, permissionKey: string) => t.bridge('permissions.check', { userId, permissionKey }),
    },
    context: {
      get: () => t.bridge('context.get', {}),
    },
    bus: {
      on: (event: string, handler: PluginBusHandler) => {
        t.registerBus(event, handler);
      },
      emit: (event: string, payload: unknown) => t.bridge('bus.emit', { event, payload }),
    },
    hub: {
      publish: (contract: string, records: unknown[]) => t.bridge('hub.publish', { contract, records }),
      query: (contract: string, opts?: unknown) => t.bridge('hub.query', { contract, ...(opts as object ?? {}) }),
      providers: (contract: string) => t.bridge('hub.providers', { contract }),
      delete: (contract: string, externalIds: string[]) => t.bridge('hub.delete', { contract, external_ids: externalIds }),
      contracts: () => t.bridge('hub.contracts', {}),
      subscribe: (contract: string, handler: PluginBusHandler) => {
        t.registerBus(`hub:${contract}:changed`, handler);
      },
      getSetting: (key: string) => t.bridge('hub.getSetting', { key }),
      setSetting: (key: string, value: unknown) => t.bridge('hub.setSetting', { key, value }),
      getSharedSetting: (pluginId: string, key: string) => t.bridge('hub.getSharedSetting', { plugin_id: pluginId, key }),
    },
    // Handler for an admin-enabled hook feature declared in the manifest.
    // Fires with { feature, trigger, payload, config } when the host dispatches
    // the feature's trigger event.
    onHookFeature: (featureId: string, handler: PluginBusHandler) => {
      t.registerBus(`hook:${featureId}`, handler);
    },
    on: (event: string, handler: PluginBusHandler) => {
      t.registerBus(event, handler);
    },
    safe: {} as any,
  };
}
