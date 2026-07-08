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
