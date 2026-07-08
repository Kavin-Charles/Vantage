import { describe, it, expect, vi } from 'vitest';

describe('isConfigured', () => {
  it('returns false when no workspace exists', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          executeTakeFirst: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    } as any;

    const { isConfigured } = await import('../lib/setup-db');
    expect(await isConfigured(mockDb)).toBe(false);
  });

  it('returns true when a workspace exists', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          executeTakeFirst: vi.fn().mockResolvedValue({ id: 'ws-1' }),
        }),
      }),
    } as any;

    const { isConfigured } = await import('../lib/setup-db');
    expect(await isConfigured(mockDb)).toBe(true);
  });

  it('returns false when DB throws (table does not exist)', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          executeTakeFirst: vi.fn().mockRejectedValue(new Error('relation "workspaces" does not exist')),
        }),
      }),
    } as any;

    const { isConfigured } = await import('../lib/setup-db');
    expect(await isConfigured(mockDb)).toBe(false);
  });

  it('returns true when workspace row exists (multiple workspaces)', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          executeTakeFirst: vi.fn().mockResolvedValue({ id: 'ws-abc' }),
        }),
      }),
    } as any;

    const { isConfigured } = await import('../lib/setup-db');
    expect(await isConfigured(mockDb)).toBe(true);
  });
});
