import { apiFetch } from './core';
import type { ContactTag } from '@vencore/types';

export async function listContactTags(token: string): Promise<{ data: ContactTag[]; error: null }> {
  return apiFetch('/api/contact-tags', { token });
}

export async function createContactTag(
  token: string,
  body: { name: string; color?: string },
): Promise<{ data: ContactTag; error: null }> {
  return apiFetch('/api/contact-tags', { method: 'POST', body: JSON.stringify(body), token });
}

export async function deleteContactTag(token: string, id: string): Promise<{ data: { id: string }; error: null }> {
  return apiFetch(`/api/contact-tags/${id}`, { method: 'DELETE', token });
}

export async function attachContactTag(
  token: string,
  contactId: string,
  tagId: string,
): Promise<{ data: { id: string }; error: null }> {
  return apiFetch(`/api/contacts/${contactId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tag_id: tagId }),
    token,
  });
}

export async function detachContactTag(
  token: string,
  contactId: string,
  tagId: string,
): Promise<{ data: { id: string }; error: null }> {
  return apiFetch(`/api/contacts/${contactId}/tags/${tagId}`, { method: 'DELETE', token });
}
