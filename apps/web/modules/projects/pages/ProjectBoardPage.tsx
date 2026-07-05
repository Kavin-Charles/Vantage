'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';
import { pmApi, type TaskWithAssignees, type TaskStatus } from '@/modules/projects/lib/api';
import { TaskDetailPanel } from '@/modules/projects/components/TaskDetailPanel';
import { AvatarGroup } from '@/modules/projects/components/AvatarGroup';
import { TaskCreateModal } from '@/modules/projects/components/TaskCreateModal';

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'var(--text3)', MEDIUM: 'var(--amber)', HIGH: 'var(--red)', URGENT: 'var(--red)',
};
const PRIORITY_BG: Record<string, string> = {
  LOW: 'var(--surface2)', MEDIUM: 'var(--amber-bg)', HIGH: 'var(--red-bg)', URGENT: 'var(--red-bg)',
};
const PRIORITY_BORDER: Record<string, string> = {
  LOW: '#c8c4bb', MEDIUM: '#f59e0b', HIGH: '#ef4444', URGENT: '#ef4444',
};

function TaskCard({
  task,
  onClick,
  onDragStart,
  onDuplicate,
  onDelete,
  onDropOnCard,
}: {
  task: TaskWithAssignees;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onDropOnCard: (e: React.DragEvent, task: TaskWithAssignees) => void;
}) {
  const [hover, setHover] = useState(false);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const now = new Date();
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const overdue = dueDate && dueDate < now;
  const priorityBorder = task.priority && task.priority !== 'NONE'
    ? PRIORITY_BORDER[task.priority] ?? 'var(--border)'
    : 'var(--border)';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); onDropOnCard(e, task); }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={e => {
        const items: ContextMenuItem[] = [
          { icon: 'open', label: 'Open', onClick },
          { icon: 'edit', label: 'Edit', onClick },
          { icon: 'copy', label: 'Copy ID', onClick: () => navigator.clipboard.writeText(task.id) },
          { type: 'separator' },
          { icon: 'duplicate', label: onDuplicate ? 'Duplicate' : 'Duplicate (coming soon)', disabled: !onDuplicate, onClick: () => onDuplicate?.() },
          ...(onDelete ? [{ type: 'separator' as const }, { icon: 'trash', label: 'Delete', danger: true, onClick: onDelete }] : []),
        ];
        openMenu(e, items);
      }}
      style={{
        background: '#ffffff',
        border: `1px solid ${hover ? priorityBorder : 'var(--border)'}`,
        borderLeft: `3px solid ${priorityBorder}`,
        borderRadius: 10,
        padding: '11px 13px 11px 11px',
        cursor: 'pointer', marginBottom: 8,
        boxShadow: hover ? '0 4px 14px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease, transform 0.12s ease',
        transform: hover ? 'translateY(-1px)' : 'none',
      }}
    >
      {/* Title */}
      <p style={{
        fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
        color: 'var(--text)', margin: '0 0 10px', lineHeight: 1.45,
      }}>
        {task.title}
      </p>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Priority chip */}
        {task.priority && task.priority !== 'NONE' && (
          <span style={{
            fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
            color: PRIORITY_COLORS[task.priority] ?? 'var(--text3)',
            background: PRIORITY_BG[task.priority] ?? 'var(--surface2)',
            borderRadius: 6, padding: '2px 7px',
            textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
          }}>
            {task.priority}
          </span>
        )}

        {/* Due date chip */}
        {dueDate && (
          <span style={{
            fontFamily: 'DM Sans', fontSize: 11,
            color: overdue ? 'var(--red)' : 'var(--text3)',
            background: overdue ? 'var(--red-bg)' : 'var(--surface2)',
            borderRadius: 6, padding: '2px 7px', flexShrink: 0,
            fontWeight: overdue ? 600 : 400,
          }}>
            {overdue ? '⚠ ' : ''}{dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}

        {/* Client visible dot */}
        {task.client_visible && (
          <span title="Client visible" style={{
            fontFamily: 'DM Sans', fontSize: 10, color: 'var(--blue)',
            background: 'var(--blue-bg)', borderRadius: 6, padding: '2px 7px', flexShrink: 0,
          }}>
            Client
          </span>
        )}

        {/* Avatars pushed to end */}
        {task.assignees.length > 0 && (
          <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <AvatarGroup assignees={task.assignees} size={20} max={3} />
          </span>
        )}
      </div>
      <ContextMenu menu={menu} onClose={closeMenu} />
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

  const reorderMutation = useMutation({
    mutationFn: async ({ taskId, statusId, afterTaskId }: { taskId: string; statusId: string; afterTaskId: string | null }) => {
      const token = await getToken();
      return pmApi.reorderTask(token, projectId, taskId, { status_id: statusId, after_task_id: afterTaskId });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  const { ask: askConfirm, el: confirmEl } = useConfirm();

  const duplicateMutation = useMutation({
    mutationFn: async (task: TaskWithAssignees) => {
      const token = await getToken();
      return pmApi.createTask(token, projectId, {
        title: `${task.title} (copy)`,
        status_id: task.status_id,
        priority: task.priority,
        due_date: task.due_date,
        assignee_ids: task.assignees.map(a => a.id),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const token = await getToken();
      return pmApi.deleteTask(token, projectId, taskId);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  function handleDrop(e: React.DragEvent, statusId: string) {
    e.preventDefault();
    if (!draggedTaskId) return;
    const columnTasks = tasks
      .filter(t => t.status_id === statusId && t.id !== draggedTaskId)
      .sort((a, b) => a.position - b.position);
    const lastId = columnTasks.length > 0 ? columnTasks[columnTasks.length - 1]!.id : null;
    reorderMutation.mutate({ taskId: draggedTaskId, statusId, afterTaskId: lastId });
    setDraggedTaskId(null);
  }

  function handleDropOnCard(e: React.DragEvent, targetTask: TaskWithAssignees) {
    if (!draggedTaskId || draggedTaskId === targetTask.id) { setDraggedTaskId(null); return; }
    const columnTasks = tasks
      .filter(t => t.status_id === targetTask.status_id && t.id !== draggedTaskId)
      .sort((a, b) => a.position - b.position);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dropBefore = e.clientY < rect.top + rect.height / 2;
    const idx = columnTasks.findIndex(t => t.id === targetTask.id);
    const afterTaskId = dropBefore ? (idx > 0 ? columnTasks[idx - 1]!.id : null) : targetTask.id;
    reorderMutation.mutate({ taskId: draggedTaskId, statusId: targetTask.status_id, afterTaskId });
    setDraggedTaskId(null);
  }

  async function openTask(task: TaskWithAssignees) {
    const token = await getToken();
    const res = await pmApi.getTask(token, projectId, task.id);
    setSelectedTask(res.data);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      <div style={{
        flex: 1, overflowX: 'auto', overflowY: 'hidden',
        padding: '20px 24px 24px',
      }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', height: '100%', minWidth: 'max-content' }}>
          {statuses.map(status => {
            const columnTasks = tasks.filter(t => t.status_id === status.id).sort((a, b) => a.position - b.position);
            return (
              <div
                key={status.id}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, status.id)}
                style={{
                  width: 290,
                  display: 'flex', flexDirection: 'column',
                  flexShrink: 0,
                  maxHeight: 'calc(100vh - 160px)',
                }}
              >
                {/* Column header — free-floating, not a box */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '0 4px 10px',
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 3,
                    background: status.color, flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
                    color: 'var(--text)', flex: 1, letterSpacing: '-0.01em',
                  }}>
                    {status.name}
                  </span>
                  <span style={{
                    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
                    color: 'var(--text3)', minWidth: 18, textAlign: 'right',
                  }}>
                    {columnTasks.length}
                  </span>
                  <button
                    onClick={() => setCreateForStatus(status.id)}
                    style={{
                      width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      cursor: 'pointer', color: 'var(--text3)',
                      transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.background = status.color;
                      el.style.color = '#fff';
                      el.style.borderColor = status.color;
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.background = 'var(--surface)';
                      el.style.color = 'var(--text3)';
                      el.style.borderColor = 'var(--border)';
                    }}
                  >
                    <Icon name="plus" size={13} />
                  </button>
                </div>

                {/* Scrollable task list */}
                <div style={{
                  flex: 1, overflowY: 'auto',
                  background: 'var(--surface)',
                  borderRadius: 14,
                  border: `1px solid var(--border)`,
                  borderTop: `3px solid ${status.color}`,
                  padding: '10px 10px 6px',
                  display: 'flex', flexDirection: 'column',
                }}>
                  {columnTasks.length === 0 ? (
                    <button
                      onClick={() => setCreateForStatus(status.id)}
                      style={{
                        flex: 1, minHeight: 80,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', gap: 6,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text3)', borderRadius: 10,
                        transition: 'background 0.15s',
                        fontFamily: 'DM Sans', fontSize: 12,
                      }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--surface2)')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'none')}
                    >
                      <Icon name="plus" size={16} />
                      Add first task
                    </button>
                  ) : (
                    <>
                      {columnTasks.map(task => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onClick={() => void openTask(task)}
                          onDragStart={() => setDraggedTaskId(task.id)}
                          onDropOnCard={handleDropOnCard}
                          onDuplicate={() => duplicateMutation.mutate(task)}
                          onDelete={() => askConfirm({
                            title: 'Delete task',
                            message: `Delete "${task.title}"? This cannot be undone.`,
                            confirmLabel: 'Delete',
                            variant: 'danger',
                            onConfirm: () => deleteMutation.mutate(task.id),
                          })}
                        />
                      ))}
                      <button
                        onClick={() => setCreateForStatus(status.id)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                          background: 'none', border: 'none', borderRadius: 8,
                          padding: '7px 8px', cursor: 'pointer', color: 'var(--text3)',
                          fontFamily: 'DM Sans', fontSize: 12, marginTop: 2,
                          transition: 'color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.color = 'var(--text)';
                          (e.currentTarget as HTMLElement).style.background = 'var(--surface2)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.color = 'var(--text3)';
                          (e.currentTarget as HTMLElement).style.background = 'none';
                        }}
                      >
                        <Icon name="plus" size={13} /> Add task
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {statuses.length === 0 && (
            <div style={{
              color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 14,
              padding: '80px 0', textAlign: 'center', flex: 1,
            }}>
              No statuses configured for this project yet.
            </div>
          )}
        </div>
      </div>

      {selectedTask && (
        <TaskDetailPanel
          projectId={projectId}
          task={selectedTask}
          statuses={statuses}
          allTasks={tasks}
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
      {confirmEl}
    </div>
  );
}
