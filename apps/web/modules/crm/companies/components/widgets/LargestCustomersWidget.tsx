'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listCompanies, listContacts } from '@vencore/api-client';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function LargestCustomersWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const limit = config.limit ?? 6;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'largest-customers', limit],
    queryFn: async () => {
      const token = await getToken();
      const [companiesRes, contactsRes] = await Promise.all([
        listCompanies(token),
        listContacts(token, { limit: '500' }),
      ]);
      // Count contacts per company as a proxy for customer relationship depth
      const contactCounts: Record<string, number> = {};
      (contactsRes?.data ?? []).forEach(contact => {
        if (!contact.company_id) return;
        contactCounts[contact.company_id] = (contactCounts[contact.company_id] ?? 0) + 1;
      });
      return (companiesRes?.data ?? [])
        .map(c => ({ ...c, contactCount: contactCounts[c.id] ?? 0 }))
        .sort((a, b) => b.contactCount - a.contactCount || (b.employee_count ?? 0) - (a.employee_count ?? 0))
        .slice(0, limit);
    },
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;
  if (!data || data.length === 0) return <EmptyState href="/crm/companies" label="No companies yet" icon="building" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Largest Customers" href="/crm/companies" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {data.map((c, i) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', width: 16, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            {c.employee_count != null && (
              <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{c.employee_count} emp</span>
            )}
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', flexShrink: 0 }}>
              {c.contactCount} contact{c.contactCount !== 1 ? 's' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:companies-largest',
  label: 'Largest Customers',
  description: 'Companies ranked by number of contacts and team size',
  icon: 'building',
  category: 'sales',
  module: 'companies',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: ['limit'],
  defaultConfig: { limit: 6 },
  component: LargestCustomersWidget,
});
