'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface PortalTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  status_name: string;
  status_color: string;
  is_done: boolean;
}

const PRIORITY_LABELS: Record<string, string> = {
  URGENT: 'Urgent',
  HIGH:   'High',
  MEDIUM: 'Medium',
  LOW:    'Low',
  NONE:   '',
};

export default function PortalTasksPage() {
  const { token } = useParams<{ token: string }>();
  const [tasks, setTasks] = useState<PortalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/portal/${token}/tasks`, { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (json.error) { setError(json.error.message); return; }
        setTasks(json.data ?? []);
      })
      .catch(() => setError('Failed to load tasks'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--text3, #9e998f)' }}>Loading…</p>;
  if (error)   return <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--red, #991b1b)' }}>{error}</p>;

  if (tasks.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text3, #9e998f)', fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}>
        No tasks are shared with you yet.
      </div>
    );
  }

  const now = new Date();

  return (
    <div>
      <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--text, #1a1814)', marginBottom: 16 }}>
        Tasks
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.map(task => {
          const overdue = !task.is_done && task.due_date && new Date(task.due_date) < now;
          return (
            <div
              key={task.id}
              style={{
                background: 'var(--surface, #fff)',
                border: '1px solid var(--border, #e4e0d8)',
                borderRadius: 10,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              {/* Status dot */}
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: task.status_color || 'var(--border, #e4e0d8)',
                flexShrink: 0,
              }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 14,
                  fontWeight: 500,
                  color: task.is_done ? 'var(--text3, #9e998f)' : 'var(--text, #1a1814)',
                  textDecoration: task.is_done ? 'line-through' : 'none',
                  marginBottom: 3,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {task.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 11,
                    color: 'var(--text3, #9e998f)',
                    background: 'var(--surface2, #f0ede6)',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}>
                    {task.status_name}
                  </span>
                  {PRIORITY_LABELS[task.priority] && (
                    <span style={{ fontSize: 11, color: 'var(--text3, #9e998f)' }}>
                      {PRIORITY_LABELS[task.priority]}
                    </span>
                  )}
                </div>
              </div>

              {task.due_date && (
                <span style={{
                  fontSize: 12,
                  fontFamily: 'DM Sans, sans-serif',
                  color: overdue ? 'var(--red, #991b1b)' : 'var(--text2, #6b665c)',
                  flexShrink: 0,
                }}>
                  {overdue ? 'Overdue · ' : 'Due '}
                  {new Date(task.due_date).toLocaleDateString()}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
