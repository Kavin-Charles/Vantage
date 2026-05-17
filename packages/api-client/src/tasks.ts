import { apiFetch } from './core';
import type { Task } from '@vantage/types';

export async function listTasks(
  token: string,
  params?: { status?: 'todo' | 'done'; assignee_id?: string },
): Promise<{ data: Task[]; error: null }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.assignee_id) qs.set('assignee_id', params.assignee_id);
  const q = qs.toString();
  return apiFetch<{ data: Task[]; error: null }>(`/api/tasks${q ? `?${q}` : ''}`, { token });
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
