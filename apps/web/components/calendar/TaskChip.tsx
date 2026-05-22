'use client';

import type { Task } from '@vantage/types';

interface TaskChipProps {
  task: Task;
  onClick?: (e: React.MouseEvent) => void;
}

export function TaskChip({ task, onClick }: TaskChipProps) {
  const isOverdue = task.status === 'todo' && task.due_date && new Date(task.due_date) < new Date();
  return (
    <span
      onClick={onClick}
      title={task.title}
      style={{
        display: 'block',
        background: 'transparent',
        color: isOverdue ? 'var(--red)' : 'var(--text2)',
        border: `1px dashed ${isOverdue ? 'var(--red)' : 'var(--border)'}`,
        borderRadius: 4,
        padding: '1px 6px',
        fontSize: 11,
        fontWeight: 500,
        cursor: onClick ? 'pointer' : 'default',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        marginBottom: 2,
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      ✓ {task.title}
    </span>
  );
}
