'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listContacts } from '@/modules/contacts/lib/contacts';
import { Badge, statusColor } from '@/modules/shared/components/ui/Badge';
import { WidgetSkeleton, WidgetError, Stat, EmptyState } from '@/modules/shared/components/ui/WidgetHelpers';
import type { Contact } from '@vencore/types';

export function ContactsWidget() {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'contacts'],
    queryFn: async () => listContacts(await getToken(), { per_page: '5' }),
    staleTime: 60_000,
    enabled: isEnabled('contacts'),
  });

  if (!isEnabled('contacts')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const contacts = data?.data ?? [];
  const total = data?.total ?? 0;
  const prospects = contacts.filter(c => c.status === 'prospect').length;
  const customers = contacts.filter(c => c.status === 'customer').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', gap: 20 }}>
        <Stat label="Total" value={total} />
        <Stat label="Prospects" value={prospects} color="var(--blue)" />
        <Stat label="Customers" value={customers} color="var(--green)" />
      </div>

      {contacts.length === 0 ? (
        <EmptyState href="/contacts" label="Add your first contact" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {contacts.map((c: Contact, i: number) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '7px 0',
                borderBottom: i < contacts.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'var(--text)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </span>
              </div>
              <Badge label={c.status} color={statusColor[c.status] ?? 'gray'} />
            </div>
          ))}
        </div>
      )}

      <Link
        href="/contacts"
        style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none', marginTop: 'auto' }}
      >
        All contacts →
      </Link>
    </div>
  );
}
