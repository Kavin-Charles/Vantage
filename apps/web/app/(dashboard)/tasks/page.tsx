'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Badge, statusColor } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FormField, Input } from '@/components/ui/FormField';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';
import type { Task } from '@vantage/types';

export default function TasksPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', due_date: '' });
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('todo');

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', filter],
    queryFn: async () => {
      const token = await getToken();
      const qs = filter !== 'all' ? `?status=${filter}` : '';
      return apiFetch<{ data: Task[]; error: null }>(`/api/tasks${qs}`, { token });
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'todo' | 'done' }) => {
      const token = await getToken();
      return apiFetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }), token });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(form), token });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setModal(false); setForm({ title: '', due_date: '' }); },
  });

  const tasks = data?.data ?? [];
  const overdue = tasks.filter(t => t.status === 'todo' && t.due_date && new Date(t.due_date) < new Date());

  return (
    <>
      <Topbar action={<Button variant="primary" onClick={() => setModal(true)}>+ Add Task</Button>} />
      <div style={{ padding: 24 }}>
        {overdue.length > 0 && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-bg)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: 'var(--red)' }}>
            {overdue.length} overdue task{overdue.length > 1 ? 's' : ''}
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, width: 'fit-content' }}>
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

        {/* Task list */}
        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
          ) : tasks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No tasks.</div>
          ) : tasks.map(task => {
            const isOverdue = task.status === 'todo' && task.due_date && new Date(task.due_date) < new Date();
            return (
              <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <input
                  type="checkbox"
                  checked={task.status === 'done'}
                  onChange={() => toggleMut.mutate({ id: task.id, status: task.status === 'done' ? 'todo' : 'done' })}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <span style={{ flex: 1, fontSize: 13, color: task.status === 'done' ? 'var(--text3)' : 'var(--text)', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
                  {task.title}
                </span>
                {task.due_date && (
                  <span style={{ fontSize: 12, color: isOverdue ? 'var(--red)' : 'var(--text3)' }}>
                    {new Date(task.due_date).toLocaleDateString()}
                  </span>
                )}
                <Badge label={task.status} color={statusColor[task.status] ?? 'gray'} />
              </div>
            );
          })}
        </div>
      </div>

      {modal && (
        <Modal title="Add task" onClose={() => setModal(false)}>
          <form onSubmit={e => { e.preventDefault(); createMut.mutate(); }}>
            <FormField label="Task *">
              <Input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Follow up with Acme Corp" />
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
    </>
  );
}
