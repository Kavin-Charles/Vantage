'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listContacts } from '@vencore/api-client';
import { WidgetSkeleton, WidgetError } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function NewLeadsTodayWidget({ config: _config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'new-leads-today'],
    queryFn: async () => listContacts(await getToken(), { limit: '100' }),
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const contacts = data?.data ?? [];
  const todayCount = contacts.filter(c => new Date(c.created_at) >= startOfToday).length;
  const prospectCount = contacts.filter(c => c.status === 'prospect').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: 16, padding: '0 4px' }}>
      <div>
        <div style={{ fontSize: 48, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{todayCount}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>New leads today</div>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)', fontFamily: 'var(--font-display)' }}>{prospectCount}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Total prospects</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{data?.total ?? 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>All contacts</div>
        </div>
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:contacts-new-today',
  label: 'New Leads Today',
  description: 'Count of new contacts added today plus total prospect count',
  icon: 'users',
  category: 'sales',
  module: 'contacts',
  sizeOptions: ['small', 'medium'],
  defaultSize: 'small',
  defaultW: 2,
  defaultH: 2,
  minW: 2,
  minH: 2,
  supportedFilters: [],
  defaultConfig: {},
  component: NewLeadsTodayWidget,
});
