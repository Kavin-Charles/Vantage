'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listContacts, updateContact, deleteContact } from '@/modules/contacts/lib/contacts';
import { createActivity } from '@vencore/api-client';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import { WidgetSkeleton, WidgetError } from '@/modules/shared/components/ui/WidgetHelpers';
import type { Contact, ContactStatus } from '@vencore/types';

const STATUSES: ContactStatus[] = ['prospect', 'customer', 'cold', 'churned'];

const FILTERS: { value: '' | ContactStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'customer', label: 'Customer' },
  { value: 'cold', label: 'Cold' },
  { value: 'churned', label: 'Churned' },
];

// Swatch colours for the status submenu — pulled from the design tokens so the
// menu reads the same as the badges elsewhere in the app.
const STATUS_SWATCH: Record<ContactStatus, string> = {
  prospect: 'var(--blue)',
  customer: 'var(--green)',
  cold: 'var(--text3)',
  churned: 'var(--red)',
};

function relativeTime(value: Date | string | null): string {
  if (!value) return 'Never';
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  if (diff < 0) return 'just now';
  const day = 86_400_000;
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ContactsWidget() {
  const { isEnabled } = useModules();
  const enabled = isEnabled('crm');
  const getToken = useApiToken();
  const router = useRouter();
  const qc = useQueryClient();
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const [filter, setFilter] = useState<'' | ContactStatus>('');
  const [staleFirst, setStaleFirst] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Per-status totals — one lightweight call each (per_page=1, read `total`).
  // This is accurate workspace-wide, unlike counting within the fetched page.
  const statCounts = useQueries({
    queries: STATUSES.map((s) => ({
      queryKey: ['widget', 'contacts', 'count', s],
      queryFn: async () => {
        const res = await listContacts(await getToken(), { status: s, per_page: '1' });
        return res.total;
      },
      staleTime: 60_000,
      enabled,
    })),
  });

  const listQuery = useQuery({
    queryKey: ['widget', 'contacts', 'list', filter, staleFirst],
    queryFn: async () => {
      const params: Record<string, string> = {
        per_page: '6',
        sort: staleFirst ? 'last_contacted_at' : 'created_at',
        order: staleFirst ? 'asc' : 'desc',
      };
      if (filter) params['status'] = filter;
      return listContacts(await getToken(), params);
    },
    staleTime: 60_000,
    enabled,
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['widget', 'contacts'] });
    void qc.invalidateQueries({ queryKey: ['contacts'] });
  }, [qc]);

  const setStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ContactStatus }) =>
      updateContact(await getToken(), id, { status }),
    onSuccess: invalidate,
  });

  const markContactedMut = useMutation({
    mutationFn: async (id: string) =>
      createActivity(await getToken(), { type: 'note', body: 'Marked as contacted', contact_id: id }),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteContact(await getToken(), id),
    onSuccess: invalidate,
  });

  const contacts = useMemo<Contact[]>(() => listQuery.data?.data ?? [], [listQuery.data]);
  const total = statCounts.reduce((sum, q) => sum + (q.data ?? 0), 0);
  const counts = Object.fromEntries(STATUSES.map((s, i) => [s, statCounts[i]?.data ?? 0])) as Record<ContactStatus, number>;

  const openDrawer = useCallback((id: string) => router.push(`/crm/contacts?contact=${id}`), [router]);

  function buildMenu(c: Contact): ContextMenuItem[] {
    return [
      { type: 'header', label: c.name },
      { type: 'separator' },
      { label: 'Open', icon: 'open', onClick: () => openDrawer(c.id) },
      { label: 'Copy email', icon: 'copy', onClick: () => void navigator.clipboard?.writeText(c.email) },
      { label: 'Mark contacted', icon: 'user-check', onClick: () => markContactedMut.mutate(c.id) },
      {
        type: 'submenu',
        label: 'Set status',
        icon: 'edit',
        items: STATUSES.map((s) => ({
          label: s.charAt(0).toUpperCase() + s.slice(1),
          swatch: STATUS_SWATCH[s],
          disabled: c.status === s,
          onClick: () => setStatusMut.mutate({ id: c.id, status: s }),
        })),
      },
      { type: 'separator' },
      { label: 'Delete', icon: 'trash', danger: true, onClick: () => deleteMut.mutate(c.id) },
    ];
  }

  function onRowKeyDown(e: React.KeyboardEvent, i: number, c: Contact) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(i + 1, contacts.length - 1);
      setFocusIdx(next);
      rowRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(i - 1, 0);
      setFocusIdx(prev);
      rowRefs.current[prev]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDrawer(c.id);
    } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const rect = rowRefs.current[i]?.getBoundingClientRect();
      if (rect) {
        openMenu(
          { preventDefault() {}, stopPropagation() {}, clientX: rect.left + 24, clientY: rect.bottom } as unknown as React.MouseEvent,
          buildMenu(c),
        );
      }
    }
  }

  if (!enabled) return null;
  if (listQuery.isLoading) return <WidgetSkeleton />;
  if (listQuery.isError) return <WidgetError onRetry={() => void listQuery.refetch()} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      {/* Stat row — each stat navigates to the filtered contacts list */}
      <div style={{ display: 'flex', gap: 18 }}>
        <StatButton label="Total" value={total} onClick={() => router.push('/crm/contacts')} />
        <StatButton label="Prospects" value={counts.prospect} color="var(--blue)" onClick={() => router.push('/crm/contacts?status=prospect')} />
        <StatButton label="Customers" value={counts.customer} color="var(--green)" onClick={() => router.push('/crm/contacts?status=customer')} />
      </div>

      {/* Filter tabs + stale toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Filter contacts by status" style={{ display: 'flex', gap: 4, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value || 'all'}
                role="tab"
                aria-selected={active}
                onClick={() => { setFilter(f.value); setFocusIdx(0); }}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7, cursor: 'pointer',
                  border: '1px solid ' + (active ? 'var(--text)' : 'var(--border)'),
                  background: active ? 'var(--text)' : 'transparent',
                  color: active ? 'var(--surface)' : 'var(--text2)',
                  transition: 'background .12s, color .12s, border-color .12s',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => { setStaleFirst((v) => !v); setFocusIdx(0); }}
          aria-pressed={staleFirst}
          title={staleFirst ? 'Showing least-recently contacted first' : 'Showing newest first'}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
            padding: '3px 8px', borderRadius: 7, cursor: 'pointer',
            border: '1px solid ' + (staleFirst ? 'var(--amber)' : 'var(--border)'),
            background: staleFirst ? 'var(--amber-bg)' : 'transparent',
            color: staleFirst ? 'var(--amber)' : 'var(--text2)',
          }}
        >
          <Icon name="clock" size={13} />
          Needs follow-up
        </button>
      </div>

      {/* Contact rows */}
      {contacts.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text3)' }}>
          {filter ? `No ${filter} contacts.` : 'No contacts yet.'}
        </div>
      ) : (
        <div role="list" aria-label="Recent contacts" style={{ display: 'flex', flexDirection: 'column' }}>
          {contacts.map((c, i) => {
            const never = !c.last_contacted_at;
            return (
              <div
                key={c.id}
                ref={(el) => { rowRefs.current[i] = el; }}
                role="listitem"
                tabIndex={i === focusIdx ? 0 : -1}
                aria-label={`${c.name}, ${c.status}, last contacted ${relativeTime(c.last_contacted_at)}`}
                onClick={() => openDrawer(c.id)}
                onKeyDown={(e) => onRowKeyDown(e, i, c)}
                onContextMenu={(e) => openMenu(e, buildMenu(c))}
                onFocus={() => setFocusIdx(i)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: '7px 6px', borderRadius: 8, cursor: 'pointer', outline: 'none',
                  borderBottom: i < contacts.length - 1 ? '1px solid var(--border)' : 'none',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', background: 'var(--text)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.email}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: never ? 'var(--amber)' : 'var(--text3)', whiteSpace: 'nowrap' }}>
                    {relativeTime(c.last_contacted_at)}
                  </span>
                  <Badge label={c.status} color={statusColor[c.status] ?? 'gray'} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => router.push('/crm/contacts')}
        style={{
          fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none',
          cursor: 'pointer', marginTop: 'auto', textAlign: 'left', padding: '2px 0',
        }}
      >
        All contacts →
      </button>

      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}

function StatButton({ label, value, color, onClick }: { label: string; value: number; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={`${value} ${label}`}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2, background: 'none', border: 'none',
        cursor: 'pointer', padding: 0, textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--text)', fontFamily: 'var(--font-display)' }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        {label}
      </span>
    </button>
  );
}
