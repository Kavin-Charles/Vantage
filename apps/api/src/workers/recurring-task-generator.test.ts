import { describe, it, expect, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'

describe('runRecurringTaskGeneration', () => {
  it('creates a task from a due rule and advances next_run_at', async () => {
    const dueRule = {
      id: 'rule-1', project_id: 'project-1', title: 'Weekly review',
      description: 'Check progress', status_id: null, priority: 'MEDIUM',
      assignee_ids: JSON.stringify(['user-1']), frequency: 'WEEKLY', interval: 1,
      next_run_at: new Date('2026-06-01T00:00:00Z'), is_active: true, created_by: 'user-1',
    }

    const ruleSelectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([dueRule]),
    }
    const statusSelectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: 'status-todo' }),
    }
    const taskInsertChain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'task-new-1', title: 'Weekly review' }),
    }
    const assigneeInsertChain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflict: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    }
    const ruleUpdateChain = {
      updateTable: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    }
    const activityInsertChain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    }
    const projectSelectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ workspace_id: 'ws-1' }),
    }

    const trx = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'project_task_statuses') return statusSelectChain
        return projectSelectChain
      }),
      insertInto: vi.fn((table: string) => {
        if (table === 'project_tasks') return taskInsertChain
        if (table === 'project_task_assignees') return assigneeInsertChain
        return activityInsertChain
      }),
      updateTable: vi.fn(() => ruleUpdateChain),
    }
    const db = {
      selectFrom: vi.fn(() => ruleSelectChain),
      insertInto: vi.fn(() => activityInsertChain),
      transaction: vi.fn().mockReturnValue({ execute: (cb: (t: unknown) => Promise<void>) => cb(trx) }),
    } as unknown as Kysely<Database>

    const { runRecurringTaskGeneration } = await import('./recurring-task-generator')
    await runRecurringTaskGeneration(db)

    expect(taskInsertChain.values).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1', title: 'Weekly review', priority: 'MEDIUM',
    }))
    expect(assigneeInsertChain.values).toHaveBeenCalledWith([{ task_id: 'task-new-1', user_id: 'user-1' }])
    expect(ruleUpdateChain.set).toHaveBeenCalledWith(expect.objectContaining({
      next_run_at: new Date('2026-06-08T00:00:00Z'),
    }))
  })

  it('skips rules whose next_run_at is in the future', async () => {
    const ruleSelectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    }
    const db = { selectFrom: vi.fn(() => ruleSelectChain) } as unknown as Kysely<Database>

    const { runRecurringTaskGeneration } = await import('./recurring-task-generator')
    await runRecurringTaskGeneration(db)

    expect(ruleSelectChain.where).toHaveBeenCalledWith('is_active', '=', true)
    expect(ruleSelectChain.where).toHaveBeenCalledWith('next_run_at', '<=', expect.any(Date))
  })
})
