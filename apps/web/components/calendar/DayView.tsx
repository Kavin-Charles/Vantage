'use client';

import { useState } from 'react';
import { toIsoDate, eventDateRange, type CalendarEvent } from '@/lib/calendar';
import type { Task } from '@vantage/types';
import { EventChip } from './EventChip';
import { TaskChip } from './TaskChip';
import { EventPopover } from './EventPopover';

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 7am–11pm

interface DayViewProps {
  date: Date;
  events: CalendarEvent[];
  tasks: Task[];
  isAdmin: boolean;
  onEditEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (id: string) => void;
}

export function DayView({ date, events, tasks, isAdmin, onEditEvent, onDeleteEvent }: DayViewProps) {
  const iso = toIsoDate(date);
  const [popover, setPopover] = useState<{ event: CalendarEvent; rect: DOMRect } | null>(null);

  const dayEvents = events.filter(ev => eventDateRange(ev).includes(iso));
  const dayTasks = tasks.filter(t => t.due_date != null && toIsoDate(t.due_date) === iso);

  return (
    <>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontFamily: 'DM Sans, sans-serif' }}>
        {/* All-day row */}
        {(dayEvents.length > 0 || dayTasks.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', borderBottom: '1px solid var(--border)', padding: '8px 0', minHeight: 36 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', padding: '4px 8px 0', textAlign: 'right' }}>all day</div>
            <div style={{ padding: '2px 12px' }}>
              {dayEvents.map(ev => (
                <EventChip key={ev.id} event={ev} onClick={e => setPopover({ event: ev, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })} />
              ))}
              {dayTasks.map(t => <TaskChip key={t.id} task={t} />)}
            </div>
          </div>
        )}

        {/* Hour rows */}
        <div style={{ overflowY: 'auto', maxHeight: 520 }}>
          {HOURS.map(h => (
            <div key={h} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', borderBottom: '1px solid var(--border)', minHeight: 48 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', padding: '4px 8px 0', textAlign: 'right' }}>
                {h === 12 ? '12 pm' : h < 12 ? `${h} am` : `${h - 12} pm`}
              </div>
              <div style={{ borderLeft: '1px solid var(--border)', minHeight: 48 }} />
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
