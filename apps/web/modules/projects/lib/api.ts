import { apiFetch } from '@/modules/shared/lib/api';

export interface CRMContact { id: string; name: string; email: string; phone: string | null; status: string; last_contacted_at: string | null }
export interface CRMCompany { id: string; name: string; industry: string | null; location: string | null; website: string | null; employee_count: number | null }
export interface CRMItem { id: string; field_values: Record<string, unknown>; stage_id: string; pipeline_id: string }

export interface Project {
  id: string; workspace_id: string; name: string; description: string | null;
  cover_image: string | null; color: string | null; status: string; health: string;
  start_date: string | null; end_date: string | null; budget: string | null;
  contact_id: string | null; company_id: string | null; source_item_id: string | null;
  created_by: string; created_at: string; updated_at: string;
}
export interface ProjectWithProgress extends Project {
  progress: number;
  crm_contact: CRMContact | null;
  crm_company: CRMCompany | null;
  crm_item: CRMItem | null;
}
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

export interface CustomField {
  id: string; project_id: string; name: string;
  field_type: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'CHECKBOX' | 'URL';
  options: string[] | null; created_at: string;
}

export interface CustomFieldValue {
  task_id: string; custom_field_id: string; value: string | null;
  name: string; field_type: CustomField['field_type'];
}

export interface TimeLog {
  id: string; task_id: string; user_id: string; minutes: number;
  logged_at: string; note: string | null; user_name: string | null;
}

export interface TimeSummary {
  total_minutes: number;
  by_task: { task_id: string; title: string; total_minutes: number }[];
  by_user: { user_id: string; user_name: string | null; total_minutes: number }[];
}

export interface AutomationTrigger {
  type: 'task_status_changed' | 'task_overdue' | 'task_assigned' | 'milestone_completed' |
    'client_approved' | 'client_rejected' | 'sprint_started' | 'sprint_ended';
  to_status_id?: string;
}

export type AutomationAction =
  | { type: 'send_notification'; user_ids: string[]; message: string }
  | { type: 'change_task_status'; status_id: string }
  | { type: 'assign_task'; user_id: string }
  | { type: 'mark_milestone_complete'; milestone_id: string }
  | { type: 'send_webhook'; url: string; payload?: Record<string, unknown> }
  | { type: 'create_task'; title: string; status_id?: string; assignee_ids?: string[] }
  | { type: 'set_custom_field'; custom_field_id: string; value: string };

export interface AutomationRule {
  id: string; project_id: string; name: string; is_active: boolean;
  trigger: AutomationTrigger; actions: AutomationAction[];
  created_by: string; created_at: string;
}

export interface AutomationLog {
  id: string; rule_id: string; rule_name: string;
  triggered_at: string; success: boolean; detail: string | null;
}

export interface RecurringRule {
  id: string; project_id: string; title: string; description: string | null;
  status_id: string | null; priority: string; assignee_ids: string[] | null;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'; interval: number;
  next_run_at: string; is_active: boolean; created_by: string;
  created_at: string; updated_at: string;
}

export interface CreateRecurringRuleBody {
  title: string;
  description?: string;
  status_id?: string;
  priority?: string;
  assignee_ids?: string[];
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
}

