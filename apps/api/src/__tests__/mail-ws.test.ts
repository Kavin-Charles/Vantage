import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';

vi.mock('../lib/mail-notifier', () => ({
  mailNotifier: { subscribe: vi.fn(), unsubscribe: vi.fn(), broadcast: vi.fn() },
}));
vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { mailNotifier } from '../lib/mail-notifier';
import { handleMailWsUpgrade } from '../ws/mail-ws';

const JWT_SECRET = 'test-secret';

function makeWs(): WebSocket {
  return {
    close: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    readyState: 1,
  } as unknown as WebSocket;
}

function makeRequest(cookie: string): IncomingMessage {
  return { headers: { cookie } } as unknown as IncomingMessage;
}

function makeDb(userId: string | null) {
  return {
    selectFrom: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue(userId ? { id: userId } : undefined),
  } as any;
}

function makeToken(userId: string) {
  return jwt.sign({ sub: userId, workspaceId: 'ws-1' }, JWT_SECRET);
}

describe('handleMailWsUpgrade', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('closes with 4001 when no cookie', async () => {
    const ws = makeWs();
    await handleMailWsUpgrade(ws, makeRequest(''), makeDb('user-1'), JWT_SECRET);
    expect(ws.close).toHaveBeenCalledWith(4001, 'Unauthorized');
    expect(mailNotifier.subscribe).not.toHaveBeenCalled();
  });

  it('closes with 4001 when token invalid', async () => {
    const ws = makeWs();
    const req = makeRequest('vantage_token=badtoken');
    await handleMailWsUpgrade(ws, req, makeDb('user-1'), JWT_SECRET);
    expect(ws.close).toHaveBeenCalledWith(4001, 'Unauthorized');
  });

  it('closes with 4001 when user not found in DB', async () => {
    const ws = makeWs();
    const req = makeRequest(`vantage_token=${makeToken('ghost-user')}`);
    await handleMailWsUpgrade(ws, req, makeDb(null), JWT_SECRET);
    expect(ws.close).toHaveBeenCalledWith(4001, 'Unauthorized');
  });

  it('subscribes user when auth succeeds', async () => {
    const ws = makeWs();
    const req = makeRequest(`vantage_token=${makeToken('user-1')}`);
    await handleMailWsUpgrade(ws, req, makeDb('user-1'), JWT_SECRET);
    expect(mailNotifier.subscribe).toHaveBeenCalledWith('user-1', ws);
    expect(ws.close).not.toHaveBeenCalled();
  });

  it('unsubscribes on close event', async () => {
    const ws = makeWs();
    let closeHandler: (() => void) | undefined;
    (ws.on as ReturnType<typeof vi.fn>).mockImplementation((event: string, handler: () => void) => {
      if (event === 'close') closeHandler = handler;
    });
    const req = makeRequest(`vantage_token=${makeToken('user-1')}`);
    await handleMailWsUpgrade(ws, req, makeDb('user-1'), JWT_SECRET);
    closeHandler?.();
    expect(mailNotifier.unsubscribe).toHaveBeenCalledWith('user-1', ws);
  });
});
