'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/modules/shared/components/Topbar';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { Button } from '@/modules/shared/components/ui/Button';
import { Modal } from '@/modules/shared/components/ui/Modal';
import { FormField, Input } from '@/modules/shared/components/ui/FormField';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import type { Task } from '@vencore/types';

interface WorkspaceUser { id: string; name: string; email: string; role: string; }

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 18, height: 18, borderRadius: 6,
        border: '1.5px solid ' + (checked ? 'var(--text)' : 'var(--border2, #d4cfc5)'),
        background: checked ? 'var(--text)' : 'transparent',
        cursor: 'pointer', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .12s', padding: 0,
      }}
    >
      {checked && <Icon name="check" size={12} color="#fff" strokeWidth={2.5} />}
    </button>
  );
}

export default function TasksPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === 'admin';
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', due_date: '', assignee_id: '' });
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('todo');
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const { data: usersData } = useQuery({
    queryKey: ['workspace-users'],
    queryFn: async () => apiFetch<{ data: WorkspaceUser[] }>('/api/users', { token: await getToken() }),
    enabled: isAdmin,
  });
  const workspaceUsers = usersData?.data ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const qs = isAdmin ? '?show_all=true&per_page=100' : '?per_page=100';
      return apiFetch<{ data: Task[]; error: null }>(`/api/tasks${qs}`, { token: await getToken() });
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'todo' | 'done' }) =>
      apiFetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }), token: await getToken() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const createMut = useMutation({
    mutationFn: async (body: Record<string, string>) =>
      apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(body), token: await getToken() }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/tasks/${id}`, { method: 'DELETE', token: await getToken() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  async function submitTask(e: React.FormEvent) {
    e.preventDefault();
    if (createMut.isPending) return;
    const body: Record<string, string> = { title: form.title };
    if (form.due_date) body['due_date'] = form.due_date;
    if (form.assignee_id) body['assignee_id'] = form.assignee_id;
    try {
      await createMut.mutateAsync(body);
    } catch {
      return;
    }
    setModal(false);
    setForm({ title: '', due_date: '', assignee_id: '' });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
  }

  function deleteTask(task: Task) {
    askConfirm({
      title: 'Delete task',
      message: `Delete "${task.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => deleteMut.mutate(task.id),
    });
  }

  const allTasks = data?.data ?? [];
  const tasks = filter === 'all' ? allTasks : allTasks.filter(t => t.status === filter);
  const overdue = allTasks.filter(t => t.status === 'todo' && t.due_date && new Date(t.due_date) < new Date());
  const userMap = Object.fromEntries(workspaceUsers.map(u => [u.id, u.name]));

  const FILTERS: ('all' | 'todo' | 'done')[] = ['all', 'todo', 'done'];

  return (
    <ModuleGuard moduleId="tasks">
      <Topbar action={isAdmin ? <Button variant="primary" onClick={() => setModal(true)}>+ Add Task</Button> : undefined} />
      <div style={{ padding: 24 }}>
        {overdue.length > 0 && (
          <div style={{
            background: 'var(--red-bg)', border: '1px solid #fee2e2',
            borderRadius: 'var(--radius-md)', padding: '10px 16px', marginBottom: 14,
            fontSize: 13, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Icon name="warning" size={14} />
            {overdue.length} overdue task{overdue.length > 1 ? 's' : ''}
          </div>
        )}

        <div style={{
          display: 'inline-flex', gap: 0,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 3, marginBottom: 16,
        }}>
          {FILTERS.map(f => {
            const on = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  padding: '5px 14px', borderRadius: 8, border: 'none',
                  background: on ? 'var(--text)' : 'transparent',
                  color: on ? '#fff' : 'var(--text2)',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', transition: 'all .15s',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
                <span style={{ fontSize: 11, opacity: on ? 0.7 : 0.6, fontWeight: 600 }}>
                  {f === 'all' ? allTasks.length : allTasks.filter(t => t.status === f).length}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
          ) : tasks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No tasks.</div>
          ) : tasks.map((task, i) => {
            const done = task.status === 'done';
            const isOverdue = !done && task.due_date && new Date(task.due_date) < new Date();
            return (
              <TaskRow
                key={task.id}
                task={task}
                last={i === tasks.length - 1}
                isOverdue={!!isOverdue}
                isAdmin={isAdmin}
                onToggle={() => toggleMut.mutate({ id: task.id, status: done ? 'todo' : 'done' })}
                onDelete={() => deleteTask(task)}
                assigneeName={task.assignee_id ? userMap[task.assignee_id] : undefined}
                onContextMenu={(e) => {
                  const items: ContextMenuItem[] = [
                    done
                      ? { icon: 'refresh', label: 'Mark todo',  onClick: () => toggleMut.mutate({ id: task.id, status: 'todo' }) }
                      : { icon: 'check',   label: 'Mark done', shortcut: '⌘↵', onClick: () => toggleMut.mutate({ id: task.id, status: 'done' }) },
                    { type: 'separator' },
                    { icon: 'copy', label: 'Copy title', onClick: () => navigator.clipboard.writeText(task.title) },
                  ];
                  openMenu(e, items);
                }}
              />
            );
          })}
        </div>
      </div>

      <ContextMenu menu={menu} onClose={closeMenu} />

      {modal && isAdmin && (
        <Modal title="Add task" onClose={() => setModal(false)}>
          <form onSubmit={submitTask}>
            <FormField label="Task *">
              <Input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Follow up with Acme Corp" />
            </FormField>
            <FormField label="Assign to">
              <select
                value={form.assignee_id}
                onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none' }}
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
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <Button type="button" onClick={() => setModal(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={createMut.isPending}>
                {createMut.isPending ? 'Saving…' : 'Add task'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </ModuleGuard>
  );
}

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--surface2)', border: '1px solid var(--border)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 600, color: 'var(--text2)',
      flexShrink: 0, userSelect: 'none',
    }}>
      {name[0].toUpperCase()}
    </span>
  );
}

const TASK_STATUS_COLOR: Record<string, 'green' | 'amber'> = { done: 'green', todo: 'amber' };

function TaskRow({ task, last, isOverdue, onToggle, assigneeName, onContextMenu }: { task: Task; last: boolean; isOverdue: boolean; onToggle: () => void; assigneeName?: string; onContextMenu: (e: React.MouseEvent) => void }) {
  const [hover, setHover] = useState(false);
  const done = task.status === 'done';
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '13px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s', fontSize: 13,
      }}
    >
      <Checkbox checked={done} onChange={onToggle} />
      <span style={{ flex: 1, color: done ? 'var(--text3)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>
        {task.title}
      </span>
      {task.due_date && (
        <span style={{
          fontSize: 12,
          color: isOverdue ? 'var(--red)' : 'var(--text3)',
          background: isOverdue ? 'var(--red-bg)' : 'transparent',
          padding: isOverdue ? '2px 8px' : undefined,
          borderRadius: isOverdue ? 999 : undefined,
          fontWeight: isOverdue ? 600 : 400,
        }}>
          {new Date(task.due_date).toLocaleDateString()}
        </span>
      )}
      {assigneeName && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)' }}>
          <Avatar name={assigneeName} size={22} />
          <span style={{ fontSize: 12 }}>{assigneeName.split(' ')[0]}</span>
        </span>
      )}
      <Badge label={task.status} color={TASK_STATUS_COLOR[task.status] ?? 'gray'} />
      {isAdmin && hover && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Delete task"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
            color: 'var(--text3)', borderRadius: 4, display: 'flex', alignItems: 'center',
            transition: 'color .12s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  );
}
