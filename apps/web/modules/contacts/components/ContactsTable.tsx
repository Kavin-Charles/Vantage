'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { Button } from '@/modules/shared/components/ui/Button';
import { Modal } from '@/modules/shared/components/ui/Modal';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';
import { ContactForm } from './ContactForm';
import { ContactDrawer } from './ContactDrawer';
import { TagManagerPopover } from './TagManagerPopover';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  listContacts, deleteContact,
  listContactTags, attachContactTag, detachContactTag,
} from '@/modules/contacts/lib/contacts';
import { PluginPanelSlot } from '@/modules/shared/components/PluginPanelSlot';
import type { Contact, ContactTag } from '@vencore/types';

type SortField = 'name' | 'created_at' | 'last_contacted_at';
type SortOrder = 'asc' | 'desc';
type StatusFilter = 'prospect' | 'customer' | 'cold' | 'churned' | '';
/** Combined filter value: '' (all), 'status:<value>', or 'tag:<id>' */
type CombinedFilter = string;

const COLS = '1.6fr 1.6fr 1.1fr .9fr 1fr auto';
const PAGE_SIZE = 25;

const eyebrow: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--text3)',
  textTransform: 'uppercase',
  letterSpacing: 1.4,
  cursor: 'pointer',
  userSelect: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'customer', label: 'Customer' },
  { value: 'cold', label: 'Cold' },
  { value: 'churned', label: 'Churned' },
];

function SortArrow({ field, current, order }: { field: SortField; current: SortField; order: SortOrder }) {
  if (field !== current) return <span style={{ color: 'var(--border2)', fontSize: 9 }}>⇅</span>;
  return <span style={{ fontSize: 9 }}>{order === 'asc' ? '↑' : '↓'}</span>;
}

