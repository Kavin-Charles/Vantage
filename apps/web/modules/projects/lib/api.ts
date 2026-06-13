import { apiFetch } from '@/modules/shared/lib/api';

export interface Project {
  id: string; workspace_id: string; name: string; description: unknown;
  cover_image: string | null; color: string | null; status: string; health: string;
  start_date: string | null; end_date: string | null; budget: string | null;
  created_by: string; created_at: string; updated_at: string;
}
export interface ProjectWithProgress extends Project { progress: number }
export interface TaskStatus { id: string; project_id: string; name: string; color: string; position: number; is_done: boolean }
export interface Task {
  id: string; project_id: string; parent_id: string | null; status_id: string; title: string;
  description: unknown; priority: string; due_date: string | null; estimate_hours: string | null;
  client_visible: boolean; position: number; created_at: string; updated_at: string;
}
export interface TaskWithAssignees extends Task { assignees: { id: string; name: string; email: string }[] }
export interface Comment { id: string; task_id: string; body: unknown; parent_id: string | null; created_at: string; author_name: string | null }

export const pmApi = {
  listProjects: (token: string, params?: Record<string, string>) =>
    apiFetch<{ data: ProjectWithProgress[] }>(`/api/projects${params ? '?' + new URLSearchParams(params) : ''}`, { token }),
  getProject: (token: string, id: string) =>
    apiFetch<{ data: ProjectWithProgress }>(`/api/projects/${id}`, { token }),
  createProject: (token: string, body: { name: string; color?: string; start_date?: string; end_date?: string }) =>
    apiFetch<{ data: Project }>('/api/projects', { token, method: 'POST', body: JSON.stringify(body) }),
  updateProject: (token: string, id: string, body: Partial<Project>) =>
    apiFetch<{ data: Project }>(`/api/projects/${id}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  deleteProject: (token: string, id: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${id}`, { token, method: 'DELETE' }),
  listStatuses: (token: string, projectId: string) =>
    apiFetch<{ data: TaskStatus[] }>(`/api/projects/${projectId}/tasks/statuses`, { token }),
  listTasks: (token: string, projectId: string, params?: Record<string, string>) =>
    apiFetch<{ data: Task[] }>(`/api/projects/${projectId}/tasks${params ? '?' + new URLSearchParams(params) : ''}`, { token }),
  getTask: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: TaskWithAssignees }>(`/api/projects/${projectId}/tasks/${taskId}`, { token }),
  createTask: (token: string, projectId: string, body: { title: string; status_id: string; priority?: string }) =>
    apiFetch<{ data: Task }>(`/api/projects/${projectId}/tasks`, { token, method: 'POST', body: JSON.stringify(body) }),
  updateTask: (token: string, projectId: string, taskId: string, body: Partial<Task>) =>
    apiFetch<{ data: Task }>(`/api/projects/${projectId}/tasks/${taskId}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  deleteTask: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/tasks/${taskId}`, { token, method: 'DELETE' }),
  listComments: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: Comment[] }>(`/api/projects/${projectId}/tasks/${taskId}/comments`, { token }),
  createComment: (token: string, projectId: string, taskId: string, body: unknown) =>
    apiFetch<{ data: Comment }>(`/api/projects/${projectId}/tasks/${taskId}/comments`, { token, method: 'POST', body: JSON.stringify({ body }) }),
};
