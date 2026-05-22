// apps/web/components/calendar/MonthView.tsx
'use client';

import { useState } from 'react';
import {
  getMonthGrid, toIsoDate, isSameDay, eventDateRange, type CalendarEvent,
} from '@/lib/calendar';
import type { Task } from '@vantage/types';
import { EventChip } from './EventChip';
import { TaskChip } from './TaskChip';
import { EventPopover } from './EventPopover';

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_CHIPS = 3;

interface MonthViewProps {
  year: number;
  month: number; // 0-indexed
  events: CalendarEvent[];
  tasks: Task[];
  isAdmin: boolean;
  onEditEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (id: string) => void;
}

export function MonthView({ year, month, events, tasks, isAdmin, onEditEvent, onDeleteEvent }: MonthViewProps) {
  const today = new Date();
  const weeks = getMonthGrid(year, month);
  const [popover, setPopover] = useState<{ event: CalendarEvent; rect: DOMRect } | null>(null);

  // Map: ISO date → events on that date
  const eventsByDate: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    for (const d of eventDateRange(ev)) {
      if (!eventsByDate[d]) eventsByDate[d] = [];
      eventsByDate[d]!.push(ev);
    }
  }

  // Map: ISO date → tasks due that date
  const tasksByDate: Record<string, Task[]> = {};
  for (const task of tasks) {
    if (!task.due_date) continue;
    const d = task.due_date.slice(0, 10);
    if (!tasksByDate[d]) tasksByDate[d] = [];
    tasksByDate[d]!.push(task);
  }

  return (
    <>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {DAY_HEADERS.map(h => (
            <div key={h} style={{ padding: '8px 0', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif' }}>
              {h}
            </div>
          ))}
        </div>

        {/* Week rows */}
        {weeks.map((week, wi) => (
          <div
            key={wi}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: wi < weeks.length - 1 ? '1px solid var(--border)' : 'none' }}
          >
            {week.map((day, di) => {
              const iso = toIsoDate(day);
              const isCurrentMonth = day.getMonth() === month;
              const isToday = isSameDay(day, today);
              const dayEvents = eventsByDate[iso] ?? [];
              const dayTasks = tasksByDate[iso] ?? [];
              const allChips = [...dayEvents.map(e => ({ type: 'event' as const, event: e })), ...dayTasks.map(t => ({ type: 'task' as const, task: t }))];
              const visible = allChips.slice(0, MAX_CHIPS);
              const overflow = allChips.length - MAX_CHIPS;

              return (
                <div
                  key={di}
                  style={{
                    minHeight: 80,
                    padding: '6px 6px 4px',
                    borderRight: di < 6 ? '1px solid var(--border)' : 'none',
                    background: isToday ? 'var(--bg)' : 'var(--surface)',
                    opacity: isCurrentMonth ? 1 : 0.4,
                  }}
                >
                  <div style={{
                    fontSize: 12,
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? 'var(--text)' : 'var(--text2)',
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 4,
                    fontFamily: 'DM Sans, sans-serif',
                  }}>
                    {isToday && (
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--text)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                        {day.getDate()}
                      </span>
                    )}
                    {!isToday && day.getDate()}
                  </div>

                  {/* Chips */}
                  {visible.map((item, ci) =>
                    item.type === 'event' ? (
                      <EventChip
                        key={`e-${item.event.id}`}
                        event={item.event}
                        onClick={e => setPopover({ event: item.event, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })}
                      />
                    ) : (
                      <TaskChip key={`t-${item.task.id}`} task={item.task} />
                    )
                  )}

                  {overflow > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'DM Sans, sans-serif' }}>
                      +{overflow} more
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
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
