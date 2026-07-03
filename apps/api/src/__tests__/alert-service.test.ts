import { describe, it, expect, vi } from 'vitest';
import { createAlert } from '../lib/alert-service';

function buildQueryChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    selectFrom: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
    executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return chain;
}

describe('alert-service resourceType: projects', () => {
  it('createAlert inserts a row with resource_type "projects"', async () => {
    const settingsChain = buildQueryChain({
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    });
    const openAlertChain = buildQueryChain({
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    });
    const insertChain = buildQueryChain();

    const db = {
      selectFrom: vi.fn((table: string) =>
        table === 'module_event_settings' ? settingsChain : openAlertChain,
      ),
      insertInto: vi.fn(() => insertChain),
    } as any;

    await createAlert(db, {
      workspaceId: 'ws-1',
      severity: 'warning',
      resourceType: 'projects',
      resourceId: 'project-1',
      message: 'Project at risk: "Launch"',
      messagePrefix: 'Project at risk:',
      sourceModuleId: 'projects',
    });

    expect(db.insertInto).toHaveBeenCalledWith('alerts');
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ resource_type: 'projects' }),
    );
  });

  it('createAlert accepts resourceType "projects" without TypeScript type errors', async () => {
    const settingsChain = buildQueryChain({
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    });
    const openAlertChain = buildQueryChain({
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    });
    const insertChain = buildQueryChain();

    const db = {
      selectFrom: vi.fn((table: string) =>
        table === 'module_event_settings' ? settingsChain : openAlertChain,
      ),
      insertInto: vi.fn(() => insertChain),
    } as any;

    // This test is a compile-time check: if 'projects' were not in AlertResourceType
    // or if the cast to the old union were still present, this would fail to build.
    await expect(
      createAlert(db, {
        workspaceId: 'ws-2',
        severity: 'info',
        resourceType: 'projects',
        message: 'Milestone approaching',
      }),
    ).resolves.toBeUndefined();
  });
});
