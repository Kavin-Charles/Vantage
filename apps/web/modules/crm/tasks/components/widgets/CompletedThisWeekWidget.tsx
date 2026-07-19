'use client';

import { useUnifiedTasks } from '../../lib/useUnifiedTasks';
import { WidgetSkeleton, WidgetError } from '@/modules/shared/components/ui/WidgetHelpers';
import { apiFetch } from '@/modules/shared/lib/api';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig, FilterOption } from '@/modules/shared/lib/dashboard-registry';

const fetchUserOptions = async (token: string): Promise<FilterOption[]> => {
  const res = await apiFetch<{ data: { id: string; name: string }[] }>('/api/users', { token });
  return res.data.map(u => ({ label: u.name, value: u.id }));
};

function CompletedThisWeekWidget({ config }: { config: WidgetConfig }) {
  const owner = config.filters?.['owner'] ?? '';
  const { data, isLoading, isError, refetch } = useUnifiedTasks({ status: 'done', owner_id: owner || undefined });
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => void refetch()} />;
  const count = data?.total ?? 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: 8 }}>
      <div style={{ fontSize: 48, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 12, color: 'var(--text3)' }}>Tasks completed this week</div>
    </div>
  );
}

registerDashboardWidget({
  id: 'projects:tasks-completed-week',
  label: 'Completed This Week',
  description: 'Count of tasks completed during the current week',
  icon: 'check',
  category: 'projects',
  module: 'tasks',
  sizeOptions: ['small'],
  defaultSize: 'small',
  defaultW: 2,
  defaultH: 2,
  minW: 2,
  minH: 2,
  supportedFilters: [],
  filterDefs: [
    { key: 'owner', label: 'Owner', type: 'select', fetchOptions: fetchUserOptions, placeholder: 'All owners' },
  ],
  defaultConfig: {},
  component: CompletedThisWeekWidget,
});
