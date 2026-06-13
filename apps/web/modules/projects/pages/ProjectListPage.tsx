'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type Task, type TaskWithAssignees, type TaskStatus } from '@/modules/projects/lib/api';
import { TaskDetailPanel } from '@/modules/projects/components/TaskDetailPanel';

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'var(--text3)', MEDIUM: 'var(--amber)', HIGH: 'var(--red)', URGENT: 'var(--red)',
};

export default function ProjectListPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('ALL');
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
  const filtered = filter === 'ALL' ? tasks : tasks.filter(t => t.status_id === filter);

  const updateMutation = useMutation({
    mutationFn: async ({ taskId, patch }: { taskId: string; patch: Partial<Task> }) => {
      const token = await getToken();
      return pmApi.updateTask(token, projectId, taskId, patch);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  async function openTask(task: Task) {
    const token = await getToken();
    const res = await pmApi.getTask(token, projectId, task.id);
    setSelectedTask(res.data);
  }

  const thStyle: React.CSSProperties = {
    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 14px',
    textAlign: 'left', borderBottom: '1px solid var(--border)',
  };

  return (
    <div style={{ padding: 20 }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[{ id: 'ALL', name: 'All', color: '' }, ...statuses].map(s => (
          <button
            key={s.id}
            onClick={() => setFilter(s.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)',
              background: filter === s.id ? 'var(--text)' : 'var(--surface)',
              color: filter === s.id ? '#fff' : 'var(--text2)',
              fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            }}
          >
            {s.color && s.id !== 'ALL' && (
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color }} />
            )}
            {s.name}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '40%' }}>Title</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Priority</th>
              <th style={thStyle}>Due date</th>
              <th style={thStyle}>Assignees</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px 14px', textAlign: 'center', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>
                  No tasks found.
                </td>
              </tr>
            ) : filtered.map(task => {
              const status = statuses.find(s => s.id === task.status_id);
              return (
                <tr
                  key={task.id}
                  onClick={() => void openTask(task)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={{ padding: '11px 14px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)' }}>
                    {task.title}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {status ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
                        <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text2)' }}>{status.name}</span>
                      </div>
                    ) : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '11px 14px', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: PRIORITY_COLORS[task.priority] ?? 'var(--text3)' }}>
                    {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
                  </td>
                  <td style={{ padding: '11px 14px', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '11px 14px', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>—</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}
