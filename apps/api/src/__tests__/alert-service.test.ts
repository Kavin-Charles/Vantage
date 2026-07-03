import { describe, it, expect, vi } from 'vitest';
import { createAlert } from '../lib/alert-service';

function buildChain(overrides: Record<string, unknown> = {}) {
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
  it('createAlert accepts resourceType "projects" and inserts a row', async () => {
    const settingsChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue(undefined) });
    const openAlertChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue(undefined) });
    const insertChain = buildChain();

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

  it('createAlert without sourceModuleId works with projects type', async () => {
    const insertChain = buildChain();

    const db = {
      insertInto: vi.fn(() => insertChain),
    } as any;

    await createAlert(db, {
      workspaceId: 'ws-1',
      severity: 'info',
      resourceType: 'projects',
      message: 'Project status updated',
    });

    expect(db.insertInto).toHaveBeenCalledWith('alerts');
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ resource_type: 'projects' }),
    );
  });
});
