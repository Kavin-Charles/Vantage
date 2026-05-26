// apps/web/components/calendar/WeekView.tsx
'use client';

import { useState } from 'react';
import { getWeekDays, toIsoDate, isSameDay, eventDateRange, formatWeekDay, type CalendarEvent } from '@/lib/calendar';
import type { Task } from '@vantage/types';
import { EventChip } from './EventChip';
import { TaskChip } from './TaskChip';
import { EventPopover } from './EventPopover';

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 7am–11pm

interface WeekViewProps {
  date: Date;
  events: CalendarEvent[];
  tasks: Task[];
  isAdmin: boolean;
  onEditEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (id: string) => void;
}

export function WeekView({ date, events, tasks, isAdmin, onEditEvent, onDeleteEvent }: WeekViewProps) {
  const today = new Date();
  const days = getWeekDays(date);
  const [popover, setPopover] = useState<{ event: CalendarEvent; rect: DOMRect } | null>(null);

  const eventsByDate: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    for (const d of eventDateRange(ev)) {
      if (!eventsByDate[d]) eventsByDate[d] = [];
      eventsByDate[d]!.push(ev);
    }
  }
  const tasksByDate: Record<string, Task[]> = {};
  for (const task of tasks) {
    if (!task.due_date) continue;
    const d = task.due_date.slice(0, 10);
    if (!tasksByDate[d]) tasksByDate[d] = [];
    tasksByDate[d]!.push(task);
  }

  const COL = 'repeat(7, 1fr)';
  const TIME_COL = '48px';

  return (
    <>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {/* Header: day names */}
        <div style={{ display: 'grid', gridTemplateColumns: `${TIME_COL} ${COL}`, borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div />
          {days.map((d, i) => {
            const isToday = isSameDay(d, today);
            return (
              <div key={i} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: isToday ? 'var(--text)' : 'var(--text3)', borderLeft: '1px solid var(--border)' }}>
                {formatWeekDay(d)}
              </div>
            );
          })}
        </div>

        {/* All-day row: events + tasks */}
        <div style={{ display: 'grid', gridTemplateColumns: `${TIME_COL} ${COL}`, borderBottom: '1px solid var(--border)', minHeight: 36 }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', padding: '4px 4px 0', textAlign: 'right' }}>all day</div>
          {days.map((d, i) => {
            const iso = toIsoDate(d);
            const dayEvents = eventsByDate[iso] ?? [];
            const dayTasks = tasksByDate[iso] ?? [];
            return (
              <div key={i} style={{ padding: '2px 4px', borderLeft: '1px solid var(--border)' }}>
                {dayEvents.map(ev => (
                  <EventChip key={ev.id} event={ev} onClick={e => setPopover({ event: ev, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })} />
                ))}
                {dayTasks.map(t => <TaskChip key={t.id} task={t} />)}
              </div>
            );
          })}
        </div>

        {/* Hour rows */}
        <div style={{ overflowY: 'auto', maxHeight: 480 }}>
          {HOURS.map(h => (
            <div key={h} style={{ display: 'grid', gridTemplateColumns: `${TIME_COL} ${COL}`, borderBottom: '1px solid var(--border)', minHeight: 40 }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', padding: '4px 4px 0', textAlign: 'right', flexShrink: 0 }}>
                {h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`}
              </div>
              {days.map((_, i) => (
                <div key={i} style={{ borderLeft: '1px solid var(--border)', minHeight: 40 }} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {popover && (
        <EventPopover
          event={popover.event}
          anchorRect={popover.rect}
          onClose={() => setPopover(null)}
          isAdmin={isAdmin}
          onEdit={() => { onEditEvent(popover.event); setPopover(null); }}
          onDelete={() => { onDeleteEvent(popover.event.id); setPopover(null); }}
        />
      )}
    </>
  );
}
