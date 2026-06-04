import { apiFetch } from './core';
import type { User, Workspace } from '@vencore/types';

export interface MeResponse {
  data: {
    user: User;
    workspace: Workspace & { logo_url?: string | null };
  };
  error: null;
}

export async function getMe(token?: string): Promise<MeResponse> {
  return apiFetch('/api/me', token ? { token } : {});
}

export type PushPlatform = 'ios' | 'android';

export interface PushPreferences {
  alerts_critical?: boolean;
  alerts_warning?: boolean;
  tasks_due?: boolean;
  deals_assigned?: boolean;
  contacts_assigned?: boolean;
}

export async function registerPushToken(
  token: string,
  pushToken: string,
  platform: PushPlatform,
): Promise<{ data: { ok: boolean }; error: null }> {
  return apiFetch('/api/me/push-token', {
    method: 'POST',
    body: JSON.stringify({ token: pushToken, platform }),
    token,
  });
}

export async function unregisterPushToken(
  token: string,
  pushToken: string,
): Promise<{ data: { ok: boolean }; error: null }> {
  return apiFetch('/api/me/push-token', {
    method: 'DELETE',
    body: JSON.stringify({ token: pushToken }),
    token,
  });
}

export async function updatePushPreferences(
  token: string,
  pushToken: string,
  preferences: PushPreferences,
): Promise<{ data: { ok: boolean }; error: null }> {
  return apiFetch('/api/me/push-token', {
    method: 'PATCH',
    body: JSON.stringify({ token: pushToken, preferences }),
    token,
  });
}