export function ContactsTable() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [modal, setModal] = useState<'create' | Contact | null>(null);
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  // Drawer state synced to ?contact=id URL param
  const drawerContactId = searchParams.get('contact');
  const openDrawer = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('contact', id);
    router.push(`?${params.toString()}`, { scroll: false });
  };
  const closeDrawer = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('contact');
    router.push(`?${params.toString()}`, { scroll: false });
  };
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const { ask: askConfirm, el: confirmEl } = useConfirm();

  // Filter / sort / pagination state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [combinedFilter, setCombinedFilter] = useState<CombinedFilter>('');
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortField>('created_at');
  const [order, setOrder] = useState<SortOrder>('desc');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statusFilter: StatusFilter = combinedFilter.startsWith('status:')
    ? (combinedFilter.slice(7) as StatusFilter)
    : '';
  const tagFilter = combinedFilter.startsWith('tag:') ? combinedFilter.slice(4) : '';

  const tagsQuery = useQuery({
    queryKey: ['contact-tags'],
    queryFn: async () => listContactTags(await getToken()),
    staleTime: 30_000,
  });
  const allTags: ContactTag[] = tagsQuery.data?.data ?? [];

  const invalidateContacts = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['contacts'] });
  }, [qc]);

  const attachTagMut = useMutation({
    mutationFn: async ({ contactId, tagId }: { contactId: string; tagId: string }) =>
      attachContactTag(await getToken(), contactId, tagId),
    onSuccess: invalidateContacts,
  });

  const detachTagMut = useMutation({
    mutationFn: async ({ contactId, tagId }: { contactId: string; tagId: string }) =>
      detachContactTag(await getToken(), contactId, tagId),
    onSuccess: invalidateContacts,
  });

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(v), 300);
  }, []);

  const handleSort = (field: SortField) => {
    if (field === sort) {
      setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder('asc');
    }
    setPage(1);
  };

  const queryParams: Record<string, string> = {
    page: String(page),
    per_page: String(PAGE_SIZE),
    sort,
    order,
  };
  if (debouncedSearch) queryParams['q'] = debouncedSearch;
  if (statusFilter) queryParams['status'] = statusFilter;
  if (tagFilter) queryParams['tag_id'] = tagFilter;

  const queryKey = ['contacts', queryParams];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: async () => listContacts(await getToken(), queryParams),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteContact(await getToken(), id),
    onMutate: (id) => {
      setRemoving(s => new Set(s).add(id));
    },
    onSuccess: (_, id) => {
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['contacts'] });
        setRemoving(s => { const n = new Set(s); n.delete(id); return n; });
      }, 220);
    },
    onError: (_, id) => {
      setRemoving(s => { const n = new Set(s); n.delete(id); return n; });
    },
  });

  const contacts = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 160, maxWidth: 320 }}>
          <svg
            viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search name or email…"
            style={{
              width: '100%',
              paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
              fontSize: 13, borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text)', outline: 'none',
            }}
          />
        </div>

        {/* Status + tag filter */}
        <select
          value={combinedFilter}
          onChange={e => { setCombinedFilter(e.target.value); setPage(1); }}
          aria-label="Filter contacts"
          style={{
            padding: '7px 10px', fontSize: 13, borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: combinedFilter ? 'var(--text)' : 'var(--text3)', outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="">All statuses</option>
          <optgroup label="Status">
            {STATUS_OPTIONS.filter(o => o.value).map(o => (
              <option key={o.value} value={`status:${o.value}`}>{o.label}</option>
            ))}
          </optgroup>
          {allTags.length > 0 && (
            <optgroup label="Tags">
              {allTags.map(t => (
                <option key={t.id} value={`tag:${t.id}`}>{t.name}</option>
              ))}
            </optgroup>
          )}
        </select>

        {/* Manage tags */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setTagManagerOpen(o => !o)}
            aria-label="Manage tags"
            title="Manage tags"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 10, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: tagManagerOpen ? 'var(--surface2)' : 'var(--surface)',
              color: 'var(--text2)',
            }}
          >
            <Icon name="plugin" size={15} />
          </button>
          {tagManagerOpen && (
            <TagManagerPopover
              tags={allTags}
              onClose={() => setTagManagerOpen(false)}
              onChanged={() => {
                void qc.invalidateQueries({ queryKey: ['contact-tags'] });
                invalidateContacts();
              }}
            />
          )}
        </div>

        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
          {isLoading ? '…' : `${total} contacts`}
        </span>
        <Button variant="primary" onClick={() => setModal('create')}>+ Add Contact</Button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '11px 18px', borderBottom: '1px solid var(--border)', gap: 14, alignItems: 'center' }}>
          <span style={eyebrow} onClick={() => handleSort('name')}>
            Name <SortArrow field="name" current={sort} order={order} />
          </span>
          <span style={{ ...eyebrow, cursor: 'default' }}>Email</span>
          <span style={{ ...eyebrow, cursor: 'default' }}>Phone</span>
          <span style={{ ...eyebrow, cursor: 'default' }}>Status</span>
          <span style={eyebrow} onClick={() => handleSort('last_contacted_at')}>
            Last contacted <SortArrow field="last_contacted_at" current={sort} order={order} />
          </span>
          <span />
        </div>

        {isLoading && (
          <TableSkeleton />
        )}

        {isError && !isLoading && (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>Failed to load contacts.</p>
            <Button onClick={() => void refetch()}>Retry</Button>
          </div>
        )}

        {!isLoading && !isError && contacts.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            {debouncedSearch || combinedFilter ? 'No contacts match your filters.' : 'No contacts yet. Add your first one.'}
          </div>
        )}

        {!isLoading && !isError && contacts.map((c, i) => (
          <ContactRow
            key={c.id}
            c={c}
            last={i === contacts.length - 1}
            fading={removing.has(c.id)}
            onRowClick={() => openDrawer(c.id)}
            onEdit={() => setModal(c)}
            onDelete={() =>
              askConfirm({
                title: 'Delete contact',
                message: `Delete ${c.name}? This cannot be undone.`,
                confirmLabel: 'Delete',
                variant: 'danger',
                onConfirm: () => deleteMut.mutate(c.id),
              })
            }
            onContextMenu={e => {
              const assignedIds = new Set((c.tags ?? []).map(t => t.id));
              const items: ContextMenuItem[] = [
                { icon: 'open', label: 'Edit contact', onClick: () => setModal(c) },
                { type: 'separator' },
                { icon: 'phone', label: 'Copy phone', disabled: !c.phone, onClick: () => navigator.clipboard.writeText(c.phone ?? '') },
                { icon: 'mail', label: 'Copy email', onClick: () => navigator.clipboard.writeText(c.email) },
                { icon: 'link', label: 'Copy link', onClick: () => navigator.clipboard.writeText(`${window.location.origin}/contacts/${c.id}`) },
                { type: 'separator' },
                ...(allTags.length > 0 ? [{
                  type: 'submenu' as const,
                  label: 'Tags',
                  icon: 'plugin',
                  items: allTags.map(t => ({
                    label: assignedIds.has(t.id) ? `✓ ${t.name}` : t.name,
                    swatch: t.color,
                    onClick: () => {
                      if (assignedIds.has(t.id)) detachTagMut.mutate({ contactId: c.id, tagId: t.id });
                      else attachTagMut.mutate({ contactId: c.id, tagId: t.id });
                    },
                  })),
                }] : []),
                { type: 'separator' },
                { icon: 'trash', label: 'Delete', danger: true, onClick: () => askConfirm({ title: 'Delete contact', message: `Delete ${c.name}? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger', onConfirm: () => deleteMut.mutate(c.id) }) },
              ];
              openMenu(e, items);
            }}
          />
        ))}
      </div>

      {/* Pagination */}
      {!isLoading && !isError && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>
            Page {page} of {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Button>
            <Button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Button>
          </div>
        </div>
      )}

      <ContextMenu menu={menu} onClose={closeMenu} />
      {confirmEl}

      {modal && (
        <Modal
          title={modal === 'create' ? 'Add contact' : `Edit ${(modal as Contact).name}`}
          onClose={() => setModal(null)}
        >
          <ContactForm
            contact={modal === 'create' ? undefined : (modal as Contact)}
            onDone={() => {
              setModal(null);
              void qc.invalidateQueries({ queryKey: ['contacts'] });
            }}
          />
          {modal !== 'create' && (modal as Contact).id && (
            <PluginPanelSlot recordType="contact" recordId={(modal as Contact).id} />
          )}
        </Modal>
      )}

      {drawerContactId && (
        <ContactDrawer contactId={drawerContactId} onClose={closeDrawer} />
      )}
    </>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'grid', gridTemplateColumns: COLS,
            gap: 14, padding: '13px 18px',
            borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface2)' }} />
            <div style={{ height: 12, width: 100, borderRadius: 6, background: 'var(--surface2)' }} />
          </div>
          {[120, 80, 60, 70].map((w, j) => (
            <div key={j} style={{ height: 12, width: w, borderRadius: 6, background: 'var(--surface2)' }} />
          ))}
          <div />
        </div>
      ))}
    </>
  );
}

function ContactRow({ c, last, fading, onRowClick, onEdit, onDelete, onContextMenu }: {
  c: Contact; last: boolean; fading: boolean;
  onRowClick: () => void; onEdit: () => void; onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={onContextMenu}
      style={{
        display: 'grid', gridTemplateColumns: COLS,
        gap: 14, alignItems: 'center',
        padding: '12px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        opacity: fading ? 0 : 1,
        transition: 'opacity .2s, background .15s',
        fontSize: 13,
      }}
    >
      <span
        onClick={onRowClick}
        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--text)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, flexShrink: 0,
        }}>
          {c.name.charAt(0).toUpperCase()}
        </div>
        <span style={{ color: 'var(--text)', fontWeight: 500, textDecoration: hover ? 'underline' : 'none', textUnderlineOffset: 2 }}>{c.name}</span>
      </span>
      <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</span>
      <span style={{ color: c.phone ? 'var(--text)' : 'var(--text3)' }}>{c.phone ?? '—'}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <Badge label={c.status} color={statusColor[c.status] ?? 'gray'} />
        {(c.tags ?? []).map(t => (
          <span
            key={t.id}
            title={t.name}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10,
              border: `1px solid ${t.color}`, color: t.color, whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
            {t.name}
          </span>
        ))}
      </span>
      <span style={{ color: 'var(--text2)', fontSize: 12 }}>
        {c.last_contacted_at ? new Date(c.last_contacted_at).toLocaleDateString() : '—'}
      </span>
      <span style={{ display: 'flex', gap: 6 }}>
        <Button onClick={onEdit} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12 }}>Edit</Button>
        <Button variant="danger" onClick={onDelete} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12 }}>Delete</Button>
      </span>
    </div>
  );
}
