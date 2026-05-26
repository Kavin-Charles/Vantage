'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FormField, Input } from '@/components/ui/FormField';
import { useApiToken } from '@/lib/useApiToken';
import {
  listCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
  eventColor, CATEGORY_COLORS, CATEGORY_LABELS,
  type CalendarEvent, type CalendarCategory,
} from '@/lib/calendar';

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

function emptyForm(): EventForm {
  return { title: '', description: '', category: 'other', color: CATEGORY_COLORS['other'], start_date: '', end_date: '', all_day: true };
}

export default function SettingsCalendarPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<'create' | CalendarEvent | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch events for current year ± 1
  const currentYear = new Date().getFullYear();
  const { data, isLoading } = useQuery({
    queryKey: ['calendar-events-settings'],
    queryFn: async () => listCalendarEvents(await getToken(), `${currentYear - 1}-01-01`, `${currentYear + 2}-12-31`),
  });

  const events = (data?.data ?? []).sort((a, b) => a.start_date.localeCompare(b.start_date));

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
      void qc.invalidateQueries({ queryKey: ['calendar-events-settings'] });
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
      void qc.invalidateQueries({ queryKey: ['calendar-events-settings'] });
      setModal(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteCalendarEvent(await getToken(), id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calendar-events'] });
      void qc.invalidateQueries({ queryKey: ['calendar-events-settings'] });
      setDeletingId(null);
    },
  });

  function openCreate() {
    setForm(emptyForm());
    setModal('create');
  }

  function openEdit(ev: CalendarEvent) {
    setForm({
      title: ev.title,
      description: ev.description ?? '',
      category: ev.category as CalendarCategory,
      color: ev.color ?? CATEGORY_COLORS[ev.category as CalendarCategory],
      start_date: ev.start_date,
      end_date: ev.end_date ?? '',
      all_day: ev.all_day,
    });
    setModal(ev);
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Calendar Events</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
            Manage holidays and company events visible to all team members.
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>+ Add Event</Button>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        ) : events.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No events yet. Add holidays and company events to share with the team.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {['Title', 'Category', 'Date', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => {
                const color = eventColor(ev);
                const dateStr = ev.end_date && ev.end_date !== ev.start_date
                  ? `${ev.start_date} – ${ev.end_date}`
                  : ev.start_date;
                return (
                  <tr key={ev.id} style={{ borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 500, color: 'var(--text)' }}>{ev.title}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: color + '20', color, border: `1px solid ${color}40`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                        {CATEGORY_LABELS[ev.category as CalendarCategory] ?? ev.category}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>{dateStr}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {deletingId === ev.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: '#ef4444' }}>Delete?</span>
                          <Button onClick={() => deleteMut.mutate(ev.id)} disabled={deleteMut.isPending}>
                            {deleteMut.isPending ? '…' : 'Yes'}
                          </Button>
                          <Button onClick={() => setDeletingId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => openEdit(ev)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text2)', fontFamily: 'inherit' }}>Edit</button>
                          <button onClick={() => setDeletingId(ev.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text3)', fontFamily: 'inherit' }}>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal !== null && (
        <Modal title={modal === 'create' ? 'Add Event' : 'Edit Event'} onClose={() => setModal(null)}>
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
    </div>
  );
}
