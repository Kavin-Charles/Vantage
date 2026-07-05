import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/push-notify', () => ({ sendPush: vi.fn().mockResolvedValue(undefined) }));

import { notify } from '../lib/notify';
import { sendPush } from '../lib/push-notify';

function buildChain(overrides: Record<string, unknown> = {}) {
  return {
    insertInto: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
    selectFrom: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    ...overrides,
  };
}

describe('notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a notification row', async () => {
    const notifChain = buildChain();
    const tokenChain = buildChain({ execute: vi.fn().mockResolvedValue([]) });
    const db = {
      insertInto: vi.fn(() => notifChain),
      selectFrom: vi.fn(() => tokenChain),
    } as any;

    await notify(db, {
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'pm_task_assigned',
      title: 'New task assigned',
      body: 'You were assigned "Ship feature"',
      resourceType: 'projects',
      resourceId: 'task-1',
    });

    expect(db.insertInto).toHaveBeenCalledWith('notifications');
    expect(notifChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-1',
        user_id: 'user-1',
        type: 'pm_task_assigned',
        title: 'New task assigned',
        resource_type: 'projects',
        resource_id: 'task-1',
      }),
    );
  });

  it('sends a push notification when the user has an eligible token', async () => {
    const notifChain = buildChain();
    const tokenChain = buildChain({
      execute: vi.fn().mockResolvedValue([{ token: 'ExponentPushToken[abc]', preferences: {} }]),
    });
    const db = {
      insertInto: vi.fn(() => notifChain),
      selectFrom: vi.fn(() => tokenChain),
    } as any;

    await notify(db, {
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'pm_task_assigned',
      title: 'New task assigned',
      body: 'You were assigned "Ship feature"',
      resourceType: 'projects',
      resourceId: 'task-1',
    });

    expect(sendPush).toHaveBeenCalledWith(['ExponentPushToken[abc]'], 'New task assigned', 'You were assigned "Ship feature"');
  });

  it('skips push when the user disabled pm_assigned preference', async () => {
    const notifChain = buildChain();
    const tokenChain = buildChain({
      execute: vi.fn().mockResolvedValue([{ token: 'ExponentPushToken[abc]', preferences: { pm_assigned: false } }]),
    });
    const db = {
      insertInto: vi.fn(() => notifChain),
      selectFrom: vi.fn(() => tokenChain),
    } as any;

    await notify(db, {
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'pm_task_assigned',
      title: 'New task assigned',
      body: 'You were assigned "Ship feature"',
      resourceType: 'projects',
      resourceId: 'task-1',
    });

    expect(sendPush).not.toHaveBeenCalled();
  });

  it('never throws when the insert fails', async () => {
    const notifChain = buildChain({ execute: vi.fn().mockRejectedValue(new Error('db down')) });
    const db = {
      insertInto: vi.fn(() => notifChain),
      selectFrom: vi.fn(() => buildChain({ execute: vi.fn().mockResolvedValue([]) })),
    } as any;

    await expect(
      notify(db, {
        workspaceId: 'ws-1',
        userId: 'user-1',
        type: 'pm_task_assigned',
        title: 'New task assigned',
        body: 'body',
        resourceType: 'projects',
        resourceId: 'task-1',
      }),
    ).resolves.toBeUndefined();
  });
});
