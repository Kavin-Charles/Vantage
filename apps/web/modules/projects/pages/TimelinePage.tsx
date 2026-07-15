'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type Task, type TaskStatus, type TaskWithAssignees } from '@/modules/projects/lib/api';
import GanttChart, { type GanttTask } from '@/modules/projects/components/GanttChart';
import { TaskDetailPanel } from '@/modules/projects/components/TaskDetailPanel';

export default function TimelinePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<TaskWithAssignees | null>(null);

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

  const updateMutation = useMutation({
    mutationFn: async ({ taskId, patch }: { taskId: string; patch: Partial<Task> }) => {
      const token = await getToken();
      return pmApi.updateTask(token, projectId, taskId, patch);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
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

  async function openTask(taskId: string) {
    const token = await getToken();
    const res = await pmApi.getTask(token, projectId, taskId);
    setSelectedTask(res.data);
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
        <GanttChart tasks={ganttTasks} startDate={minDate} endDate={maxDate} onTaskClick={openTask} />
      </div>

      {selectedTask && (
        <TaskDetailPanel
          projectId={projectId}
          task={selectedTask}
          statuses={statuses}
          allTasks={tasks as TaskWithAssignees[]}
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
