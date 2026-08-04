/**
 * End-to-end behaviour of the in-process plugin sandbox (GH #93 / B-0018).
 *
 * The dispatcher tests in plugin-sandbox-fallback.test.ts mock both strategies,
 * so they only prove the wiring. This file runs the *real* in-process strategy
 * against a real plugin bundle over a real HTTP server, which is what actually
 * demonstrates the reported symptom is gone: on a fork-restricted host the
 * plugin mounts its routes and serves traffic instead of 404 PLUGIN_NOT_MOUNTED.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

const { bridgeCalls, dispatchBridgeCall, busRegistry } = vi.hoisted(() => {
  const calls: Array<{ method: string; payload: unknown }> = [];
  // Per-workspace map of topic -> registered host handlers.
  const registry = new Map<string, Map<string, Array<(p: unknown) => unknown>>>();
  return {
    bridgeCalls: calls,
    dispatchBridgeCall: vi.fn(async (_db: unknown, _ctx: unknown, call: { method: string; payload: unknown }) => {
      calls.push(call);
      if (call.method === 'storage.get') return { data: 'stored-value', error: null };
      if (call.method === 'table.list') return { data: null, error: { code: 'FORBIDDEN', message: 'no access' } };
      return { data: null, error: null };
    }),
    busRegistry: registry,
  };
});

vi.mock('@vencore/plugin-runtime', () => ({
  dispatchBridgeCall,
  pluginEventBus: {
    forWorkspace: (workspaceId: string) => {
      if (!busRegistry.has(workspaceId)) busRegistry.set(workspaceId, new Map());
      const topics = busRegistry.get(workspaceId)!;
      return {
        on: (event: string, handler: (p: unknown) => unknown) => {
          const arr = topics.get(event) ?? [];
          arr.push(handler);
          topics.set(event, arr);
        },
        off: (event: string, handler: (p: unknown) => unknown) => {
          const arr = (topics.get(event) ?? []).filter((h) => h !== handler);
          topics.set(event, arr);
        },
      };
    },
  },
}));

vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { inProcessStrategy } from '../lib/plugin-sandbox/in-process';

const db = {} as unknown as Kysely<Database>;
const WS = 'ws-1';

let tmpDir: string;
const servers: Array<{ close: (cb?: () => void) => void }> = [];

/** Writes a CJS plugin bundle to disk, mirroring a built server.cjs. */
function writeBundle(name: string, body: string): string {
  const file = path.join(tmpDir, `${name}.cjs`);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

/** Polls until the strategy exposes a router (setup is async, as in the child). */
async function waitForRouter(pluginId: string, timeoutMs = 3_000): Promise<express.Router> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const router = inProcessStrategy.getRouter(pluginId, WS);
    if (router) return router as unknown as express.Router;
    if (Date.now() > deadline) throw new Error(`router for ${pluginId} never mounted`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Mounts the plugin router the same way index.ts does and returns its base URL. */
async function serve(router: express.Router): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use('/api/plugins/route/demo', router);
  const server = app.listen(0);
  servers.push(server);
  await new Promise((r) => server.once('listening', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/plugins/route/demo`;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vencore-sandbox-'));
  bridgeCalls.length = 0;
  busRegistry.clear();
});

afterEach(async () => {
  inProcessStrategy.killAll();
  for (const s of servers.splice(0)) await new Promise((r) => s.close(() => r(null)));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('in-process sandbox serves plugin HTTP routes', () => {
  it('mounts a route and returns the plugin response instead of PLUGIN_NOT_MOUNTED', async () => {
    const bundlePath = writeBundle('http', `
      module.exports = { default: { setup(vencore) {
        vencore.http.onEndpoint('/ping', async (req) => ({
          status: 200,
          headers: { 'x-plugin': 'demo' },
          body: { pong: true, method: req.method },
        }));
      } } };
    `);

    inProcessStrategy.spawn({
      pluginId: 'demo', workspaceId: WS, bundlePath,
      dataAccess: [], tables: [], db, listens: [],
    });

    const base = await serve(await waitForRouter('demo'));
    const res = await fetch(`${base}/ping`);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-plugin')).toBe('demo');
    await expect(res.json()).resolves.toEqual({ pong: true, method: 'GET' });
  });

  it('passes the request body through to the plugin handler', async () => {
    const bundlePath = writeBundle('echo', `
      module.exports = { default: { setup(vencore) {
        vencore.http.onEndpoint('/echo', async (req) => ({
          status: 201,
          body: { received: JSON.parse(req.body) },
        }));
      } } };
    `);

    inProcessStrategy.spawn({
      pluginId: 'demo', workspaceId: WS, bundlePath,
      dataAccess: [], tables: [], db, listens: [],
    });

    const base = await serve(await waitForRouter('demo'));
    const res = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ received: { hello: 'world' } });
  });

  it('returns a contained 500 when the plugin handler throws', async () => {
    const bundlePath = writeBundle('boom', `
      module.exports = { default: { setup(vencore) {
        vencore.http.onEndpoint('/boom', async () => { throw new Error('kaboom'); });
      } } };
    `);

    inProcessStrategy.spawn({
      pluginId: 'demo', workspaceId: WS, bundlePath,
      dataAccess: [], tables: [], db, listens: [],
    });

    const base = await serve(await waitForRouter('demo'));
    const res = await fetch(`${base}/boom`);

    expect(res.status).toBe(500);
    // The plugin's internal message must not leak to the caller.
    await expect(res.json()).resolves.toEqual({
      data: null,
      error: { code: 'PLUGIN_ERROR', message: 'Internal plugin error' },
    });
  });
});

describe('in-process sandbox data bridge', () => {
  it('unwraps the bridge envelope so plugins receive values, not { data, error }', async () => {
    const bundlePath = writeBundle('bridge', `
      module.exports = { default: { setup(vencore) {
        vencore.http.onEndpoint('/read', async () => ({
          status: 200,
          body: { value: await vencore.storage.get('k') },
        }));
      } } };
    `);

    inProcessStrategy.spawn({
      pluginId: 'demo', workspaceId: WS, bundlePath,
      dataAccess: [], tables: [], db, listens: [],
    });

    const base = await serve(await waitForRouter('demo'));
    await expect((await fetch(`${base}/read`)).json()).resolves.toEqual({ value: 'stored-value' });
    expect(bridgeCalls).toContainEqual({ method: 'storage.get', payload: { key: 'k' } });
  });

  it('rejects the plugin call when the bridge returns an error', async () => {
    const bundlePath = writeBundle('denied', `
      module.exports = { default: { setup(vencore) {
        vencore.http.onEndpoint('/denied', async () => {
          try {
            await vencore.table('secrets').list();
            return { status: 200, body: { denied: false } };
          } catch (e) {
            return { status: 403, body: { code: e.code } };
          }
        });
      } } };
    `);

    inProcessStrategy.spawn({
      pluginId: 'demo', workspaceId: WS, bundlePath,
      dataAccess: [], tables: [], db, listens: [],
    });

    const base = await serve(await waitForRouter('demo'));
    const res = await fetch(`${base}/denied`);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ code: 'FORBIDDEN' });
  });
});

describe('in-process sandbox lifecycle', () => {
  it('forwards declared listen topics from the workspace bus into the plugin', async () => {
    const bundlePath = writeBundle('listener', `
      const seen = [];
      module.exports = { default: { setup(vencore) {
        vencore.on('contact:changed', (p) => { seen.push(p); });
        vencore.http.onEndpoint('/seen', async () => ({ status: 200, body: { seen } }));
      } } };
    `);

    inProcessStrategy.spawn({
      pluginId: 'demo', workspaceId: WS, bundlePath,
      dataAccess: [], tables: [], db, listens: ['contact:changed'],
    });

    const base = await serve(await waitForRouter('demo'));

    // The host bus fires — the strategy must relay it to the plugin's handler.
    const handlers = busRegistry.get(WS)?.get('contact:changed') ?? [];
    expect(handlers).toHaveLength(1);
    handlers[0]!({ id: 'c1' });
    await new Promise((r) => setTimeout(r, 20));

    await expect((await fetch(`${base}/seen`)).json()).resolves.toEqual({ seen: [{ id: 'c1' }] });
  });

  it('routes cron pokes to the handler registered via vencore.cron', async () => {
    const bundlePath = writeBundle('cron', `
      const runs = [];
      module.exports = { default: { setup(vencore) {
        vencore.cron.register('0 2 * * *', 'nightly', () => { runs.push(Date.now()); });
        vencore.http.onEndpoint('/runs', async () => ({ status: 200, body: { count: runs.length } }));
      } } };
    `);

    inProcessStrategy.spawn({
      pluginId: 'demo', workspaceId: WS, bundlePath,
      dataAccess: [], tables: [], db, listens: [],
    });

    const base = await serve(await waitForRouter('demo'));

    expect(bridgeCalls).toContainEqual({
      method: 'cron.register',
      payload: { schedule: '0 2 * * *', name: 'nightly' },
    });

    expect(inProcessStrategy.sendBusEvent('demo', WS, 'cron:nightly', {})).toBe(true);
    await new Promise((r) => setTimeout(r, 20));

    await expect((await fetch(`${base}/runs`)).json()).resolves.toEqual({ count: 1 });
  });

  it('picks up new bundle code on respawn rather than serving the cached module', async () => {
    const bundlePath = path.join(tmpDir, 'versioned.cjs');
    const bundle = (v: string) => `
      module.exports = { default: { setup(vencore) {
        vencore.http.onEndpoint('/version', async () => ({ status: 200, body: { v: '${v}' } }));
      } } };
    `;

    fs.writeFileSync(bundlePath, bundle('1.0.0'), 'utf8');
    inProcessStrategy.spawn({
      pluginId: 'demo', workspaceId: WS, bundlePath,
      dataAccess: [], tables: [], db, listens: [],
    });
    let base = await serve(await waitForRouter('demo'));
    await expect((await fetch(`${base}/version`)).json()).resolves.toEqual({ v: '1.0.0' });

    // Simulate a plugin upgrade: same path, new contents.
    inProcessStrategy.kill('demo', WS);
    fs.writeFileSync(bundlePath, bundle('2.0.0'), 'utf8');
    inProcessStrategy.spawn({
      pluginId: 'demo', workspaceId: WS, bundlePath,
      dataAccess: [], tables: [], db, listens: [],
    });
    base = await serve(await waitForRouter('demo'));

    await expect((await fetch(`${base}/version`)).json()).resolves.toEqual({ v: '2.0.0' });
  });

  it('unsubscribes workspace bus handlers when the sandbox is killed', async () => {
    const bundlePath = writeBundle('teardown', `
      module.exports = { default: { setup(vencore) {
        vencore.on('contact:changed', () => {});
        vencore.http.onEndpoint('/x', async () => ({ status: 200, body: {} }));
      } } };
    `);

    inProcessStrategy.spawn({
      pluginId: 'demo', workspaceId: WS, bundlePath,
      dataAccess: [], tables: [], db, listens: ['contact:changed'],
    });
    await waitForRouter('demo');
    expect(busRegistry.get(WS)?.get('contact:changed')).toHaveLength(1);

    inProcessStrategy.kill('demo', WS);

    expect(busRegistry.get(WS)?.get('contact:changed')).toHaveLength(0);
    expect(inProcessStrategy.isRunning('demo', WS)).toBe(false);
    expect(inProcessStrategy.getRouter('demo', WS)).toBeNull();
  });

  it('leaves no router mounted when the plugin bundle fails to set up', async () => {
    const bundlePath = writeBundle('broken', `
      module.exports = { default: { setup() { throw new Error('bad plugin'); } } };
    `);

    inProcessStrategy.spawn({
      pluginId: 'demo', workspaceId: WS, bundlePath,
      dataAccess: [], tables: [], db, listens: [],
    });
    await new Promise((r) => setTimeout(r, 100));

    expect(inProcessStrategy.getRouter('demo', WS)).toBeNull();
    expect(inProcessStrategy.isRunning('demo', WS)).toBe(false);
  });
});
