import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/alert-service', () => ({ createAlert: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/notify', () => ({ notify: vi.fn().mockResolvedValue(undefined) }));

import { runPmDueAlerts } from './pm-due-alert';
import { createAlert } from '../lib/alert-service';
import { notify } from '../lib/notify';

function buildChain(rows: unknown[]) {
  return {
    selectFrom: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(rows),
  };
}

describe('runPmDueAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an overdue alert for each overdue project task', async () => {
    const taskRows = [{ id: 'task-1', title: 'Ship feature', workspace_id: 'ws-1', project_id: 'project-1' }];
    const milestoneChain = buildChain([]);
    const taskChain = buildChain(taskRows);
    const db = {
      selectFrom: vi.fn((table: string) => (table === 'project_tasks' ? taskChain : milestoneChain)),
    } as any;

    await runPmDueAlerts(db);

    expect(createAlert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ workspaceId: 'ws-1', resourceType: 'projects', resourceId: 'task-1', severity: 'warning' }),
    );
  });

  it('creates an at-risk alert for each milestone due within 2 days that is not completed', async () => {
    const milestoneRows = [{ id: 'milestone-1', name: 'Beta', workspace_id: 'ws-1', project_id: 'project-1' }];
    const taskChain = buildChain([]);
    const milestoneChain = buildChain(milestoneRows);
    const db = {
      selectFrom: vi.fn((table: string) => (table === 'project_tasks' ? taskChain : milestoneChain)),
    } as any;

    await runPmDueAlerts(db);

    expect(createAlert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ workspaceId: 'ws-1', resourceType: 'projects', resourceId: 'milestone-1', severity: 'warning' }),
    );
  });

  it('does nothing when there are no overdue tasks or at-risk milestones', async () => {
    const emptyChain = buildChain([]);
    const db = { selectFrom: vi.fn(() => emptyChain) } as any;

    await runPmDueAlerts(db);

    expect(createAlert).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
