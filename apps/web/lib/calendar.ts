import { apiFetch } from './api';
import type { CalendarEvent } from '@vantage/types';

export type { CalendarEvent };

export type CalendarCategory = 'holiday' | 'company_event' | 'meeting' | 'other';

export const CATEGORY_COLORS: Record<CalendarCategory, string> = {
  holiday: '#ef4444',
  company_event: '#6366f1',
  meeting: '#8b5cf6',
  other: '#6b665c',
};

export const CATEGORY_LABELS: Record<CalendarCategory, string> = {
  holiday: 'Holiday',
  company_event: 'Company Event',
  meeting: 'Meeting',
  other: 'Other',
};

export function eventColor(event: CalendarEvent): string {
  return event.color ?? CATEGORY_COLORS[event.category as CalendarCategory] ?? '#6b665c';
}

// ── API functions ────────────────────────────────────────────────────────────

export async function listCalendarEvents(
  token: string,
  start: string,
  end: string,
): Promise<{ data: CalendarEvent[] }> {
  return apiFetch(`/api/calendar/events?start=${start}&end=${end}`, { token });
}

export async function createCalendarEvent(
  token: string,
  body: {
    title: string;
    description?: string;
    category: CalendarCategory;
    color?: string;
    start_date: string;
    end_date?: string;
    all_day?: boolean;
  },
): Promise<{ data: CalendarEvent }> {
  return apiFetch('/api/calendar/events', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function updateCalendarEvent(
  token: string,
  id: string,
  body: Partial<Parameters<typeof createCalendarEvent>[1]>,
): Promise<{ data: CalendarEvent }> {
  return apiFetch(`/api/calendar/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteCalendarEvent(token: string, id: string): Promise<void> {
  await apiFetch(`/api/calendar/events/${id}`, { method: 'DELETE', token });
}

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse a YYYY-MM-DD string as local midnight */
export function parseDate(s: string): Date {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y!, m! - 1, day!);
}

/** Add n months to a date */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

/** Add n days to a date */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** True if two dates are the same calendar day */
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/** Returns the Monday of the week containing d */
export function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

/**
 * Returns 5-6 weeks of Date objects for a month grid.
 * Always starts on Monday; pads with prev/next month days.
 */
export function getMonthGrid(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let cursor = startOfWeek(firstDay);
  const weeks: Date[][] = [];
  while (cursor <= lastDay || weeks.length < 5) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
    if (cursor > lastDay && weeks.length >= 5) break;
  }
  return weeks;
}

/** Returns 7 Date objects for the week containing d (Mon–Sun) */
export function getWeekDays(d: Date): Date[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Display label: "May 2026" */
export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Display label: "Mon 22" */
export function formatWeekDay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
}

/** Display label: "Thursday, May 22, 2026" */
export function formatFullDay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Given an event's start_date and end_date, returns all ISO date strings
 * covered (inclusive). Single-day event returns [start_date].
 */
export function eventDateRange(event: CalendarEvent): string[] {
  const start = parseDate(event.start_date);
  const end = event.end_date ? parseDate(event.end_date) : start;
  const dates: string[] = [];
  let cur = new Date(start);
  while (cur <= end) {
    dates.push(toIsoDate(cur));
    cur = addDays(cur, 1);
  }
  return dates;
}

/**
 * Returns range string for display: "May 22, 2026" or "May 22 – May 27, 2026"
 */
export function formatEventRange(event: CalendarEvent): string {
  const start = parseDate(event.start_date);
  if (!event.end_date || event.end_date === event.start_date) {
    return start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const end = parseDate(event.end_date);
  const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${s} – ${e}`;
}
