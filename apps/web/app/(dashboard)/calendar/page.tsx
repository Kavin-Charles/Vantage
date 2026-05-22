'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/FormField';
import { useApiToken } from '@/lib/useApiToken';
import { useAuth } from '@/lib/AuthContext';
import { apiFetch } from '@/lib/api';
import {
  listCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
  addMonths, addDays, startOfWeek, toIsoDate,
  CATEGORY_COLORS, CATEGORY_LABELS,
  type CalendarEvent, type CalendarCategory,
} from '@/lib/calendar';
import { CalendarToolbar, type CalendarView } from '@/components/calendar/CalendarToolbar';
import { MonthView } from '@/components/calendar/MonthView';
import { WeekView } from '@/components/calendar/WeekView';
import { DayView } from '@/components/calendar/DayView';
import type { Task } from '@vantage/types';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as CalendarCategory[];

type EventForm = {
  title: string;
  description: string;
  category: CalendarCategory;
  color: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
};

function emptyForm(category: CalendarCategory = 'other'): EventForm {
  return { title: '', description: '', category, color: CATEGORY_COLORS[category], start_date: toIsoDate(new Date()), end_date: '', all_day: true };
}

export default function CalendarPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [view, setView] = useState<CalendarView>('month');
  const [date, setDate] = useState(new Date());
  const [modal, setModal] = useState<'create' | CalendarEvent | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm());

  // Compute query range based on view
  const { start, end } = useMemo(() => {
    if (view === 'month') {
      const s = new Date(date.getFullYear(), date.getMonth(), 1);
      const e = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      return { start: toIsoDate(s), end: toIsoDate(e) };
    }
    if (view === 'week') {
      const s = startOfWeek(date);
      const e = addDays(s, 6);
      return { start: toIsoDate(s), end: toIsoDate(e) };
    }
    return { start: toIsoDate(date), end: toIsoDate(date) };
  }, [view, date]);

  const { data: eventsData } = useQuery({
    queryKey: ['calendar-events', start, end],
    queryFn: async () => listCalendarEvents(await getToken(), start, end),
  });

  const { data: tasksData } = useQuery({
    queryKey: ['tasks-calendar'],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: Task[] }>('/api/tasks?per_page=100', { token });
    },
  });

  const events = eventsData?.data ?? [];
  const tasks = tasksData?.data ?? [];

  const createMut = useMutation({
    mutationFn: async (f: EventForm) => {
      const token = await getToken();
      return createCalendarEvent(token, {
        title: f.title,
        description: f.description || undefined,
        category: f.category,
        color: f.color !== CATEGORY_COLORS[f.category] ? f.color : undefined,
        start_date: f.start_date,
        end_date: f.end_date || undefined,
        all_day: f.all_day,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calendar-events'] });
      setModal(null);
      setForm(emptyForm());
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: EventForm }) => {
      const token = await getToken();
      return updateCalendarEvent(token, id, {
        title: f.title,
        description: f.description || undefined,
        category: f.category,
        color: f.color !== CATEGORY_COLORS[f.category] ? f.color : undefined,
        start_date: f.start_date,
        end_date: f.end_date || undefined,
        all_day: f.all_day,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calendar-events'] });
      setModal(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteCalendarEvent(await getToken(), id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['calendar-events'] }),
  });

  function openCreate() {
    setForm(emptyForm());
    setModal('create');
  }

  function openEdit(event: CalendarEvent) {
    setForm({
      title: event.title,
      description: event.description ?? '',
      category: event.category as CalendarCategory,
      color: event.color ?? CATEGORY_COLORS[event.category as CalendarCategory],
      start_date: event.start_date,
      end_date: event.end_date ?? '',
      all_day: event.all_day,
    });
    setModal(event);
  }

  function handleNav(dir: 1 | -1) {
    if (view === 'month') setDate(d => addMonths(d, dir));
    else if (view === 'week') setDate(d => addDays(d, dir * 7));
    else setDate(d => addDays(d, dir));
  }

  const viewProps = { events, tasks, isAdmin, onEditEvent: openEdit, onDeleteEvent: (id: string) => deleteMut.mutate(id) };

  return (
    <>
      <Topbar
        action={isAdmin ? <Button variant="primary" onClick={openCreate}>+ Add Event</Button> : undefined}
      />
      <div style={{ padding: 24 }}>
        <CalendarToolbar
          view={view}
          date={date}
          onViewChange={setView}
          onPrev={() => handleNav(-1)}
          onNext={() => handleNav(1)}
          onToday={() => setDate(new Date())}
        />

        {view === 'month' && (
          <MonthView year={date.getFullYear()} month={date.getMonth()} {...viewProps} />
        )}
        {view === 'week' && (
          <WeekView date={date} {...viewProps} />
        )}
        {view === 'day' && (
          <DayView date={date} {...viewProps} />
        )}
      </div>

      {/* Create / Edit modal */}
      {modal !== null && isAdmin && (
        <Modal
          title={modal === 'create' ? 'Add Event' : 'Edit Event'}
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={e => {
              e.preventDefault();
              if (modal === 'create') createMut.mutate(form);
              else updateMut.mutate({ id: (modal as CalendarEvent).id, f: form });
            }}
          >
            <FormField label="Title *">
              <Input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Christmas Day" />
            </FormField>

            <FormField label="Category">
              <select
                value={form.category}
                onChange={e => {
                  const cat = e.target.value as CalendarCategory;
                  setForm(f => ({ ...f, category: cat, color: CATEGORY_COLORS[cat] }));
                }}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit' }}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </FormField>

            <FormField label="Color">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  style={{ width: 40, height: 32, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }}
                />
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{form.color}</span>
              </div>
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Start date *">
                <Input required type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </FormField>
              <FormField label="End date">
                <Input type="date" value={form.end_date} min={form.start_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </FormField>
            </div>

            <FormField label="Description">
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Optional notes…"
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </FormField>

            {(createMut.isError || updateMut.isError) && (
              <p style={{ color: '#ef4444', fontSize: 12, margin: '0 0 8px' }}>Failed to save. Please try again.</p>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button type="button" onClick={() => setModal(null)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? 'Saving…' : modal === 'create' ? 'Add Event' : 'Save'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
