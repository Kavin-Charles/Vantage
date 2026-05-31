'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { FormField, Select, Textarea } from '@/components/ui/FormField';
import { useApiToken } from '@/lib/useApiToken';
import { listActivity, createActivity } from '@/lib/activity';
import { ModuleGuard } from '@/components/ModuleGuard';
import type { Activity, ActivityType } from '@vantage/types';

const TYPE_ICONS: Record<string, string> = {
  email:           'mail',
  call:            'phone',
  note:            'note',
  meeting:         'meeting',
  deal_change:     'arrow',
  contact_created: 'contacts',
};

const TYPE_LABELS: Record<string, string> = {
  email:           'Email',
  call:            'Call',
  note:            'Note',
  meeting:         'Meeting',
  deal_change:     'Deal Change',
  contact_created: 'Contact Created',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ActivityPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<{ type: ActivityType; body: string }>({ type: 'note', body: '' });
  const [offset, setOffset] = useState(0);
  const LIMIT = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['activity', offset],
    queryFn: async () => listActivity(await getToken(), { limit: LIMIT, offset }),
  });

  const createMut = useMutation({
    mutationFn: async () => createActivity(await getToken(), form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activity'] });
      setModal(false);
      setForm({ type: 'note', body: '' });
      setOffset(0);
    },
  });

  const items: Activity[] = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <ModuleGuard moduleId="activity">
      <Topbar action={<Button variant="primary" onClick={() => setModal(true)}>+ Log Activity</Button>} />
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text2)' }}>
          {total} total activities
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No activity yet.</div>
          ) : items.map((item, i) => (
            <ActivityRow key={item.id} item={item} last={i === items.length - 1} />
          ))}
        </div>

        {total > LIMIT && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <Button disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMIT))}>
              Previous
            </Button>
            <span style={{ fontSize: 13, color: 'var(--text2)', padding: '6px 12px' }}>
              {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
            </span>
            <Button disabled={offset + LIMIT >= total} onClick={() => setOffset(o => o + LIMIT)}>
              Next
            </Button>
          </div>
        )}
      </div>

      {modal && (
        <Modal title="Log activity" onClose={() => setModal(false)}>
          <form onSubmit={e => { e.preventDefault(); createMut.mutate(); }}>
            <FormField label="Type">
              <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as ActivityType }))}>
                <option value="note">Note</option>
                <option value="email">Email</option>
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
              </Select>
            </FormField>
            <FormField label="Details">
              <Textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="What happened?"
                rows={4}
              />
            </FormField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <Button type="button" onClick={() => setModal(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={createMut.isPending}>
                {createMut.isPending ? 'Saving…' : 'Log'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </ModuleGuard>
  );
}

function ActivityRow({ item, last }: { item: Activity; last: boolean }) {
  const [hover, setHover] = useState(false);
  const iconName = TYPE_ICONS[item.type] ?? 'note';
  const label = TYPE_LABELS[item.type] ?? item.type;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', gap: 14, padding: '14px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text2)', flexShrink: 0,
      }}>
        <Icon name={iconName} size={15} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {label}
          </span>
          {item.type === 'email' && item.meta && (() => {
            const direction = item.meta['direction'];
            return (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                background: direction === 'outbound' ? 'var(--blue-bg)' : 'var(--surface2)',
                color: direction === 'outbound' ? 'var(--blue)' : 'var(--text2)',
                textTransform: 'uppercase' as const,
                letterSpacing: 1,
              }}>
                {typeof direction === 'string' ? direction : 'inbound'}
              </span>
            );
          })()}
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {timeAgo(item.created_at as unknown as string)}
          </span>
        </div>
        {item.body && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
            {item.body}
          </p>
        )}
      </div>
    </div>
  );
}
