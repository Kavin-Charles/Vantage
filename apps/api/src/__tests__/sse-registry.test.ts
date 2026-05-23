import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SseRegistry } from '../lib/sse-registry';
import type { Response } from 'express';

function mockRes(): Response {
  return {
    writeHead: vi.fn(),
    write: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => {
      if (event === 'close') { /* store cb for later */ }
    }),
    writableEnded: false,
  } as unknown as Response;
}

describe('SseRegistry', () => {
  let registry: SseRegistry;

  beforeEach(() => {
    registry = new SseRegistry();
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
});
