'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  PageHeader, FluidButton, FluidInput, FluidTable, FluidBadge, Avatar, EmptyState,
  type FluidColumn,
} from '@/modules/shared/fluid/ui';
import { statusToBadgeTone, statusLabel } from '@/modules/crm/fluid/lib/deriveViews';
import { listContacts } from '@/modules/crm/contacts/lib/contacts';
import { ContactFilters } from './ContactFilters';
import { AddContactModal } from './AddContactModal';
import type { Contact } from '@vencore/types';

interface Row extends Contact {
  company?: { name: string } | null;
  last_activity?: { label: string; at: string } | null;
}

export function ContactsScreen() {
  const router = useRouter();
  const getToken = useApiToken();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('contacts:create');

  const [view, setView] = useState('all');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((v: string) => {
    setQ(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(v), 300);
  }, []);

  const params: Record<string, string> = {};
  if (debouncedQ) params.q = debouncedQ;
  if (view !== 'all') params.view = view;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['contacts', params],
    queryFn: async () => listContacts(await getToken(), params),
  });

  const rows: Row[] = (data?.data ?? []) as Row[];

  const columns: FluidColumn<Row>[] = [
    {
      key: 'name',
      header: 'Name & Role',
      render: r => (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Avatar name={r.name} src={r.avatar_url} size={36} />
          <div>
            <div style={{ fontWeight: 600 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)' }}>{r.title ?? '—'}</div>
          </div>
        </div>
      ),
    },
    { key: 'company', header: 'Company', render: r => r.company?.name ?? '—' },
    {
      key: 'contact',
      header: 'Contact Info',
      render: r => (
        <div>
          <div>{r.email}</div>
          <div style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)' }}>{r.phone ?? ''}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: r => <FluidBadge tone={statusToBadgeTone(r.status)}>{statusLabel(r.status)}</FluidBadge>,
    },
    { key: 'activity', header: 'Last Activity', render: r => r.last_activity?.label ?? '—' },
  ];

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle="Manage your network and track engagement across the pipeline."
        actions={(
          <>
            <div style={{ width: 320 }}>
              <FluidInput value={q} onChange={handleSearch} placeholder="Find contact…" icon="search" />
            </div>
            {canWrite ? (
              <FluidButton icon="add" onClick={() => setAdding(true)}>Add Contact</FluidButton>
            ) : null}
          </>
        )}
      />
      <ContactFilters active={view} onChange={setView} />
      <div style={{ marginTop: 24 }}>
        {!isLoading && rows.length === 0 ? (
          <EmptyState
            icon="person_search"
            title="No contacts found"
            message={debouncedQ || view !== 'all' ? 'Try a different search or view.' : 'Add your first contact to get started.'}
          />
        ) : (
          <FluidTable
            columns={columns}
            rows={rows}
            rowKey={r => r.id}
            onRowClick={r => router.push(`/crm/contacts/${r.id}`)}
          />
        )}
      </div>
      <AddContactModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={() => { setAdding(false); void refetch(); }}
      />
    </>
  );
}
