'use client';

import { useUnifiedTasks } from '../../lib/useUnifiedTasks';
import { WidgetSkeleton, WidgetError } from '@/modules/shared/components/ui/WidgetHelpers';
import { registerDashboardWidget } from '@/modules/shared/lib/dashboard-registry';
import type { WidgetConfig } from '@/modules/shared/lib/dashboard-registry';

function CompletedThisWeekWidget({ config: _config }: { config: WidgetConfig }) {
  const { data, isLoading, isError, refetch } = useUnifiedTasks({ status: 'done' });
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
  sizeOptions: ['small'],
  defaultSize: 'small',
  defaultW: 2,
  defaultH: 2,
  minW: 2,
  minH: 2,
  supportedFilters: [],
  defaultConfig: {},
  component: CompletedThisWeekWidget,
});
