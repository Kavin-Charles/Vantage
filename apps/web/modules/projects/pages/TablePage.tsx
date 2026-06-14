'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type TaskWithAssignees, type TaskStatus } from '@/modules/projects/lib/api';
import { AvatarGroup } from '@/modules/projects/components/AvatarGroup';

const PRIORITY_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  URGENT: { label: 'Urgent', color: 'var(--red)', bg: 'var(--red-bg, #fee2e2)' },
  HIGH:   { label: 'High',   color: 'var(--red)', bg: 'var(--red-bg, #fee2e2)' },
  MEDIUM: { label: 'Medium', color: 'var(--amber)', bg: 'var(--amber-bg, #fef3c7)' },
  LOW:    { label: 'Low',    color: 'var(--text3)', bg: 'var(--surface2)' },
  NONE:   { label: '—',      color: 'var(--text3)', bg: 'transparent' },
};

export default function TablePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: async () => {
      const token = await getToken();
      const res = await pmApi.listTasks(token, projectId);
      return res.data;
    },
  });

  const { data: statusesData } = useQuery({
    queryKey: ['statuses', projectId],
    queryFn: async () => {
      const token = await getToken();
      const res = await pmApi.listStatuses(token, projectId);
      return res.data;
    },
  });

  const tasks: TaskWithAssignees[] = tasksData ?? [];
  const statuses: TaskStatus[] = statusesData ?? [];
  const statusMap: Record<string, TaskStatus> = {};
  for (const s of statuses) statusMap[s.id] = s;

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
      const matchStatus = !statusFilter || t.status_id === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [tasks, search, statusFilter]);

  const now = new Date();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Toolbar */}
      <div style={{
        padding: '10px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tasks…"
          style={{
            border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px',
            fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', background: 'var(--surface2)',
            outline: 'none', width: 200,
          }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px',
            fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', background: 'var(--surface2)',
            outline: 'none',
          }}
        >
          <option value="">All statuses</option>
          {statuses.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>
          {filtered.length} task{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {tasksLoading ? (
          <div style={{ padding: 32, fontFamily: 'DM Sans', color: 'var(--text3)' }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {['Task', 'Status', 'Priority', 'Due Date', 'Assignees', 'Est.'].map(col => (
                  <th
                    key={col}
                    style={{
                      padding: '8px 16px', textAlign: 'left', fontSize: 11,
                      fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => {
                const status = statusMap[task.status_id];
                const priority = PRIORITY_BADGE[task.priority] ?? PRIORITY_BADGE['NONE']!;
                const dueDate = task.due_date ? new Date(task.due_date) : null;
                const overdue = dueDate && dueDate < now && !(status?.is_done);
                const estHours = task.estimated_minutes ? `${Math.round(task.estimated_minutes / 60)}h` : '—';

                return (
                  <tr
                    key={task.id}
                    style={{
                      background: 'var(--surface)',
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
                  >
                    <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text)', maxWidth: 320 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {task.title}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      {status && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 12, color: 'var(--text2)',
                        }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
                          {status.name}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: priority.color, background: priority.bg,
                        padding: '2px 6px', borderRadius: 4,
                      }}>
                        {priority.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      {dueDate ? (
                        <span style={{ fontSize: 12, color: overdue ? 'var(--red)' : 'var(--text2)', fontWeight: overdue ? 600 : 400 }}>
                          {dueDate.toLocaleDateString()}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      {task.assignees?.length > 0
                        ? <AvatarGroup assignees={task.assignees} size={22} />
                        : <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {estHours}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    No tasks match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
