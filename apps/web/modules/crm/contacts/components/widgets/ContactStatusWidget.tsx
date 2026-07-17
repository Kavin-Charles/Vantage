'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listContacts } from '@vencore/api-client';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, MiniBar } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

const STATUSES = ['prospect', 'customer', 'cold', 'churned'] as const;
const STATUS_COLOR: Record<string, string> = {
  prospect: 'var(--blue)', customer: 'var(--green)', cold: 'var(--text3)', churned: 'var(--red)',
};

function ContactStatusWidget({ config: _config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'contact-status'],
    queryFn: async () => listContacts(await getToken(), { limit: '200' }),
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const contacts = data?.data ?? [];
  if (contacts.length === 0) return <EmptyState href="/crm/contacts/new" label="Add your first contact" icon="users" />;

  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = contacts.filter(c => c.status === s).length; return acc;
  }, {});
  const max = Math.max(...Object.values(counts), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4 }}>
      <WidgetHeader label="Lead Status Breakdown" href="/crm/contacts" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
        {STATUSES.map(s => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)', width: 72, textTransform: 'capitalize', flexShrink: 0 }}>{s}</span>
            <MiniBar value={counts[s] ?? 0} max={max} color={STATUS_COLOR[s]} />
            <span style={{ fontSize: 13, fontWeight: 700, color: STATUS_COLOR[s], width: 28, textAlign: 'right', flexShrink: 0, fontFamily: 'var(--font-display)' }}>{counts[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:contacts-status',
  label: 'Lead Status Breakdown',
  description: 'Bar breakdown of contacts by prospect / customer / cold / churned',
  icon: 'chart-bar',
  category: 'sales',
  module: 'contacts',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'small',
  defaultW: 3,
  defaultH: 3,
  minW: 2,
  minH: 2,
  supportedFilters: [],
  defaultConfig: {},
  component: ContactStatusWidget,
});
