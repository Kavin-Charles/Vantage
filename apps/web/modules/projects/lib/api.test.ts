import { describe, it, expect, vi } from 'vitest';

vi.mock('@/modules/shared/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { pmApi } from './api';
import { apiFetch } from '@/modules/shared/lib/api';

describe('pmApi.getWidgetStats', () => {
  it('fetches /api/projects/widget-stats with the given token', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        active_projects: 3,
        at_risk_projects: 1,
        overdue_tasks: 2,
        upcoming_milestones: [],
      },
      error: null,
    });

    const result = await pmApi.getWidgetStats('token-123');

    expect(apiFetch).toHaveBeenCalledWith('/api/projects/widget-stats', { token: 'token-123' });
    expect(result.data?.active_projects).toBe(3);
  });
});

describe('pmApi custom fields', () => {
  it('lists custom fields for a project', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [{ id: 'field-1' }] });

    const res = await pmApi.listCustomFields('tok', 'project-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/custom-fields', { token: 'tok' });
    expect(res.data).toHaveLength(1);
  });

  it('upserts a task field value', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { task_id: 'task-1', custom_field_id: 'field-1', value: 'High' } });

    await pmApi.upsertTaskFieldValue('tok', 'project-1', 'task-1', { custom_field_id: 'field-1', value: 'High' });

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/tasks/task-1/field-values',
      expect.objectContaining({ token: 'tok', method: 'POST', body: JSON.stringify({ custom_field_id: 'field-1', value: 'High' }) }),
    );
  });
});

describe('pmApi time logs', () => {
  it('creates a time log', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'log-1', minutes: 45 } });

    await pmApi.createTimeLog('tok', 'project-1', 'task-1', { minutes: 45 });

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/tasks/task-1/time-logs',
      expect.objectContaining({ token: 'tok', method: 'POST', body: JSON.stringify({ minutes: 45 }) }),
    );
  });

  it('fetches the project time summary', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { total_minutes: 90, by_task: [], by_user: [] } });

    const res = await pmApi.getTimeSummary('tok', 'project-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/time-summary', { token: 'tok' });
    expect(res.data.total_minutes).toBe(90);
  });
});

describe('pmApi automation', () => {
  it('creates an automation rule', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'rule-1' } });

    await pmApi.createAutomationRule('tok', 'project-1', {
      name: 'Notify on overdue',
      trigger: { type: 'task_overdue' },
      actions: [{ type: 'send_notification', user_ids: [], message: 'hi' }],
    });

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/automations',
      expect.objectContaining({ token: 'tok', method: 'POST' }),
    );
  });

  it('lists automation logs', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [{ id: 'log-1', rule_name: 'Notify on overdue' }] });

    const res = await pmApi.listAutomationLogs('tok', 'project-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/automation-logs', { token: 'tok' });
    expect(res.data[0].rule_name).toBe('Notify on overdue');
  });
});
