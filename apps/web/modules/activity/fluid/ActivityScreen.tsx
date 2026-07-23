'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import { listActivity, createActivity } from '@/modules/activity/lib/activity';
import {
  PageHeader,
  GlassCard,
  MSIcon,
  FluidBadge,
  FluidChip,
  FluidButton,
  FluidModal,
  FluidSelect,
  EmptyState,
} from '@/modules/shared/fluid/ui';
import type { Activity, ActivityType } from '@vencore/types';

const TYPE_ICONS: Record<ActivityType, string> = {
  email: 'mail',
  call: 'call',
  note: 'notes',
  meeting: 'groups',
  deal_change: 'swap_horiz',
  infra_alert: 'warning',
};

const TYPE_LABELS: Record<ActivityType, string> = {
  email: 'Email',
  call: 'Call',
  note: 'Note',
  meeting: 'Meeting',
  deal_change: 'Deal Change',
  infra_alert: 'Infra Alert',
};

const TYPE_TONE: Record<ActivityType, 'blue' | 'gold' | 'green' | 'red' | 'neutral'> = {
  email: 'blue',
  call: 'green',
  note: 'neutral',
  meeting: 'gold',
  deal_change: 'blue',
  infra_alert: 'red',
};

// All types the feed can display and filter by.
const FILTERABLE_TYPES: ActivityType[] = ['note', 'email', 'call', 'meeting', 'deal_change', 'infra_alert'];
// Types a user can manually log via the modal (matches the legacy dashboard form).
const LOGGABLE_TYPES: ActivityType[] = ['note', 'email', 'call', 'meeting'];

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

export function ActivityScreen() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('activity:create');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<{ type: ActivityType; body: string }>({ type: 'note', body: '' });
  const [offset, setOffset] = useState(0);
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all');
  const LIMIT = 25;
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const { data, isLoading } = useQuery({
    queryKey: ['activity', offset],
    queryFn: async () => listActivity(await getToken(), { limit: LIMIT, offset }),
  });

  const createMut = useMutation({
    mutationFn: async () => createActivity(await getToken(), form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activity'] });
      closeModal();
      setOffset(0);
    },
  });

  const items: Activity[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const filtered = typeFilter === 'all' ? items : items.filter(i => i.type === typeFilter);

  function closeModal() {
    setModalOpen(false);
    setForm({ type: 'note', body: '' });
  }

  return (
    <>
      <PageHeader
        title="Activity"
        subtitle={`${total} total activities`}
        actions={
          canCreate ? (
            <FluidButton icon="add" onClick={() => setModalOpen(true)}>
              Log Activity
            </FluidButton>
          ) : undefined
        }
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <FluidChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
          All
        </FluidChip>
        {FILTERABLE_TYPES.map(t => (
          <FluidChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
            {TYPE_LABELS[t]}
          </FluidChip>
        ))}
      </div>

      {isLoading ? (
        <ActivitySkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="history"
          title={typeFilter === 'all' ? 'No activity yet' : `No ${TYPE_LABELS[typeFilter]} activity`}
          message={typeFilter === 'all' ? 'Logged activity will appear here.' : 'Try a different filter, or clear it to see everything.'}
        />
      ) : (
        <GlassCard style={{ padding: 0 }}>
          {filtered.map((item, i) => (
            <ActivityRow
              key={item.id}
              item={item}
              last={i === filtered.length - 1}
              onContextMenu={e => {
                const menuItems: ContextMenuItem[] = [
                  ...(item.body
                    ? [{ icon: 'copy', label: 'Copy text', onClick: () => navigator.clipboard.writeText(item.body ?? '') } as ContextMenuItem]
                    : []),
                ];
                openMenu(e, menuItems);
              }}
            />
          ))}
        </GlassCard>
      )}

      {total > LIMIT && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
          <FluidButton variant="ghost" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMIT))}>
            Previous
          </FluidButton>
          <span style={{ fontFamily: 'var(--fl-font-body)', fontSize: 13, color: 'var(--fl-on-surface-variant)', padding: '0 8px' }}>
            {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <FluidButton variant="ghost" disabled={offset + LIMIT >= total} onClick={() => setOffset(o => o + LIMIT)}>
            Next
          </FluidButton>
        </div>
      )}

      <ContextMenu menu={menu} onClose={closeMenu} />

      <FluidModal open={modalOpen} onClose={closeModal} title="Log Activity" subtitle="Record a note, call, email, or meeting.">
        <form
          onSubmit={e => {
            e.preventDefault();
            createMut.mutate();
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FluidSelect
              value={form.type}
              onChange={v => setForm(f => ({ ...f, type: v as ActivityType }))}
              options={LOGGABLE_TYPES.map(t => ({ value: t, label: TYPE_LABELS[t] }))}
            />
            <FluidTextarea
              value={form.body}
              onChange={v => setForm(f => ({ ...f, body: v }))}
              placeholder="What happened?"
              rows={4}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
              <FluidButton type="button" variant="ghost" onClick={closeModal}>
                Cancel
              </FluidButton>
              <FluidButton type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? 'Saving…' : 'Log'}
              </FluidButton>
            </div>
          </div>
        </form>
      </FluidModal>
    </>
  );
}

