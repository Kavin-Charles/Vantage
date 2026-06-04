'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { Button } from '@/modules/shared/components/ui/Button';
import { Modal } from '@/modules/shared/components/ui/Modal';
import { FormField, Input } from '@/modules/shared/components/ui/FormField';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import type { Task } from '@vencore/types';

interface WorkspaceUser { id: string; name: string; email: string; role: string; }

export default function SettingsTasksPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', due_date: '', assignee_id: '' });
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState('');

  const { data: usersData } = useQuery({
    queryKey: ['workspace-users'],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: WorkspaceUser[] }>('/api/users', { token });
    },
  });
  const workspaceUsers = usersData?.data ?? [];

  const userMap = Object.fromEntries(workspaceUsers.map(u => [u.id, u]));

  const { data, isLoading } = useQuery({
    queryKey: ['tasks-all', filter, assigneeFilter],
    queryFn: async () => {
      const token = await getToken();
      const params = new URLSearchParams({ show_all: 'true' });
      if (filter !== 'all') params.set('status', filter);
      if (assigneeFilter) params.set('assignee_id', assigneeFilter);
      params.set('per_page', '100');
      return apiFetch<{ data: Task[] }>(`/api/tasks?${params.toString()}`, { token });
    },
  });

  const tasks = data?.data ?? [];

  const toggleMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'todo' | 'done' }) => {
      const token = await getToken();
      return apiFetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }), token });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks-all'] }),
  });

  const reassignMut = useMutation({
    mutationFn: async ({ id, assignee_id }: { id: string; assignee_id: string }) => {
      const token = await getToken();
      return apiFetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ assignee_id }), token });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks-all'] }),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const body: Record<string, string> = { title: form.title };
      if (form.due_date) body['due_date'] = form.due_date;
      if (form.assignee_id) body['assignee_id'] = form.assignee_id;
      return apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(body), token });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks-all'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      setModal(false);
      setForm({ title: '', due_date: '', assignee_id: '' });
    },
  });

  const overdue = tasks.filter(t => t.status === 'todo' && t.due_date && new Date(t.due_date) < new Date());

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Tasks</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
            All workspace tasks. Assign and manage tasks for your team.
          </p>
        </div>
        <Button variant="primary" onClick={() => setModal(true)}>+ Add Task</Button>
      </div>

      {overdue.length > 0 && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: 'var(--red)' }}>
          {overdue.length} overdue task{overdue.length > 1 ? 's' : ''} across the workspace
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 4 }}>
          {(['all', 'todo', 'done'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', background: filter === f ? 'var(--text)' : 'transparent', color: filter === f ? '#fff' : 'var(--text2)', transition: 'all .15s' }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={assigneeFilter}
          onChange={e => setAssigneeFilter(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit' }}
        >
          <option value="">All team members</option>
          {workspaceUsers.map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>

      {/* Task list */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No tasks.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)', fontSize: 12, width: 32 }}></th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)', fontSize: 12 }}>Task</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)', fontSize: 12 }}>Assignee</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)', fontSize: 12 }}>Due</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)', fontSize: 12 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, i) => {
                const isOverdue = task.status === 'todo' && task.due_date && new Date(task.due_date) < new Date();
                const assignee = userMap[task.assignee_id ?? ''];
                return (
                  <tr
                    key={task.id}
                    style={{ borderBottom: i < tasks.length - 1 ? '1px solid var(--border)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '10px 14px' }}>
                      <input
                        type="checkbox"
                        checked={task.status === 'done'}
                        onChange={() => toggleMut.mutate({ id: task.id, status: task.status === 'done' ? 'todo' : 'done' })}
                        style={{ width: 15, height: 15, cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 500, color: task.status === 'done' ? 'var(--text3)' : 'var(--text)', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
                      {task.title}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <select
                        value={task.assignee_id ?? ''}
                        onChange={e => reassignMut.mutate({ id: task.id, assignee_id: e.target.value })}
                        style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '3px 6px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer' }}
                      >
                        <option value="">Unassigned</option>
                        {workspaceUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                      {assignee && !workspaceUsers.length && (
                        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{assignee.name}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: isOverdue ? 'var(--red)' : 'var(--text3)' }}>
                      {task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Badge label={task.status} color={statusColor[task.status] ?? 'gray'} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal title="Add task" onClose={() => setModal(false)}>
          <form onSubmit={e => { e.preventDefault(); createMut.mutate(); }}>
            <FormField label="Task *">
              <Input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Follow up with Acme Corp" />
            </FormField>
            <FormField label="Assign to">
              <select
                value={form.assignee_id}
                onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit' }}
              >
                <option value="">— Me —</option>
                {workspaceUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </FormField>
            <FormField label="Due date">
              <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </FormField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button type="button" onClick={() => setModal(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={createMut.isPending}>
                {createMut.isPending ? 'Saving…' : 'Add task'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
