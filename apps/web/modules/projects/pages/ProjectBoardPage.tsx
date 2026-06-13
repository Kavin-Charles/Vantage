'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { pmApi, type Task, type TaskWithAssignees, type TaskStatus } from '@/modules/projects/lib/api';
import { TaskDetailPanel } from '@/modules/projects/components/TaskDetailPanel';

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'var(--text3)', MEDIUM: 'var(--amber)', HIGH: 'var(--red)', URGENT: 'var(--red)',
};

function TaskCard({
  task,
  onClick,
  onDragStart,
}: {
  task: Task;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? 'var(--surface2)' : 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 10,
        padding: '10px 12px', cursor: 'pointer', marginBottom: 8,
      }}
    >
      <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', margin: '0 0 8px', lineHeight: 1.4 }}>
        {task.title}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: PRIORITY_COLORS[task.priority] ?? 'var(--text3)', fontWeight: 600 }}>
          {task.priority}
        </span>
        {task.due_date && (
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>
            {new Date(task.due_date).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

function AddTaskInline({ onAdd, loading }: { onAdd: (title: string) => void; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');

  function submit() {
    if (val.trim()) { onAdd(val.trim()); setVal(''); setOpen(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: '1px dashed var(--border)', borderRadius: 8,
          padding: '7px 10px', cursor: 'pointer', color: 'var(--text3)',
          fontFamily: 'DM Sans', fontSize: 12,
        }}
      >
        <Icon name="plus" size={13} /> Add task
      </button>
    );
  }

  return (
    <div>
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
        placeholder="Task title…"
        style={{
          width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
          borderRadius: 8, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)',
          background: 'var(--surface)', outline: 'none', boxSizing: 'border-box', marginBottom: 6,
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={submit}
          disabled={loading || !val.trim()}
          style={{
            background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 7,
            padding: '5px 12px', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer',
            opacity: loading || !val.trim() ? 0.5 : 1,
          }}
        >
          Add
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 7,
            padding: '5px 10px', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer', color: 'var(--text2)',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ProjectBoardPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskWithAssignees | null>(null);

  const { data: statusesData } = useQuery({
    queryKey: ['statuses', projectId],
    queryFn: async () => pmApi.listStatuses(await getToken(), projectId),
    enabled: !!projectId,
  });
  const { data: tasksData } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: async () => pmApi.listTasks(await getToken(), projectId),
    enabled: !!projectId,
  });

  const statuses: TaskStatus[] = statusesData?.data ?? [];
  const tasks: Task[] = tasksData?.data ?? [];

  const updateMutation = useMutation({
    mutationFn: async ({ taskId, patch }: { taskId: string; patch: Partial<Task> }) => {
      const token = await getToken();
      return pmApi.updateTask(token, projectId, taskId, patch);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  const createMutation = useMutation({
    mutationFn: async ({ title, statusId }: { title: string; statusId: string }) => {
      const token = await getToken();
      return pmApi.createTask(token, projectId, { title, status_id: statusId, priority: 'MEDIUM' });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  function handleDrop(e: React.DragEvent, statusId: string) {
    e.preventDefault();
    if (draggedTaskId) {
      updateMutation.mutate({ taskId: draggedTaskId, patch: { status_id: statusId } });
      setDraggedTaskId(null);
    }
  }

  async function openTask(task: Task) {
    const token = await getToken();
    const res = await pmApi.getTask(token, projectId, task.id);
    setSelectedTask(res.data);
  }

  return (
    <div style={{ padding: 20, overflowX: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 'max-content' }}>
        {statuses.map(status => {
          const columnTasks = tasks.filter(t => t.status_id === status.id).sort((a, b) => a.position - b.position);
          return (
            <div
              key={status.id}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, status.id)}
              style={{
                width: 270, background: 'var(--bg)', borderRadius: 14,
                padding: 12, flexShrink: 0,
              }}
            >
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
                <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{status.name}</span>
                <span style={{
                  fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)',
                  background: 'var(--surface2)', borderRadius: 10, padding: '1px 7px',
                }}>
                  {columnTasks.length}
                </span>
              </div>

              {/* Tasks */}
              {columnTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => void openTask(task)}
                  onDragStart={() => setDraggedTaskId(task.id)}
                />
              ))}

              {/* Add task */}
              <AddTaskInline
                loading={createMutation.isPending}
                onAdd={title => createMutation.mutate({ title, statusId: status.id })}
              />
            </div>
          );
        })}

        {statuses.length === 0 && (
          <div style={{ color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 14, padding: '40px 0' }}>
            No statuses configured for this project.
          </div>
        )}
      </div>

      {selectedTask && (
        <TaskDetailPanel
          projectId={projectId}
          task={selectedTask}
          statuses={statuses}
          onClose={() => setSelectedTask(null)}
          onUpdate={patch => setSelectedTask(prev => prev ? { ...prev, ...patch } : null)}
        />
      )}
    </div>
  );
}
