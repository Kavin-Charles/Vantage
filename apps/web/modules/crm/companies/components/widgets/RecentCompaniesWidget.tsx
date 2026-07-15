'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useModules } from '@/modules/shared/contexts/modules';
import { listCompanies } from '@vencore/api-client';
import { WidgetSkeleton, WidgetError, EmptyState, WidgetHeader, relativeTime } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function RecentCompaniesWidget({ config }: { config: WidgetConfig }) {
  const { isEnabled } = useModules();
  const getToken = useApiToken();
  const router = useRouter();
  const limit = config.limit ?? 8;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['widget', 'companies-recent', limit],
    queryFn: async () => listCompanies(await getToken()),
    staleTime: 60_000,
    enabled: isEnabled('crm'),
  });

  if (!isEnabled('crm')) return null;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;

  const companies = (data?.data ?? []).slice(0, limit);
  if (companies.length === 0) return <EmptyState href="/crm/companies/new" label="Add your first company" icon="building" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WidgetHeader label="Recently Added Companies" href="/crm/companies" />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {companies.map(c => (
          <button
            key={c.id}
            onClick={() => router.push(`/crm/companies/${c.id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text2)', flexShrink: 0 }}>
              {c.name[0]?.toUpperCase()}
            </div>
            <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            {c.industry && <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{c.industry}</span>}
            <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{relativeTime(c.created_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

registerDashboardWidget({
  id: 'sales:companies-recent',
  label: 'Recently Added Companies',
  description: 'Latest companies added to your workspace',
  icon: 'building',
  category: 'sales',
  sizeOptions: ['medium', 'large'],
  defaultSize: 'medium',
  defaultW: 4,
  defaultH: 3,
  minW: 3,
  minH: 2,
  supportedFilters: ['limit'],
  defaultConfig: { limit: 8 },
  component: RecentCompaniesWidget,
});
