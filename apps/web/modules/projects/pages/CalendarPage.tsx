'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type Task, type TaskStatus } from '@/modules/projects/lib/api';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function CalendarPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { data: tasksData } = useQuery({
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

  const tasks: Task[] = tasksData ?? [];
  const statuses: TaskStatus[] = statusesData ?? [];

  const statusMap: Record<string, TaskStatus> = {};
  for (const s of statuses) statusMap[s.id] = s;

  const tasksByDate: Record<string, Task[]> = {};
  for (const t of tasks) {
    if (!t.due_date) continue;
    const key = isoDate(new Date(t.due_date));
    if (!tasksByDate[key]) tasksByDate[key] = [];
    tasksByDate[key]!.push(t);
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const todayStr = isoDate(now);

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        padding: '12px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
      }}>
        <button
          onClick={prevMonth}
          style={{
            border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 6,
            padding: '4px 10px', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 13,
            color: 'var(--text)',
          }}
        >
          ‹
        </button>
        <span style={{ fontFamily: 'Instrument Serif', fontSize: 20, color: 'var(--text)', minWidth: 180, textAlign: 'center' }}>
          {monthLabel}
        </span>
        <button
          onClick={nextMonth}
          style={{
            border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 6,
            padding: '4px 10px', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 13,
            color: 'var(--text)',
          }}
        >
          ›
        </button>
      </div>

      {/* Calendar grid */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
        {/* DOW row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          {DOW_LABELS.map(d => (
            <div
              key={d}
              style={{
                textAlign: 'center', fontFamily: 'DM Sans', fontSize: 11,
                color: 'var(--text3)', padding: '4px 0', fontWeight: 600,
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((date, idx) => {
            if (!date) {
              return <div key={`empty-${idx}`} style={{ minHeight: 90 }} />;
            }
            const key = isoDate(date);
            const dayTasks = tasksByDate[key] ?? [];
            const isToday = key === todayStr;

            return (
              <div
                key={key}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: 8, minHeight: 90,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                  <span style={{
                    fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
                    width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '50%',
                    background: isToday ? 'var(--blue)' : 'transparent',
                    color: isToday ? '#fff' : 'var(--text)',
                  }}>
                    {date.getDate()}
                  </span>
                </div>
                {dayTasks.slice(0, 3).map(t => {
                  const color = statusMap[t.status_id]?.color ?? '#94a3b8';
                  return (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        marginBottom: 2, padding: '2px 4px',
                        background: 'var(--surface2)', borderRadius: 4,
                      }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{
                        fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {t.title}
                      </span>
                    </div>
                  );
                })}
                {dayTasks.length > 3 && (
                  <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--text3)' }}>
                    +{dayTasks.length - 3} more
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
