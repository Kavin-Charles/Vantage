import { apiFetch } from '@/modules/shared/lib/api';

export interface Project {
  id: string; workspace_id: string; name: string; description: string | null;
  cover_image: string | null; color: string | null; status: string; health: string;
  start_date: string | null; end_date: string | null; budget: string | null;
  created_by: string; created_at: string; updated_at: string;
}
export interface ProjectWithProgress extends Project { progress: number }
export interface TaskStatus { id: string; project_id: string; name: string; color: string; position: number; is_done: boolean }
export interface Task {
  id: string; project_id: string; parent_id: string | null; status_id: string; title: string;
  description: string | null; priority: string; due_date: string | null; start_date: string | null;
  estimate_hours: string | null; estimated_minutes: number | null;
  client_visible: boolean; position: number; created_at: string; updated_at: string;
}
export interface TaskWithAssignees extends Task { assignees: { id: string; name: string; email: string }[] }
export interface Comment { id: string; task_id: string; body: string | null; parent_id: string | null; created_at: string; author_name: string | null }
export interface ProjectMember { id: string; project_id: string; user_id: string; role: string; joined_at: string; name: string | null; email: string | null }

export interface TaskLabel {
  id: string; project_id: string; name: string; color: string;
}

export interface Milestone {
  id: string; project_id: string; name: string; description: string | null;
  due_date: string; status: string; client_visible: boolean; position: number;
}

export interface CreateTaskBody {
  title: string;
  status_id?: string;
  priority?: string;
  assignee_ids?: string[];
  due_date?: string | null;
}

export const pmApi = {
  listLabels: (token: string, projectId: string) =>
    apiFetch<{ data: TaskLabel[] }>(`/api/projects/${projectId}/labels`, { token }),
  createLabel: (token: string, projectId: string, body: { name: string; color: string }) =>
    apiFetch<{ data: TaskLabel }>(`/api/projects/${projectId}/labels`, { token, method: 'POST', body: JSON.stringify(body) }),
  updateLabel: (token: string, projectId: string, labelId: string, body: Partial<TaskLabel>) =>
    apiFetch<{ data: TaskLabel }>(`/api/projects/${projectId}/labels/${labelId}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  deleteLabel: (token: string, projectId: string, labelId: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/labels/${labelId}`, { token, method: 'DELETE' }),
  listMilestones: (token: string, projectId: string) =>
    apiFetch<{ data: Milestone[] }>(`/api/projects/${projectId}/milestones`, { token }),
  createMilestone: (token: string, projectId: string, body: { name: string; due_date: string; description?: string; client_visible?: boolean }) =>
    apiFetch<{ data: Milestone }>(`/api/projects/${projectId}/milestones`, { token, method: 'POST', body: JSON.stringify(body) }),
  updateMilestone: (token: string, projectId: string, milestoneId: string, body: Partial<Milestone>) =>
    apiFetch<{ data: Milestone }>(`/api/projects/${projectId}/milestones/${milestoneId}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
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
    apiFetch<{ data: TaskWithAssignees[] }>(`/api/projects/${projectId}/tasks${params ? '?' + new URLSearchParams(params) : ''}`, { token }),
  getTask: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: TaskWithAssignees }>(`/api/projects/${projectId}/tasks/${taskId}`, { token }),
  createTask: (token: string, projectId: string, body: CreateTaskBody) =>
    apiFetch<{ data: Task }>(`/api/projects/${projectId}/tasks`, { token, method: 'POST', body: JSON.stringify(body) }),
  updateTask: (token: string, projectId: string, taskId: string, body: Partial<Task>) =>
    apiFetch<{ data: Task }>(`/api/projects/${projectId}/tasks/${taskId}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  deleteTask: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/tasks/${taskId}`, { token, method: 'DELETE' }),
  listComments: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: Comment[] }>(`/api/projects/${projectId}/tasks/${taskId}/comments`, { token }),
  createComment: (token: string, projectId: string, taskId: string, body: string) =>
    apiFetch<{ data: Comment }>(`/api/projects/${projectId}/tasks/${taskId}/comments`, { token, method: 'POST', body: JSON.stringify({ body }) }),
  listMembers: (token: string, projectId: string) =>
    apiFetch<{ data: ProjectMember[] }>(`/api/projects/${projectId}/members`, { token }),
};
