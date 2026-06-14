'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { pmApi, type TaskWithAssignees, type TaskStatus } from '@/modules/projects/lib/api';
import { TaskDetailPanel } from '@/modules/projects/components/TaskDetailPanel';
import { AvatarGroup } from '@/modules/projects/components/AvatarGroup';
import { TaskCreateModal } from '@/modules/projects/components/TaskCreateModal';

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'var(--text3)', MEDIUM: 'var(--amber)', HIGH: 'var(--red)', URGENT: 'var(--red)',
};

function TaskCard({
  task,
  onClick,
  onDragStart,
}: {
  task: TaskWithAssignees;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  const now = new Date();
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const overdue = dueDate && dueDate < now;

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
        boxShadow: hover ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
        transition: 'background 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.4, flex: 1 }}>
          {task.title}
        </p>
        {task.priority && task.priority !== 'NONE' && (
          <span style={{
            fontFamily: 'DM Sans', fontSize: 10, color: PRIORITY_COLORS[task.priority] ?? 'var(--text3)',
            fontWeight: 700, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.03em',
          }}>
            {task.priority}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {dueDate ? (
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: overdue ? 'var(--red)' : 'var(--text3)', fontWeight: overdue ? 600 : 400 }}>
            {dueDate.toLocaleDateString()}
          </span>
        ) : <span />}
        {task.assignees.length > 0 && (
          <AvatarGroup assignees={task.assignees} size={22} max={3} />
        )}
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
  const [createForStatus, setCreateForStatus] = useState<string | null>(null);

  const { data: statuses = [] } = useQuery<TaskStatus[]>({
    queryKey: ['statuses', projectId],
    queryFn: async () => {
      const res = await pmApi.listStatuses(await getToken(), projectId);
      return res.data ?? [];
    },
    enabled: !!projectId,
  });

  const { data: tasks = [] } = useQuery<TaskWithAssignees[]>({
    queryKey: ['tasks', projectId],
    queryFn: async () => {
      const res = await pmApi.listTasks(await getToken(), projectId);
      return res.data ?? [];
    },
    enabled: !!projectId,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ taskId, patch }: { taskId: string; patch: Partial<TaskWithAssignees> }) => {
      const token = await getToken();
      return pmApi.updateTask(token, projectId, taskId, patch);
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

  async function openTask(task: TaskWithAssignees) {
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
              style={{ width: 270, background: 'var(--bg)', borderRadius: 14, padding: 12, flexShrink: 0 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
                <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{status.name}</span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', borderRadius: 10, padding: '1px 7px' }}>
                  {columnTasks.length}
                </span>
              </div>

              {columnTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => void openTask(task)}
                  onDragStart={() => setDraggedTaskId(task.id)}
                />
              ))}

              <button
                onClick={() => setCreateForStatus(status.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: '1px dashed var(--border)', borderRadius: 8,
                  padding: '7px 10px', cursor: 'pointer', color: 'var(--text3)',
                  fontFamily: 'DM Sans', fontSize: 12,
                  transition: 'border-color 0.15s ease, color 0.15s ease',
                }}
              >
                <Icon name="plus" size={13} /> Add task
              </button>
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

      {createForStatus && (
        <TaskCreateModal
          projectId={projectId}
          defaultStatusId={createForStatus}
          onClose={() => setCreateForStatus(null)}
        />
      )}
    </div>
  );
}
