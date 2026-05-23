import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseRegistry } from '../lib/sse-registry';
import type { Response } from 'express';

interface MockRes extends Response {
  _closeCallback: (() => void) | null;
  simulateClose: () => void;
}

function mockRes(): MockRes {
  const res: MockRes = {
    writeHead: vi.fn(),
    write: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => {
      if (event === 'close') {
        res._closeCallback = cb;
      }
    }),
    writableEnded: false,
    _closeCallback: null,
    simulateClose() {
      if (this._closeCallback) this._closeCallback();
    },
  } as unknown as MockRes;
  return res;
}

describe('SseRegistry', () => {
  let registry: SseRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new SseRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('broadcasts to all subscribers in a workspace', () => {
    const res1 = mockRes();
    const res2 = mockRes();
    const res3 = mockRes(); // different workspace

    registry.subscribe('ws-a', res1);
    registry.subscribe('ws-a', res2);
    registry.subscribe('ws-b', res3);

    registry.broadcast('ws-a', 'metric', { cpu_pct: 42 });

    expect(res1.write).toHaveBeenCalledWith(
      'event: metric\ndata: {"cpu_pct":42}\n\n',
    );
    expect(res2.write).toHaveBeenCalledWith(
      'event: metric\ndata: {"cpu_pct":42}\n\n',
    );
    expect(res3.write).not.toHaveBeenCalled();
  });

  it('stops broadcasting after unsubscribe', () => {
    const res = mockRes();
    registry.subscribe('ws-a', res);
    registry.unsubscribe('ws-a', res);
    registry.broadcast('ws-a', 'metric', { cpu_pct: 42 });
    expect(res.write).not.toHaveBeenCalled();
  });

  it('does not throw when broadcasting to workspace with no subscribers', () => {
    expect(() => registry.broadcast('nonexistent', 'metric', {})).not.toThrow();
  });

  it('sets SSE response headers on subscribe', () => {
    const res = mockRes();
    registry.subscribe('ws-a', res);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'text/event-stream',
    }));
  });

  it('includes X-Accel-Buffering: no header to prevent Nginx buffering', () => {
    const res = mockRes();
    registry.subscribe('ws-a', res);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'X-Accel-Buffering': 'no',
    }));
  });

  it('removes subscriber from registry when close event fires', () => {
    const res = mockRes();
    registry.subscribe('ws-a', res);

    // Confirm subscribed
    registry.broadcast('ws-a', 'ping', {});
    expect(res.write).toHaveBeenCalledTimes(1);

    // Fire the close callback
    res.simulateClose();

    // After close, broadcast should be a no-op (workspace entry removed)
    registry.broadcast('ws-a', 'ping', {});
    expect(res.write).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it('removes stale writableEnded connections during broadcast', () => {
    const res1 = mockRes();
    const res2 = mockRes();

    registry.subscribe('ws-a', res1);
    registry.subscribe('ws-a', res2);

    // Simulate abrupt TCP drop on res1 (writableEnded but no close event)
    (res1 as unknown as { writableEnded: boolean }).writableEnded = true;

    registry.broadcast('ws-a', 'metric', { cpu_pct: 10 });

    // res1 must not receive the write and must be deleted from the set
    expect(res1.write).not.toHaveBeenCalled();
    expect(res2.write).toHaveBeenCalledTimes(1);

    // On next broadcast, res1 must remain gone (not accumulate)
    registry.broadcast('ws-a', 'metric', { cpu_pct: 20 });
    expect(res1.write).not.toHaveBeenCalled();
    expect(res2.write).toHaveBeenCalledTimes(2);
  });
});
