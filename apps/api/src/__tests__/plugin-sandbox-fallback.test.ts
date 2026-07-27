/**
 * Dispatcher behaviour for the plugin sandbox strategies (GH #93 / B-0018).
 *
 * Covers mode selection and — the point of the issue — that a host which
 * restricts child-process fork transparently lands on the in-process strategy
 * instead of leaving the plugin unmounted (404 PLUGIN_NOT_MOUNTED).
 *
 * manager.ts keeps the `forkDisabled` latch in module scope, so every test
 * re-imports it after vi.resetModules() to start from a clean latch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { SpawnHooks } from '../lib/plugin-sandbox/types';

const { child, inproc } = vi.hoisted(() => {
  const makeStrategy = () => ({
    spawn: vi.fn(),
    getRouter: vi.fn(() => null),
    sendBusEvent: vi.fn(() => false),
    isRunning: vi.fn(() => false),
    has: vi.fn(() => false),
    kill: vi.fn(),
    killAll: vi.fn(),
  });
  return { child: makeStrategy(), inproc: makeStrategy() };
});

vi.mock('../lib/plugin-sandbox/child-process', () => ({ childProcessStrategy: child }));
vi.mock('../lib/plugin-sandbox/in-process', () => ({ inProcessStrategy: inproc }));
vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type Manager = typeof import('../lib/plugin-sandbox/manager');

const db = {} as unknown as Kysely<Database>;

async function loadManager(mode?: string): Promise<Manager> {
  if (mode === undefined) delete process.env['PLUGIN_SANDBOX_MODE'];
  else process.env['PLUGIN_SANDBOX_MODE'] = mode;
  return import('../lib/plugin-sandbox/manager');
}

function spawn(mgr: Manager, pluginId: string, workspaceId: string): void {
  mgr.spawnPluginSandbox(pluginId, workspaceId, `/bundles/${pluginId}/server.cjs`, [], [], db, []);
}

/** The hooks the dispatcher handed to the child strategy on its Nth spawn. */
function hooksFromSpawn(call = 0): SpawnHooks {
  return child.spawn.mock.calls[call]![1] as SpawnHooks;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env['PLUGIN_SANDBOX_MODE'];
});

describe('plugin sandbox mode selection', () => {
  it('defaults to auto and uses the isolated child process', async () => {
    const mgr = await loadManager();

    expect(mgr.getSandboxMode()).toBe('auto');
    expect(mgr.usingInProcessSandbox()).toBe(false);

    spawn(mgr, 'p1', 'w1');

    expect(child.spawn).toHaveBeenCalledTimes(1);
    expect(inproc.spawn).not.toHaveBeenCalled();
  });

  it('treats an unrecognised PLUGIN_SANDBOX_MODE value as auto', async () => {
    const mgr = await loadManager('nonsense');
    expect(mgr.getSandboxMode()).toBe('auto');
  });

  it('runs in-process without attempting a fork when forced to in-process', async () => {
    const mgr = await loadManager('in-process');

    expect(mgr.usingInProcessSandbox()).toBe(true);

    spawn(mgr, 'p1', 'w1');

    expect(inproc.spawn).toHaveBeenCalledTimes(1);
    expect(child.spawn).not.toHaveBeenCalled();
  });

  it('never falls back when mode is pinned to child', async () => {
    const mgr = await loadManager('child');

    spawn(mgr, 'p1', 'w1');

    expect(child.spawn).toHaveBeenCalledTimes(1);
    // No fallback hook — a pinned child mode must not silently drop isolation.
    expect(hooksFromSpawn().onForkUnavailable).toBeUndefined();
  });
});

describe('fork-restricted host fallback (GH #93)', () => {
  it('falls back to in-process when the child strategy reports fork unavailable', async () => {
    const mgr = await loadManager();

    spawn(mgr, 'p1', 'w1');
    const hooks = hooksFromSpawn();
    expect(hooks.onForkUnavailable).toBeTypeOf('function');
    expect(inproc.spawn).not.toHaveBeenCalled();

    hooks.onForkUnavailable!();

    expect(inproc.spawn).toHaveBeenCalledTimes(1);
    expect(inproc.spawn.mock.calls[0]![0]).toMatchObject({ pluginId: 'p1', workspaceId: 'w1' });
    // Any half-spawned child is reaped before the in-process run takes over.
    expect(child.kill).toHaveBeenCalledWith('p1', 'w1');
  });

  it('latches the fallback so every subsequent plugin skips the doomed fork', async () => {
    const mgr = await loadManager();

    spawn(mgr, 'p1', 'w1');
    hooksFromSpawn().onForkUnavailable!();
    expect(mgr.usingInProcessSandbox()).toBe(true);

    child.spawn.mockClear();
    spawn(mgr, 'p2', 'w2');

    expect(child.spawn).not.toHaveBeenCalled();
    expect(inproc.spawn).toHaveBeenCalledTimes(2);
    expect(inproc.spawn.mock.calls[1]![0]).toMatchObject({ pluginId: 'p2', workspaceId: 'w2' });
  });

  it('sends a crash respawn back through mode selection rather than re-forking', async () => {
    const mgr = await loadManager();

    spawn(mgr, 'p1', 'w1');
    const hooks = hooksFromSpawn();
    expect(hooks.respawn).toBeTypeOf('function');

    // Fork becomes restricted, then the original child crashes and respawns.
    hooks.onForkUnavailable!();
    child.spawn.mockClear();
    hooks.respawn!();

    expect(child.spawn).not.toHaveBeenCalled();
    expect(inproc.spawn).toHaveBeenCalledTimes(2);
  });

  it('clears both strategies on spawn so a plugin can switch strategies cleanly', async () => {
    const mgr = await loadManager();

    spawn(mgr, 'p1', 'w1');

    expect(child.kill).toHaveBeenCalledWith('p1', 'w1');
    expect(inproc.kill).toHaveBeenCalledWith('p1', 'w1');
  });
});

describe('strategy-agnostic lookups', () => {
  it('resolves the router from whichever strategy owns the sandbox', async () => {
    const mgr = await loadManager();
    const router = { mounted: true } as never;

    child.getRouter.mockReturnValue(null);
    inproc.getRouter.mockReturnValue(router);

    expect(mgr.getSandboxRouter('p1', 'w1')).toBe(router);
  });

  it('delivers bus events to the in-process sandbox when no child owns the plugin', async () => {
    const mgr = await loadManager();

    child.sendBusEvent.mockReturnValue(false);
    inproc.sendBusEvent.mockReturnValue(true);

    expect(mgr.sendBusEventToSandbox('p1', 'w1', 'cron:nightly', { n: 1 })).toBe(true);
  });

  it('reports a plugin as running when only the in-process sandbox holds it', async () => {
    const mgr = await loadManager();

    child.isRunning.mockReturnValue(false);
    inproc.isRunning.mockReturnValue(true);

    expect(mgr.isSandboxRunning('p1', 'w1')).toBe(true);
  });

  it('tears down both strategies on shutdown', async () => {
    const mgr = await loadManager();

    mgr.killAllSandboxes();

    expect(child.killAll).toHaveBeenCalledTimes(1);
    expect(inproc.killAll).toHaveBeenCalledTimes(1);
  });
});
