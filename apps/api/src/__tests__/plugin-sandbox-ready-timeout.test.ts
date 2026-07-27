/**
 * Readiness deadline for the forked plugin sandbox (GH #93 / B-0018).
 *
 * Regression test for a gap found while reproducing the issue against a real
 * fork-restricted container: when the host limit is a process/thread budget
 * rather than an outright block, fork() SUCCEEDS and the child process exists,
 * but it can never finish booting. It emits no 'error', never exits, and never
 * sends 'ready' — so none of the other fallback triggers fire and the spawn
 * hangs forever, leaving the plugin unmounted (404 PLUGIN_NOT_MOUNTED).
 *
 * The child is stubbed here because the real failure needs an exhausted pids
 * cgroup, which a unit test cannot create.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

const { forkMock, killMock } = vi.hoisted(() => ({ forkMock: vi.fn(), killMock: vi.fn() }));

vi.mock('child_process', () => ({ fork: forkMock }));
vi.mock('@vencore/plugin-runtime', () => ({
  dispatchBridgeCall: vi.fn(),
  pluginEventBus: { forWorkspace: () => ({ on: vi.fn(), off: vi.fn() }) },
}));
vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { childProcessStrategy } from '../lib/plugin-sandbox/child-process';

/** A forked child that comes up but never signals readiness. */
function makeWedgedChild(): EventEmitter & Record<string, unknown> {
  const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
  child['send'] = vi.fn();
  child['kill'] = killMock;
  child['connected'] = true;
  child['stderr'] = new EventEmitter();
  return child;
}

const db = {} as unknown as Kysely<Database>;

function spawnPlugin(onForkUnavailable: () => void): void {
  childProcessStrategy.spawn(
    {
      pluginId: 'p1', workspaceId: 'w1', bundlePath: '/bundles/p1/server.cjs',
      dataAccess: [], tables: [], db, listens: [],
    },
    { onForkUnavailable },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  delete process.env['PLUGIN_SANDBOX_READY_TIMEOUT_MS'];
});

afterEach(() => {
  childProcessStrategy.killAll();
  vi.useRealTimers();
});

describe('forked sandbox readiness deadline', () => {
  it('reports fork unavailable when the child never signals ready', () => {
    forkMock.mockReturnValue(makeWedgedChild());
    const onForkUnavailable = vi.fn();

    spawnPlugin(onForkUnavailable);

    // Before the deadline the parent is still waiting — no premature fallback.
    vi.advanceTimersByTime(14_000);
    expect(onForkUnavailable).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2_000);
    expect(onForkUnavailable).toHaveBeenCalledTimes(1);
  });

  it('SIGKILLs the wedged child so it stops consuming the process budget', () => {
    forkMock.mockReturnValue(makeWedgedChild());

    spawnPlugin(vi.fn());
    vi.advanceTimersByTime(16_000);

    // SIGTERM is not enough — a child wedged before boot may never run a handler.
    expect(killMock).toHaveBeenCalledWith('SIGKILL');
  });

  it('does not fall back when the child signals ready in time', () => {
    const child = makeWedgedChild();
    forkMock.mockReturnValue(child);
    const onForkUnavailable = vi.fn();

    spawnPlugin(onForkUnavailable);
    child.emit('message', { type: 'ready' });

    vi.advanceTimersByTime(60_000);

    expect(onForkUnavailable).not.toHaveBeenCalled();
    expect(killMock).not.toHaveBeenCalledWith('SIGKILL');
  });

  it('honours PLUGIN_SANDBOX_READY_TIMEOUT_MS', () => {
    process.env['PLUGIN_SANDBOX_READY_TIMEOUT_MS'] = '3000';
    forkMock.mockReturnValue(makeWedgedChild());
    const onForkUnavailable = vi.fn();

    spawnPlugin(onForkUnavailable);

    vi.advanceTimersByTime(2_500);
    expect(onForkUnavailable).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(onForkUnavailable).toHaveBeenCalledTimes(1);
  });

  it('reports fork unavailable only once when the kill also triggers exit', () => {
    const child = makeWedgedChild();
    forkMock.mockReturnValue(child);
    const onForkUnavailable = vi.fn();

    spawnPlugin(onForkUnavailable);
    vi.advanceTimersByTime(16_000);
    // The SIGKILL lands and the child exits before ever being ready.
    child.emit('exit', null, 'SIGKILL');

    expect(onForkUnavailable).toHaveBeenCalledTimes(1);
  });

  it('does not schedule a crash-restart for a child that never became ready', () => {
    const child = makeWedgedChild();
    forkMock.mockReturnValue(child);

    spawnPlugin(vi.fn());
    vi.advanceTimersByTime(16_000);
    forkMock.mockClear();
    child.emit('exit', null, 'SIGKILL');

    // The 5s crash-restart path must not re-fork into the same dead end.
    vi.advanceTimersByTime(30_000);
    expect(forkMock).not.toHaveBeenCalled();
  });
});
