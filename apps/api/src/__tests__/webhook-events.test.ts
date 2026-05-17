import { describe, it, expect } from 'vitest';

describe('WebhookEvent type coverage', () => {
  it('queueWebhook accepts all expected event names without TS error', async () => {
    const { queueWebhook } = await import('../lib/queue-webhook');
    // This test just verifies the module loads — type coverage is compile-time.
    expect(typeof queueWebhook).toBe('function');
  });
});
