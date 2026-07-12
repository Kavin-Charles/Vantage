import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const request = (url: string) => new NextRequest(url);

describe('GET /api/setup/activate', () => {
  it('redirects with a relative Location so the proxy host is preserved', async () => {
    const res = await GET(request('http://localhost:3000/api/setup/activate?from=%2Fpipelines'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('/pipelines');
  });

  it('defaults to / when from is missing', async () => {
    const res = await GET(request('http://localhost:3000/api/setup/activate'));
    expect(res.headers.get('location')).toBe('/');
  });

  it('rejects protocol-relative redirect targets', async () => {
    const res = await GET(request('http://localhost:3000/api/setup/activate?from=%2F%2Fevil.com'));
    expect(res.headers.get('location')).toBe('/');
  });

  it('rejects absolute redirect targets', async () => {
    const res = await GET(request('http://localhost:3000/api/setup/activate?from=https%3A%2F%2Fevil.com'));
    expect(res.headers.get('location')).toBe('/');
  });

  it('sets the setup-done cookie', async () => {
    const res = await GET(request('http://localhost:3000/api/setup/activate?from=%2Fpipelines'));
    const cookie = res.cookies.get('vencore_setup_done');
    expect(cookie?.value).toBe('1');
    expect(cookie?.httpOnly).toBe(true);
  });
});
