import { apiFetch } from './core';
import type { Company } from '@vantage/types';

export async function listCompanies(token: string) {
  return apiFetch<{ data: Company[]; total: number; page: number; per_page: number; error: null }>(
    '/api/companies',
    { token },
  );
}

export async function createCompany(token: string, body: Partial<Company>) {
  return apiFetch<{ data: Company; error: null }>('/api/companies', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function updateCompany(token: string, id: string, body: Partial<Company>) {
  return apiFetch<{ data: Company; error: null }>(`/api/companies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}
