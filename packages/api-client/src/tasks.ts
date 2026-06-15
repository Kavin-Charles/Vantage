import { apiFetch } from './core';
import type { Task } from '@vencore/types';

export async function listTasks(
  token: string,
  params?: { status?: 'todo' | 'done'; assignee_id?: string; contact_id?: string; show_all?: boolean },
): Promise<{ data: Task[]; total: number; error: null }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.assignee_id) qs.set('assignee_id', params.assignee_id);
  if (params?.contact_id) qs.set('contact_id', params.contact_id);
  if (params?.show_all) qs.set('show_all', 'true');
  const q = qs.toString();
  return apiFetch<{ data: Task[]; total: number; error: null }>(`/api/tasks${q ? `?${q}` : ''}`, { token });
}

export async function createTask(
  token: string,
  body: {
    title: string;
    due_date?: string;
    assignee_id?: string;
    contact_id?: string;
    deal_id?: string;
  },
): Promise<{ data: Task; error: null }> {
  return apiFetch<{ data: Task; error: null }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteTask(
  token: string,
  id: string,
): Promise<{ data: { id: string }; error: null }> {
  return apiFetch<{ data: { id: string }; error: null }>(`/api/tasks/${id}`, {
    method: 'DELETE',
    token,
  });
}

export async function updateTask(
  token: string,
  id: string,
  body: { status?: 'todo' | 'done'; title?: string; due_date?: string },
): Promise<{ data: Task; error: null }> {
  return apiFetch<{ data: Task; error: null }>(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}
