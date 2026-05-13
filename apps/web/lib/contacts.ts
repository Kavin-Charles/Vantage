import { apiFetch } from './api';
import type { Contact } from '@vantage/types';

export interface ContactsResponse {
  data: Contact[];
  total: number;
  page: number;
  per_page: number;
  error: null;
}

export interface ContactResponse {
  data: Contact;
  error: null;
}

export async function listContacts(token: string, params?: Record<string, string>): Promise<ContactsResponse> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch(`/api/contacts${qs}`, { token });
}

export async function createContact(token: string, body: Partial<Contact>): Promise<ContactResponse> {
  return apiFetch('/api/contacts', { method: 'POST', body: JSON.stringify(body), token });
}

export async function updateContact(token: string, id: string, body: Partial<Contact>): Promise<ContactResponse> {
  return apiFetch(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body), token });
}

export async function deleteContact(token: string, id: string): Promise<void> {
  return apiFetch(`/api/contacts/${id}`, { method: 'DELETE', token });
}
