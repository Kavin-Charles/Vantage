import { describe, it, expect, vi } from 'vitest';
import { readConfigFromDb } from '../read-config-from-db';

describe('readConfigFromDb', () => {
  it('returns null when no config row exists', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      }),
    } as any;

    const result = await readConfigFromDb(mockDb);
    expect(result).toBeNull();
  });

  it('parses and returns valid config from DB', async () => {
    const value = {
      app: { name: 'Test', logoUrl: '/logo.png' },
      features: { crm: true, infra: true, alerts: true, analytics: false, files: false },
      smtp: null,
    };

    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockResolvedValue({ value }),
          }),
        }),
      }),
    } as any;

    const result = await readConfigFromDb(mockDb);
    expect(result?.app.name).toBe('Test');
    expect(result?.features.crm).toBe(true);
  });

  it('returns null when config row has invalid shape', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockResolvedValue({ value: { bad: 'shape' } }),
          }),
        }),
      }),
    } as any;

    const result = await readConfigFromDb(mockDb);
    expect(result).toBeNull();
  });
});
