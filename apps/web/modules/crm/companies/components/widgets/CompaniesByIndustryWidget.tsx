'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listCompanies } from '@vencore/api-client';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, MiniBar } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import { STAGE_COLORS } from '@/modules/shared/lib/chart-colors';

function CompaniesByIndustryWidget({ config: _config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'companies-by-industry'],
    queryFn: async () => listCompanies(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const companies = data?.data ?? [];
  if (companies.length === 0) return <EmptyState href="/crm/companies/new" label="Add your first company" icon="building" />;

  const counts: Record<string, number> = {};
  companies.forEach(c => { const k = c.industry ?? 'Other'; counts[k] = (counts[k] ?? 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = sorted[0]?.[1] ?? 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Companies by Industry" href="/crm/companies" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
        {sorted.map(([industry, count], i) => (
          <div key={industry} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)', width: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{industry}</span>
            <MiniBar value={count} max={max} color={STAGE_COLORS[i % STAGE_COLORS.length] ?? 'var(--text3)'} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', width: 20, textAlign: 'right', flexShrink: 0 }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:companies-by-industry',
  label: 'Companies by Industry',
  description: 'Bar breakdown of companies grouped by industry',
  icon: 'chart-bar',
  category: 'sales',
  module: 'companies',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: [],
  defaultConfig: {},
  component: CompaniesByIndustryWidget,
});