export interface CreateTaskBody {
  title: string;
  status_id?: string;
  priority?: string;
  assignee_ids?: string[];
  due_date?: string | null;
  parent_id?: string;
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
  createProject: (token: string, body: { name: string; color?: string; start_date?: string; end_date?: string; contact_id?: string; company_id?: string; source_item_id?: string }) =>
    apiFetch<{ data: Project }>('/api/projects', { token, method: 'POST', body: JSON.stringify(body) }),
  updateProject: (token: string, id: string, body: Partial<Project & { contact_id?: string | null; company_id?: string | null; source_item_id?: string | null }>) =>
    apiFetch<{ data: Project }>(`/api/projects/${id}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  getCRMActivity: (token: string, projectId: string, params?: { page?: number; limit?: number }) =>
    apiFetch<{ data: unknown[] }>(`/api/projects/${projectId}/crm-activity${params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])) : ''}`, { token }),
  searchContacts: (token: string, search: string) =>
    apiFetch<{ data: { id: string; name: string; email: string; status: string }[] }>(`/api/contacts?search=${encodeURIComponent(search)}&limit=10`, { token }),
  searchCompanies: (token: string, search: string) =>
    apiFetch<{ data: { id: string; name: string; industry: string | null }[] }>(`/api/companies?search=${encodeURIComponent(search)}&per_page=10`, { token }),
  searchItems: (token: string, search: string) =>
    apiFetch<{ data: { id: string; field_values: Record<string, unknown>; pipeline_name: string; stage_name: string }[] }>(`/api/items?search=${encodeURIComponent(search)}&limit=10`, { token }),
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
  reorderTask: (token: string, projectId: string, taskId: string, body: { status_id?: string; after_task_id?: string | null }) =>
    apiFetch<{ data: Task }>(`/api/projects/${projectId}/tasks/${taskId}/reorder`, { token, method: 'POST', body: JSON.stringify(body) }),
  listRecurringRules: (token: string, projectId: string) =>
    apiFetch<{ data: RecurringRule[] }>(`/api/projects/${projectId}/recurring-rules`, { token }),
  createRecurringRule: (token: string, projectId: string, body: CreateRecurringRuleBody) =>
    apiFetch<{ data: RecurringRule }>(`/api/projects/${projectId}/recurring-rules`, { token, method: 'POST', body: JSON.stringify(body) }),
  updateRecurringRule: (token: string, projectId: string, ruleId: string, body: Partial<CreateRecurringRuleBody & { is_active: boolean }>) =>
    apiFetch<{ data: RecurringRule }>(`/api/projects/${projectId}/recurring-rules/${ruleId}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  deleteRecurringRule: (token: string, projectId: string, ruleId: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/recurring-rules/${ruleId}`, { token, method: 'DELETE' }),
  listComments: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: Comment[] }>(`/api/projects/${projectId}/tasks/${taskId}/comments`, { token }),
  createComment: (token: string, projectId: string, taskId: string, body: string) =>
    apiFetch<{ data: Comment }>(`/api/projects/${projectId}/tasks/${taskId}/comments`, { token, method: 'POST', body: JSON.stringify({ body }) }),
  listMembers: (token: string, projectId: string) =>
    apiFetch<{ data: ProjectMember[] }>(`/api/projects/${projectId}/members`, { token }),
  listCustomFields: (token: string, projectId: string) =>
    apiFetch<{ data: CustomField[] }>(`/api/projects/${projectId}/custom-fields`, { token }),
  createCustomField: (token: string, projectId: string, body: { name: string; field_type: CustomField['field_type']; options?: string[] }) =>
    apiFetch<{ data: CustomField }>(`/api/projects/${projectId}/custom-fields`, { token, method: 'POST', body: JSON.stringify(body) }),
  deleteCustomField: (token: string, projectId: string, fieldId: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/custom-fields/${fieldId}`, { token, method: 'DELETE' }),
  listTaskFieldValues: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: CustomFieldValue[] }>(`/api/projects/${projectId}/tasks/${taskId}/field-values`, { token }),
  upsertTaskFieldValue: (token: string, projectId: string, taskId: string, body: { custom_field_id: string; value: string | number | boolean | null }) =>
    apiFetch<{ data: { task_id: string; custom_field_id: string; value: string | null } }>(`/api/projects/${projectId}/tasks/${taskId}/field-values`, { token, method: 'POST', body: JSON.stringify(body) }),
  listTimeLogs: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: TimeLog[] }>(`/api/projects/${projectId}/tasks/${taskId}/time-logs`, { token }),
  createTimeLog: (token: string, projectId: string, taskId: string, body: { minutes: number; logged_at?: string; note?: string }) =>
    apiFetch<{ data: TimeLog }>(`/api/projects/${projectId}/tasks/${taskId}/time-logs`, { token, method: 'POST', body: JSON.stringify(body) }),
  deleteTimeLog: (token: string, projectId: string, taskId: string, logId: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/tasks/${taskId}/time-logs/${logId}`, { token, method: 'DELETE' }),
  getTimeSummary: (token: string, projectId: string) =>
    apiFetch<{ data: TimeSummary }>(`/api/projects/${projectId}/time-summary`, { token }),
  listAutomationRules: (token: string, projectId: string) =>
    apiFetch<{ data: AutomationRule[] }>(`/api/projects/${projectId}/automations`, { token }),
  createAutomationRule: (token: string, projectId: string, body: { name: string; trigger: AutomationTrigger; actions: AutomationAction[]; is_active?: boolean }) =>
    apiFetch<{ data: AutomationRule }>(`/api/projects/${projectId}/automations`, { token, method: 'POST', body: JSON.stringify(body) }),
  updateAutomationRule: (token: string, projectId: string, ruleId: string, body: Partial<{ name: string; trigger: AutomationTrigger; actions: AutomationAction[]; is_active: boolean }>) =>
    apiFetch<{ data: AutomationRule }>(`/api/projects/${projectId}/automations/${ruleId}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  deleteAutomationRule: (token: string, projectId: string, ruleId: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/automations/${ruleId}`, { token, method: 'DELETE' }),
  listAutomationLogs: (token: string, projectId: string) =>
    apiFetch<{ data: AutomationLog[] }>(`/api/projects/${projectId}/automation-logs`, { token }),
};
