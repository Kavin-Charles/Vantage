'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type Task, type TaskWithAssignees, type TaskStatus } from '@/modules/projects/lib/api';
import { TaskDetailPanel } from '@/modules/projects/components/TaskDetailPanel';
import { AvatarGroup } from '@/modules/projects/components/AvatarGroup';
import { TaskCreateModal } from '@/modules/projects/components/TaskCreateModal';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'var(--text3)', MEDIUM: 'var(--amber)', HIGH: 'var(--red)', URGENT: 'var(--red)',
};
const PRIORITY_BG: Record<string, string> = {
  LOW: 'var(--surface2)', MEDIUM: 'var(--amber-bg)', HIGH: 'var(--red-bg)', URGENT: 'var(--red-bg)',
};
const PRIORITY_BORDER: Record<string, string> = {
  LOW: '#c8c4bb', MEDIUM: '#f59e0b', HIGH: '#ef4444', URGENT: '#ef4444',
};

export default function ProjectListPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('ALL');
  const [selectedTask, setSelectedTask] = useState<TaskWithAssignees | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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

  const filtered = filter === 'ALL' ? tasks : tasks.filter(t => t.status_id === filter);

  const updateMutation = useMutation({
    mutationFn: async ({ taskId, patch }: { taskId: string; patch: Partial<Task> }) => {
      const token = await getToken();
      return pmApi.updateTask(token, projectId, taskId, patch);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  const { ask: askConfirm, el: confirmEl } = useConfirm();
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

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

  function openTaskMenu(e: React.MouseEvent, task: TaskWithAssignees) {
    const items: ContextMenuItem[] = [
      { icon: 'open', label: 'Open', onClick: () => void openTask(task) },
      { icon: 'edit', label: 'Edit', onClick: () => void openTask(task) },
      { icon: 'copy', label: 'Copy ID', onClick: () => navigator.clipboard.writeText(task.id) },
      { type: 'separator' },
      { icon: 'duplicate', label: 'Duplicate', onClick: () => duplicateMutation.mutate(task) },
      { type: 'separator' },
      { icon: 'trash', label: 'Delete', danger: true, onClick: () => askConfirm({
        title: 'Delete task',
        message: `Delete "${task.title}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
        onConfirm: () => deleteMutation.mutate(task.id),
      }) },
    ];
    openMenu(e, items);
  }

  async function openTask(task: Task) {
    const token = await getToken();
    const res = await pmApi.getTask(token, projectId, task.id);
    setSelectedTask(res.data);
  }

  const done = tasks.filter(t => statuses.find(s => s.id === t.status_id)?.is_done).length;
  const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date()).length;

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Summary row */}
      {tasks.length > 0 && (
        <div style={{ display: 'flex', gap: 20, marginBottom: 20, alignItems: 'center' }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text2)' }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{tasks.length}</span> tasks
          </span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>·</span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--green)' }}>
            {done} done
          </span>
          {overdue > 0 && (
            <>
              <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>·</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--red)' }}>
                {overdue} overdue
              </span>
            </>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 9,
              background: 'var(--text)', color: '#fff',
              border: 'none', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={13} color="#fff" /> Add Task
          </button>
        </div>
      )}

      {/* Status filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          onClick={() => setFilter('ALL')}
          style={{
            padding: '5px 13px', borderRadius: 20,
            border: `1.5px solid ${filter === 'ALL' ? 'var(--text)' : 'var(--border)'}`,
            background: filter === 'ALL' ? 'var(--text)' : 'var(--surface)',
            color: filter === 'ALL' ? '#fff' : 'var(--text2)',
            fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}
        >
          All <span style={{ opacity: 0.6, fontSize: 11, marginLeft: 4 }}>{tasks.length}</span>
        </button>
        {statuses.map(s => {
          const count = tasks.filter(t => t.status_id === s.id).length;
          const active = filter === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 13px', borderRadius: 20,
                border: `1.5px solid ${active ? s.color : 'var(--border)'}`,
                background: active ? `${s.color}18` : 'var(--surface)',
                color: active ? s.color : 'var(--text2)',
                fontFamily: 'DM Sans', fontSize: 12, fontWeight: active ? 600 : 500,
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              {s.name}
              <span style={{ opacity: 0.6, fontSize: 11 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Task table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ marginBottom: 12, opacity: 0.3 }}><Icon name="tasks" size={36} /></div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text2)', margin: '0 0 4px' }}>No tasks</p>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', margin: '0 0 20px' }}>
              {filter === 'ALL' ? 'Create your first task to get started.' : 'No tasks in this status.'}
            </p>
            {filter === 'ALL' && (
              <button
                onClick={() => setShowCreate(true)}
                style={{
                  padding: '8px 18px', borderRadius: 9, background: 'var(--text)', color: '#fff',
                  border: 'none', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Add Task
              </button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                <th style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid var(--border)', width: '38%' }}>Task</th>
                <th style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Status</th>
                <th style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Priority</th>
                <th style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Due date</th>
                <th style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Assignees</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task, i) => {
                const status = statuses.find(s => s.id === task.status_id);
                const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                const priorityBorder = task.priority && task.priority !== 'NONE'
                  ? PRIORITY_BORDER[task.priority] ?? 'var(--border)'
                  : 'transparent';
                const isLast = i === filtered.length - 1;

                return (
                  <tr
                    key={task.id}
                    onClick={() => void openTask(task)}
                    onContextMenu={e => openTaskMenu(e, task)}
                    style={{ cursor: 'pointer', borderBottom: isLast ? 'none' : '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {/* Title with priority left border */}
                    <td style={{ padding: '0', position: 'relative' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center',
                        padding: '12px 16px',
                        borderLeft: `3px solid ${priorityBorder}`,
                      }}>
                        <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                          {task.title}
                        </span>
                        {task.client_visible && (
                          <span style={{
                            marginLeft: 8, fontFamily: 'DM Sans', fontSize: 10, fontWeight: 600,
                            color: 'var(--blue)', background: 'var(--blue-bg)',
                            borderRadius: 5, padding: '2px 6px',
                          }}>
                            Client
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 14px' }}>
                      {status ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontFamily: 'DM Sans', fontSize: 12,
                          color: status.color, background: `${status.color}18`,
                          borderRadius: 20, padding: '3px 9px', fontWeight: 500,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.color, display: 'inline-block', flexShrink: 0 }} />
                          {status.name}
                        </span>
                      ) : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}
                    </td>

                    {/* Priority */}
                    <td style={{ padding: '12px 14px' }}>
                      {task.priority && task.priority !== 'NONE' ? (
                        <span style={{
                          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
                          color: PRIORITY_COLORS[task.priority] ?? 'var(--text3)',
                          background: PRIORITY_BG[task.priority] ?? 'var(--surface2)',
                          borderRadius: 6, padding: '3px 8px',
                          textTransform: 'uppercase', letterSpacing: '0.03em',
                        }}>
                          {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
                        </span>
                      ) : <span style={{ color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 12 }}>—</span>}
                    </td>

                    {/* Due date */}
                    <td style={{ padding: '12px 14px' }}>
                      {task.due_date ? (
                        <span style={{
                          fontFamily: 'DM Sans', fontSize: 12,
                          color: isOverdue ? 'var(--red)' : 'var(--text3)',
                          fontWeight: isOverdue ? 600 : 400,
                        }}>
                          {isOverdue ? '⚠ ' : ''}{new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      ) : <span style={{ color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 12 }}>—</span>}
                    </td>

                    {/* Assignees */}
                    <td style={{ padding: '12px 14px' }}>
                      {task.assignees?.length > 0
                        ? <AvatarGroup assignees={task.assignees} />
                        : <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {tasks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ marginBottom: 16, opacity: 0.3 }}><Icon name="tasks" size={40} /></div>
          <p style={{ fontFamily: 'Instrument Serif', fontSize: 20, color: 'var(--text)', margin: '0 0 8px' }}>No tasks yet</p>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)', margin: '0 0 20px' }}>Create your first task to get started.</p>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: '9px 20px', borderRadius: 10, background: 'var(--text)', color: '#fff',
              border: 'none', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Add Task
          </button>
        </div>
      )}

      {showCreate && (
        <TaskCreateModal
          projectId={projectId}
          onClose={() => setShowCreate(false)}
        />
      )}

      {selectedTask && (
        <TaskDetailPanel
          projectId={projectId}
          task={selectedTask}
          statuses={statuses}
          onClose={() => setSelectedTask(null)}
          onUpdate={patch => {
            setSelectedTask(prev => prev ? { ...prev, ...patch } : null);
            updateMutation.mutate({ taskId: selectedTask.id, patch });
          }}
        />
      )}
      <ContextMenu menu={menu} onClose={closeMenu} />
      {confirmEl}
    </div>
  );
}
