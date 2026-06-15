'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type Task, type TaskStatus } from '@/modules/projects/lib/api';
import GanttChart, { type GanttTask } from '@/modules/projects/components/GanttChart';

export default function TimelinePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: async () => {
      const token = await getToken();
      const res = await pmApi.listTasks(token, projectId);
      return res.data;
    },
  });

  const { data: statusesData, isLoading: statusesLoading } = useQuery({
    queryKey: ['statuses', projectId],
    queryFn: async () => {
      const token = await getToken();
      const res = await pmApi.listStatuses(token, projectId);
      return res.data;
    },
  });

  if (tasksLoading || statusesLoading) {
    return (
      <div style={{ padding: 32, fontFamily: 'DM Sans', color: 'var(--text3)' }}>
        Loading timeline…
      </div>
    );
  }

  const tasks: Task[] = tasksData ?? [];
  const statuses: TaskStatus[] = statusesData ?? [];

  const statusMap: Record<string, TaskStatus> = {};
  for (const s of statuses) {
    statusMap[s.id] = s;
  }

  if (tasks.length === 0) {
    return (
      <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <p style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)' }}>No tasks yet</p>
        <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text3)' }}>
          Add tasks with start and due dates to see the timeline.
        </p>
      </div>
    );
  }

  const datedTasks = tasks.filter(t => t.start_date || t.due_date);

  let minDate = new Date();
  let maxDate = new Date();

  if (datedTasks.length > 0) {
    const allDates: Date[] = [];
    for (const t of datedTasks) {
      if (t.start_date) allDates.push(new Date(t.start_date));
      if (t.due_date) allDates.push(new Date(t.due_date));
    }
    minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
  }

  minDate.setDate(minDate.getDate() - 7);
  maxDate.setDate(maxDate.getDate() + 14);

  const ganttTasks: GanttTask[] = tasks.map(t => ({
    id: t.id,
    title: t.title,
    start_date: t.start_date,
    due_date: t.due_date,
    status_color: statusMap[t.status_id]?.color ?? '#94a3b8',
    parent_id: t.parent_id,
  }));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '12px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
        <GanttChart tasks={ganttTasks} startDate={minDate} endDate={maxDate} />
      </div>
    </div>
  );
}
