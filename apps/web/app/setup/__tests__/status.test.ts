import { describe, it, expect, vi } from 'vitest';
import { getSetupStatus, resolveApiUrl } from '../status';

const jsonResponse = (body: unknown) =>
  ({ json: async () => body }) as Response;

describe('resolveApiUrl', () => {
  it('prefers API_URL over NEXT_PUBLIC_API_URL', () => {
    expect(resolveApiUrl({ API_URL: 'http://api:3001', NEXT_PUBLIC_API_URL: 'https://app.example.com' })).toBe('http://api:3001');
  });

  it('falls back to NEXT_PUBLIC_API_URL', () => {
    expect(resolveApiUrl({ NEXT_PUBLIC_API_URL: 'https://app.example.com' })).toBe('https://app.example.com');
  });

  it('defaults to localhost:3001', () => {
    expect(resolveApiUrl({})).toBe('http://localhost:3001');
  });
});

describe('getSetupStatus', () => {
  it('returns configured when API reports configured', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { configured: true }, error: null }));
    expect(await getSetupStatus(fetchFn, {})).toBe('configured');
  });

  it('returns unconfigured when API reports not configured', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { configured: false }, error: null }));
    expect(await getSetupStatus(fetchFn, {})).toBe('unconfigured');
  });

  it('returns unreachable when the fetch fails', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await getSetupStatus(fetchFn, {})).toBe('unreachable');
  });

  it('returns unreachable when the response is not valid JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ json: async () => { throw new Error('bad json'); } } as unknown as Response);
    expect(await getSetupStatus(fetchFn, {})).toBe('unreachable');
  });

  it('calls the status endpoint on the resolved API URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { configured: true }, error: null }));
    await getSetupStatus(fetchFn, { API_URL: 'http://api:3001' });
    expect(fetchFn).toHaveBeenCalledWith('http://api:3001/api/setup/status', expect.objectContaining({ cache: 'no-store' }));
  });
});
