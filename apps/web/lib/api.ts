import { configure, apiFetch } from '@vantage/api-client';

// Use relative URLs so Next.js rewrite proxies /api/* → internal API container
configure('');

export { apiFetch };
