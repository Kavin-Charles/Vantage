import { describe, it, expect, vi } from 'vitest';
import { MailNotifier } from '../lib/mail-notifier';
import type { WebSocket } from 'ws';

function makeWs(readyState = 1 /* OPEN */): WebSocket {
  return { readyState, send: vi.fn() } as unknown as WebSocket;
}

describe('MailNotifier', () => {
  it('broadcasts to subscribed user', () => {
    const n = new MailNotifier();
    const ws = makeWs();
    n.subscribe('user-1', ws);
    n.broadcast('user-1', { type: 'new_email' });
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'new_email' }));
  });

  it('does not broadcast after unsubscribe', () => {
    const n = new MailNotifier();
    const ws = makeWs();
    n.subscribe('user-1', ws);
    n.unsubscribe('user-1', ws);
    n.broadcast('user-1', { type: 'new_email' });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('skips non-OPEN sockets', () => {
    const n = new MailNotifier();
    const ws = makeWs(3 /* CLOSED */);
    n.subscribe('user-1', ws);
    n.broadcast('user-1', { type: 'new_email' });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('supports multiple sockets per user', () => {
    const n = new MailNotifier();
    const ws1 = makeWs();
    const ws2 = makeWs();
    n.subscribe('user-1', ws1);
    n.subscribe('user-1', ws2);
    n.broadcast('user-1', { type: 'ping' });
    expect(ws1.send).toHaveBeenCalled();
    expect(ws2.send).toHaveBeenCalled();
  });
});
