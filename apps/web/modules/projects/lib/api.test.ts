import { describe, it, expect, vi } from 'vitest';

vi.mock('@/modules/shared/lib/api', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '@/modules/shared/lib/api';
import { pmApi } from './api';

describe('pmApi.reorderTask', () => {
  it('posts to the reorder endpoint with status_id and after_task_id', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'task-1', position: 150 } });

    await pmApi.reorderTask('tok', 'project-1', 'task-1', { status_id: 'status-1', after_task_id: 'task-0' });

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/tasks/task-1/reorder',
      expect.objectContaining({
        token: 'tok',
        method: 'POST',
        body: JSON.stringify({ status_id: 'status-1', after_task_id: 'task-0' }),
      }),
    );
  });
});

describe('pmApi recurring rules', () => {
  it('lists recurring rules for a project', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [{ id: 'rule-1' }] });

    const res = await pmApi.listRecurringRules('tok', 'project-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/recurring-rules', { token: 'tok' });
    expect(res.data).toHaveLength(1);
  });

  it('creates a recurring rule', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'rule-1', frequency: 'WEEKLY' } });

    await pmApi.createRecurringRule('tok', 'project-1', { title: 'Weekly check-in', frequency: 'WEEKLY', interval: 1 });

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/recurring-rules',
      expect.objectContaining({ token: 'tok', method: 'POST' }),
    );
  });

  it('deletes a recurring rule', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });

    await pmApi.deleteRecurringRule('tok', 'project-1', 'rule-1');

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/recurring-rules/rule-1',
      expect.objectContaining({ token: 'tok', method: 'DELETE' }),
    );
  });
});
