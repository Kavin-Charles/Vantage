import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../workers/mail-sync', () => ({
  runIncrementalSync: vi.fn().mockResolvedValue(undefined),
  runFullSync: vi.fn().mockResolvedValue(undefined),
  startMailSync: vi.fn(),
  stopMailSync: vi.fn(),
  buildProvider: vi.fn(),
  storeEmailsForTest: vi.fn(),
}));

import { runIncrementalSync } from '../workers/mail-sync';
import { createMailWebhookRouter } from '../routes/mail-webhook';

function makeDb(accountId: string | null) {
  const chain: Record<string, unknown> = {};
  const fns = ['selectFrom', 'where', 'select', 'executeTakeFirst'];
  for (const f of fns) chain[f] = vi.fn().mockReturnValue(chain);
  chain['executeTakeFirst'] = vi.fn().mockResolvedValue(accountId ? { id: accountId } : undefined);
  return chain as any;
}

function buildRes() {
  const res: Record<string, unknown> = {};
  res['end'] = vi.fn().mockReturnValue(res);
  res['status'] = vi.fn().mockReturnValue(res);
  res['json'] = vi.fn().mockReturnValue(res);
  return res as any;
}

function buildReq(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    body: {},
    ...overrides,
  } as any;
}

function makePubSubBody(emailAddress: string) {
  return {
    message: {
      data: Buffer.from(JSON.stringify({ emailAddress })).toString('base64'),
    },
  };
}

function getGmailHandler(token: string, accountId: string | null = 'account-1') {
  const router = createMailWebhookRouter(makeDb(accountId), token);
  const stack = (router as unknown as { stack: { route: { stack: { handle: Function }[] } }[] }).stack;
  return stack[0]?.route?.stack[0]?.handle as Function;
}

describe('POST /api/mail/webhook/gmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when token missing', async () => {
    const handler = getGmailHandler('secret');
    const req = buildReq({ headers: {}, body: makePubSubBody('user@test.com') });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.end).toHaveBeenCalled();
    expect(runIncrementalSync).not.toHaveBeenCalled();
  });

  it('returns 401 when token wrong', async () => {
    const handler = getGmailHandler('secret');
    const req = buildReq({ headers: { 'x-goog-channel-token': 'wrong' }, body: makePubSubBody('user@test.com') });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(runIncrementalSync).not.toHaveBeenCalled();
  });

  it('returns 204 and triggers sync when token matches and account found', async () => {
    const handler = getGmailHandler('secret', 'account-1');
    const req = buildReq({ headers: { 'x-goog-channel-token': 'secret' }, body: makePubSubBody('user@test.com') });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(204);
    expect(runIncrementalSync).toHaveBeenCalledWith(expect.anything(), 'account-1');
  });

  it('returns 204 silently when no account matches', async () => {
    const handler = getGmailHandler('secret', null);
    const req = buildReq({ headers: { 'x-goog-channel-token': 'secret' }, body: makePubSubBody('nobody@test.com') });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(204);
    expect(runIncrementalSync).not.toHaveBeenCalled();
  });

  it('returns 204 when message data missing', async () => {
    const handler = getGmailHandler('secret');
    const req = buildReq({ headers: { 'x-goog-channel-token': 'secret' }, body: { message: {} } });
    const res = buildRes();
    await handler(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(204);
    expect(runIncrementalSync).not.toHaveBeenCalled();
  });
});
