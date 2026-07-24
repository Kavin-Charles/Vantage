'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/modules/shared/lib/api';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useRecordTasks } from './useRecordTasks';
import { GlassCard, FluidButton, FluidInput, EmptyState, MSIcon } from '@/modules/shared/fluid/ui';
import type { Task } from '@vencore/types';

export function TasksPanel({ contactId }: { contactId: string }) {
  const { data: tasks, isLoading } = useRecordTasks(contactId);
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['record-tasks', 'contact', contactId] });
    void qc.invalidateQueries({ queryKey: ['contact-overview', contactId] });
  };

  const toggleTask = useMutation({
    mutationFn: async (task: Task) => {
      const token = await getToken();
      const newStatus = task.status === 'done' ? 'todo' : 'done';
      return apiFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
        token,
      });
    },
    onSuccess: invalidate,
  });

  const addTask = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          contact_id: contactId,
          title,
          ...(dueDate ? { due_date: dueDate } : {}),
        }),
        token,
      });
    },
    onSuccess: () => {
      setTitle('');
      setDueDate('');
      invalidate();
    },
  });

  const handleAdd = () => {
    if (!title.trim()) return;
    addTask.mutate();
  };

  return (
    <GlassCard>
      <h3 style={{ marginTop: 0, fontFamily: 'var(--fl-font-display)' }}>Tasks</h3>
      {isLoading ? null : !tasks || tasks.length === 0 ? (
        <EmptyState icon="checklist" title="No tasks yet" />
      ) : (
        tasks.map(task => (
          <div
            key={task.id}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--fl-outline-variant)' }}
          >
            <button
              type="button"
              onClick={() => toggleTask.mutate(task)}
              aria-label={task.status === 'done' ? 'Mark as todo' : 'Mark as done'}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: `1px solid ${task.status === 'done' ? 'var(--fl-primary)' : 'var(--fl-outline)'}`,
                background: task.status === 'done' ? 'var(--fl-primary)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                padding: 0,
              }}
            >
              {task.status === 'done' ? <MSIcon name="check" size={14} style={{ color: 'var(--fl-on-primary)' }} /> : null}
            </button>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  textDecoration: task.status === 'done' ? 'line-through' : 'none',
                  color: task.status === 'done' ? 'var(--fl-on-surface-variant)' : 'var(--fl-on-surface)',
                }}
              >
                {task.title}
              </div>
              {task.due_date ? (
                <div style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)' }}>
                  Due {new Date(task.due_date).toLocaleDateString()}
                </div>
              ) : null}
            </div>
          </div>
        ))
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <FluidInput value={title} onChange={setTitle} placeholder="New task…" icon="add_task" />
        </div>
        <div style={{ width: 150 }}>
          <FluidInput value={dueDate} onChange={setDueDate} type="date" placeholder="Due date" />
        </div>
        <FluidButton icon="add" onClick={handleAdd} disabled={!title.trim() || addTask.isPending}>
          Add
        </FluidButton>
      </div>
    </GlassCard>
  );
}
