'use client';

import { formatMonthYear, formatFullDay, formatWeekDay, getWeekDays } from '@/lib/calendar';

export type CalendarView = 'month' | 'week' | 'day';

interface CalendarToolbarProps {
  view: CalendarView;
  date: Date;
  onViewChange: (v: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

function getTitle(view: CalendarView, date: Date): string {
  if (view === 'month') return formatMonthYear(date);
  if (view === 'day') return formatFullDay(date);
  // week: show "May 19 – 25, 2026"
  const days = getWeekDays(date);
  const first = days[0]!;
  const last = days[6]!;
  const sameMonth = first.getMonth() === last.getMonth();
  if (sameMonth) {
    return `${first.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${last.getDate()}, ${last.getFullYear()}`;
  }
  return `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export function CalendarToolbar({ view, date, onViewChange, onPrev, onNext, onToday }: CalendarToolbarProps) {
  const VIEWS: CalendarView[] = ['month', 'week', 'day'];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button
          onClick={onPrev}
          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 14, color: 'var(--text2)' }}
          aria-label="Previous"
        >
          ‹
        </button>
        <button
          onClick={onToday}
          style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif' }}
        >
          Today
        </button>
        <button
          onClick={onNext}
          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 14, color: 'var(--text2)' }}
          aria-label="Next"
        >
          ›
        </button>
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', flex: 1, fontFamily: 'DM Sans, sans-serif' }}>
        {getTitle(view, date)}
      </span>
      <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
        {VIEWS.map(v => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              fontFamily: 'DM Sans, sans-serif',
              background: view === v ? 'var(--text)' : 'transparent',
              color: view === v ? '#fff' : 'var(--text2)',
              transition: 'all .15s',
            }}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
