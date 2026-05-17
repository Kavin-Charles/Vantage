import { configure, apiFetch } from '@vantage/api-client';

configure(process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001');

export { apiFetch };
