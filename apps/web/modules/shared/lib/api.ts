import { configure, apiFetch } from '@vencore/api-client';

// Use relative URLs so Next.js rewrite proxies /api/* → internal API container
configure('');

export { apiFetch };

export function getWsUrl(path: string): string {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${path}`;
  }
  const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  return apiBase.replace(/^http/, 'ws') + path;
}
