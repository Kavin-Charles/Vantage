'use client';

import type { AutomationRule } from '@/modules/projects/lib/api';

export const TRIGGER_LABELS: Record<string, string> = {
  task_status_changed: 'Task status changes',
  task_overdue: 'Task becomes overdue',
  task_assigned: 'Task is assigned',
  milestone_completed: 'Milestone completed',
  client_approved: 'Client approves',
  client_rejected: 'Client rejects',
  sprint_started: 'Sprint starts',
  sprint_ended: 'Sprint ends',
};

export const ACTION_LABELS: Record<string, string> = {
  send_notification: 'Send notification',
  change_task_status: 'Change task status',
  assign_task: 'Assign task',
  mark_milestone_complete: 'Mark milestone complete',
  send_webhook: 'Send webhook',
  create_task: 'Create task',
  set_custom_field: 'Set custom field',
};

interface Props {
  rule: AutomationRule;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isToggling?: boolean;
}

export function RuleCard({ rule, onToggle, onEdit, onDelete, isToggling }: Props) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10, padding: 16,
      background: 'var(--surface)', display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{rule.name}</span>
          <span style={{
            fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
            textTransform: 'uppercase', letterSpacing: '0.04em',
            background: rule.is_active ? 'var(--green-bg)' : 'var(--surface2)',
            color: rule.is_active ? 'var(--green)' : 'var(--text3)',
          }}>
            {rule.is_active ? 'Active' : 'Paused'}
          </span>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: '0 0 4px' }}>
          When <strong style={{ color: 'var(--text2)' }}>{TRIGGER_LABELS[rule.trigger.type] ?? rule.trigger.type}</strong>
        </p>
        <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)', margin: 0 }}>
          Then {rule.actions.map(a => ACTION_LABELS[a.type] ?? a.type).join(', ')}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onToggle}
          disabled={isToggling}
          style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer' }}
        >
          {rule.is_active ? 'Pause' : 'Activate'}
        </button>
        <button
          type="button"
          onClick={onEdit}
          style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer' }}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--red-bg)', background: 'none', color: 'var(--red)', cursor: 'pointer' }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