function FluidTextarea({
  value, onChange, placeholder, rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        width: '100%', padding: '12px 16px', resize: 'vertical',
        borderRadius: 'var(--fl-radius-input)', fontFamily: 'var(--fl-font-body)', fontSize: 15,
        color: 'var(--fl-on-surface)', background: 'var(--fl-surface-container-lowest)',
        border: `1px solid ${focus ? 'var(--fl-primary)' : 'var(--fl-outline-variant)'}`,
        boxShadow: focus ? '0 0 0 3px rgba(0,72,206,0.15)' : 'none',
        outline: 'none', transition: 'border-color .2s, box-shadow .2s',
      }}
    />
  );
}

function ActivityRow({
  item, last, onContextMenu,
}: {
  item: Activity;
  last: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  const iconName = TYPE_ICONS[item.type] ?? 'notes';
  const label = TYPE_LABELS[item.type] ?? item.type;
  const tone = TYPE_TONE[item.type] ?? 'neutral';

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex', gap: 14, padding: '16px 20px',
        borderBottom: last ? 'none' : '1px solid var(--fl-outline-variant)',
        background: hover ? 'var(--fl-surface-container)' : 'transparent',
        transition: 'background .12s',
      }}
    >
      <div
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--fl-surface-container)', border: '1px solid var(--fl-outline-variant)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--fl-on-surface-variant)', flexShrink: 0,
        }}
      >
        <MSIcon name={iconName} size={17} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <FluidBadge tone={tone}>{label}</FluidBadge>
          {item.type === 'email' && item.meta && (() => {
            const direction = item.meta['direction'];
            const outbound = direction === 'outbound';
            return <FluidBadge tone={outbound ? 'blue' : 'neutral'}>{typeof direction === 'string' ? direction : 'inbound'}</FluidBadge>;
          })()}
          <span style={{ fontFamily: 'var(--fl-font-body)', fontSize: 11, color: 'var(--fl-on-surface-variant)' }}>
            {timeAgo(item.created_at as unknown as string)}
          </span>
        </div>
        {item.body && (
          <p style={{ margin: 0, fontFamily: 'var(--fl-font-body)', fontSize: 14, color: 'var(--fl-on-surface)', lineHeight: 1.5 }}>
            {item.body}
          </p>
        )}
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 56,
            borderRadius: 'var(--fl-radius-input)',
            background: 'var(--fl-surface-container)',
            animation: 'flActivityPulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 100}ms`,
          }}
        >
          <style>{`@keyframes flActivityPulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
        </div>
      ))}
    </div>
  );
}
