// apps/mobile/lib/api.ts
import { configure, apiFetch } from '@vantage/api-client';
import type { Deal } from '@vantage/types';

configure(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001');

export * from '@vantage/api-client';

/**
 * Fetch all deals as a flat list without requiring a pipeline_id.
 * Returns at most 200 deals.
 */
export async function fetchAllDeals(token: string): Promise<{ data: Deal[] }> {
  return apiFetch<{ data: Deal[] }>('/api/deals?per_page=200', { token });
}
