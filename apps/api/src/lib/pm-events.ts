import { EventEmitter } from 'events'

export type PMEvent =
  | { type: 'task_status_changed'; projectId: string; taskId: string; to_status_id: string }
  | { type: 'task_overdue'; projectId: string; taskId: string }
  | { type: 'task_assigned'; projectId: string; taskId: string; userId: string }
  | { type: 'milestone_completed'; projectId: string; milestoneId: string }
  | { type: 'client_approved'; projectId: string; approvalId: string }
  | { type: 'client_rejected'; projectId: string; approvalId: string }
  | { type: 'sprint_started'; projectId: string; sprintId: string }
  | { type: 'sprint_ended'; projectId: string; sprintId: string }

class PMEventEmitter extends EventEmitter {
  emit(event: 'pm', data: PMEvent): boolean
  emit(event: string | symbol, ...args: unknown[]): boolean
  emit(event: string | symbol, ...args: unknown[]): boolean {
    return super.emit(event, ...args)
  }

  on(event: 'pm', listener: (data: PMEvent) => void): this
  on(event: string | symbol, listener: (...args: unknown[]) => void): this
  on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener)
  }
}

export const pmEvents = new PMEventEmitter()
