import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { serverApiUrl, getSetupStatus } from '../status';

const ENV_KEYS = ['API_URL', 'NEXT_PUBLIC_API_URL'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe('serverApiUrl', () => {
  it('prefers API_URL (internal container address) over NEXT_PUBLIC_API_URL', () => {
    process.env['API_URL'] = 'http://api:3001';
    process.env['NEXT_PUBLIC_API_URL'] = 'https://app.example.com';
    expect(serverApiUrl()).toBe('http://api:3001');
  });

  it('falls back to NEXT_PUBLIC_API_URL when API_URL unset', () => {
    process.env['NEXT_PUBLIC_API_URL'] = 'http://localhost:3001';
    expect(serverApiUrl()).toBe('http://localhost:3001');
  });

  it('defaults to localhost when nothing set', () => {
    expect(serverApiUrl()).toBe('http://localhost:3001');
  });
});

describe('getSetupStatus', () => {
  it('queries the API_URL base when set', async () => {
    process.env['API_URL'] = 'http://api:3001';
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ data: { configured: true }, error: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSetupStatus()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api:3001/api/setup/status',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('returns false when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(getSetupStatus()).resolves.toBe(false);
  });
});
