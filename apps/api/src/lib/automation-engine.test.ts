import { describe, it, expect, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { executeActions } from './automation-engine'

function buildChain(overrides: Record<string, unknown> = {}) {
  return {
    selectFrom: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    insertInto: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflict: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    executeTakeFirstOrThrow: vi.fn().mockResolvedValue({}),
    ...overrides,
  }
}

describe('executeActions: create_task', () => {
  it('creates a task using the project default status when none is specified', async () => {
    const statusChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ id: 'status-todo' }) })
    const taskChain = buildChain({ executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'task-new-1' }) })
    const workspaceChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ workspace_id: 'ws-1' }) })
    const activityChain = buildChain()

    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'project_task_statuses') return statusChain
        if (table === 'projects') return workspaceChain
        return buildChain()
      }),
      insertInto: vi.fn((table: string) => {
        if (table === 'project_tasks') return taskChain
        if (table === 'activities') return activityChain
        return buildChain()
      }),
    } as unknown as Kysely<Database>

    await executeActions(
      db, 'rule-1', 'project-1',
      [{ type: 'create_task', title: 'Auto-generated review' }],
      { type: 'milestone_completed', projectId: 'project-1', milestoneId: 'm-1' },
      'creator-1',
    )

    expect(taskChain.values).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1', status_id: 'status-todo', title: 'Auto-generated review', created_by: 'creator-1',
    }))
  })

  it('assigns the listed users when assignee_ids is set', async () => {
    const taskChain = buildChain({ executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'task-new-1' }) })
    const assigneeChain = buildChain()
    const workspaceChain = buildChain({ executeTakeFirst: vi.fn().mockResolvedValue({ workspace_id: 'ws-1' }) })

    const db = {
      selectFrom: vi.fn((table: string) => (table === 'projects' ? workspaceChain : buildChain())),
      insertInto: vi.fn((table: string) => {
        if (table === 'project_tasks') return taskChain
        if (table === 'project_task_assignees') return assigneeChain
        return buildChain()
      }),
    } as unknown as Kysely<Database>

    await executeActions(
      db, 'rule-1', 'project-1',
      [{ type: 'create_task', title: 'Review release', status_id: 'status-1', assignee_ids: ['user-2'] }],
      { type: 'milestone_completed', projectId: 'project-1', milestoneId: 'm-1' },
      'creator-1',
    )

    expect(assigneeChain.values).toHaveBeenCalledWith({ task_id: 'task-new-1', user_id: 'user-2' })
  })
})

describe('executeActions: set_custom_field', () => {
  it('upserts a custom field value for the event task', async () => {
    const fieldChain = buildChain()
    const db = { insertInto: vi.fn(() => fieldChain) } as unknown as Kysely<Database>

    await executeActions(
      db, 'rule-1', 'project-1',
      [{ type: 'set_custom_field', custom_field_id: 'field-1', value: 'High' }],
      { type: 'task_status_changed', projectId: 'project-1', taskId: 'task-1', to_status_id: 'status-done' },
      'creator-1',
    )

    expect(fieldChain.values).toHaveBeenCalledWith({ task_id: 'task-1', custom_field_id: 'field-1', value: 'High' })
  })

  it('does nothing when the event has no taskId', async () => {
    const fieldChain = buildChain()
    const db = { insertInto: vi.fn(() => fieldChain) } as unknown as Kysely<Database>

    await executeActions(
      db, 'rule-1', 'project-1',
      [{ type: 'set_custom_field', custom_field_id: 'field-1', value: 'High' }],
      { type: 'milestone_completed', projectId: 'project-1', milestoneId: 'm-1' },
      'creator-1',
    )

    expect(fieldChain.values).not.toHaveBeenCalled()
  })
})
