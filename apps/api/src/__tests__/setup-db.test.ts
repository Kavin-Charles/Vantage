import { describe, it, expect, vi } from 'vitest';

describe('isConfigured', () => {
  it('returns false when system_settings row has configured=false', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockResolvedValue({ value: { configured: false } }),
          }),
        }),
      }),
    } as any;

    const { isConfigured } = await import('../lib/setup-db');
    expect(await isConfigured(mockDb)).toBe(false);
  });

  it('returns true when configured=true', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockResolvedValue({ value: { configured: true } }),
          }),
        }),
      }),
    } as any;

    const { isConfigured } = await import('../lib/setup-db');
    expect(await isConfigured(mockDb)).toBe(true);
  });

  it('returns false when row is missing (table exists, setup not run)', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      }),
    } as any;

    const { isConfigured } = await import('../lib/setup-db');
    expect(await isConfigured(mockDb)).toBe(false);
  });

  it('returns true when DB throws (legacy deploy, table does not exist)', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockRejectedValue(new Error('relation "system_settings" does not exist')),
          }),
        }),
      }),
    } as any;

    const { isConfigured } = await import('../lib/setup-db');
    expect(await isConfigured(mockDb)).toBe(true);
  });
});
