import { apiFetch } from './core';

export interface InviteInfo {
  email: string;
  role: string;
  workspaceName: string;
}

export async function createInvite(
  token: string,
  body: { email: string; role?: 'admin' | 'member' },
): Promise<{ data: { inviteId: string; email: string }; error: null }> {
  return apiFetch('/api/invites', { method: 'POST', body: JSON.stringify(body), token });
}

export async function createUserDirect(
  token: string,
  body: { name: string; email: string; password: string; role?: 'admin' | 'member' },
): Promise<{ data: { user: { id: string; name: string; email: string; role: string } }; error: null }> {
  return apiFetch('/api/invites', { method: 'POST', body: JSON.stringify(body), token });
}

export async function getInviteInfo(token: string): Promise<{ data: InviteInfo; error: null }> {
  return apiFetch(`/api/invites/accept/${token}`);
}

export async function acceptInvite(
  token: string,
  body: { name: string; password: string },
): Promise<{ data: { email: string }; error: null }> {
  return apiFetch(`/api/invites/accept/${token}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
