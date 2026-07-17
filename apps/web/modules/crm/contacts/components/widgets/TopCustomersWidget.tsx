'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listContacts } from '@vencore/api-client';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig, FilterOption } from '@/modules/shared/lib/dashboard-registry';

const STATUS_OPTIONS: FilterOption[] = [
  { label: 'Prospect', value: 'prospect' },
  { label: 'Customer', value: 'customer' },
  { label: 'Cold', value: 'cold' },
  { label: 'Churned', value: 'churned' },
];

const STATUS_COLOR: Record<string, string> = {
  prospect: 'var(--blue)', customer: 'var(--green)', cold: 'var(--text3)', churned: 'var(--red)',
};

function TopCustomersWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();
  const limit = config.limit ?? 8;
  const status = config.filters?.['status'] ?? 'customer';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'top-customers', limit, status],
    queryFn: async () => listContacts(await getToken(), { status, limit: String(limit) }),
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const contacts = data?.data ?? [];
  if (contacts.length === 0) return <EmptyState href="/crm/contacts" label="No customers yet" icon="users" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Top Customers" href="/crm/contacts" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {contacts.map((c, i) => (
          <button
            key={c.id}
            onClick={() => router.push(`/crm/contacts/${c.id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            <span style={{ fontSize: 11, color: 'var(--text3)', width: 16, flexShrink: 0 }}>{i + 1}</span>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>
              {c.name[0]?.toUpperCase()}
            </div>
            <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, flexShrink: 0,
              color: STATUS_COLOR[c.status] ?? 'var(--text3)', background: 'var(--surface2)',
              textTransform: 'capitalize',
            }}>{c.status}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:contacts-top-customers',
  label: 'Top Customers',
  description: 'Your customer contacts — keep your most important relationships visible',
  icon: 'star',
  category: 'sales',
  module: 'contacts',
  filterDefs: [
    { key: 'status', label: 'Status', type: 'pills', options: STATUS_OPTIONS },
  ],
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: ['limit'],
  defaultConfig: { limit: 8 },
  component: TopCustomersWidget,
});
