import { apiFetch } from './core';
import type { Company } from '@vencore/types';

export async function listCompanies(token: string): Promise<{ data: Company[]; total: number; page: number; per_page: number; error: null }> {
  return apiFetch<{ data: Company[]; total: number; page: number; per_page: number; error: null }>(
    '/api/companies',
    { token },
  );
}

export async function createCompany(token: string, body: Partial<Company>): Promise<{ data: Company; error: null }> {
  return apiFetch<{ data: Company; error: null }>('/api/companies', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function updateCompany(token: string, id: string, body: Partial<Company>): Promise<{ data: Company; error: null }> {
  return apiFetch<{ data: Company; error: null }>(`/api/companies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}
