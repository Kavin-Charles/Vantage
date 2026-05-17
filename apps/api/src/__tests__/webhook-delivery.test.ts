import { describe, it, expect, vi, beforeEach } from 'vitest';

const FAKE_SECRET = 'testsecret';
const FAKE_PAYLOAD = JSON.stringify({ deal_id: 'd1', event: 'deal.stage_changed' });

function buildDelivery(overrides: Partial<{
  id: string; attempts: number; payload: string; event: string;
  target_url: string; secret: string;
}> = {}) {
  return {
    id: 'del-1',
    attempts: 0,
    payload: FAKE_PAYLOAD,
    event: 'deal.stage_changed',
    target_url: 'https://example.com/webhook',
    secret: FAKE_SECRET,
    ...overrides,
  };
}

describe('webhook delivery worker — HTTP delivery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends correct headers on successful delivery', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const { createHmac } = await import('node:crypto');
    const expectedSig = 'sha256=' + createHmac('sha256', FAKE_SECRET)
      .update(FAKE_PAYLOAD)
      .digest('hex');

    const { deliverOne } = await import('../workers/webhook-delivery');
    const fakeDb = {
      updateTable: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    };
    await deliverOne(fakeDb as never, buildDelivery());

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Vantage-Signature': expectedSig,
          'X-Vantage-Event': 'deal.stage_changed',
          'X-Vantage-Delivery': 'del-1',
        }),
        body: FAKE_PAYLOAD,
      }),
    );
  });

  it('marks delivery as delivered on 2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const { deliverOne } = await import('../workers/webhook-delivery');
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const fakeDb = { updateTable: vi.fn().mockReturnValue(updateChain) };

    await deliverOne(fakeDb as never, buildDelivery());

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'delivered', last_error: null }),
    );
  });

  it('increments attempts and sets next_attempt_at on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { deliverOne } = await import('../workers/webhook-delivery');
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const fakeDb = { updateTable: vi.fn().mockReturnValue(updateChain) };

    await deliverOne(fakeDb as never, buildDelivery({ attempts: 0 }));

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1, last_error: 'HTTP 500' }),
    );
    // status stays pending (not 'failed' since attempts < 5)
    const callArg = updateChain.set.mock.calls[0][0];
    expect(callArg.status).not.toBe('failed');
  });

  it('marks failed when attempts reaches 5', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const { deliverOne } = await import('../workers/webhook-delivery');
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const fakeDb = { updateTable: vi.fn().mockReturnValue(updateChain) };

    await deliverOne(fakeDb as never, buildDelivery({ attempts: 4 }));

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', attempts: 5, next_attempt_at: null }),
    );
  });
});
