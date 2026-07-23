'use client';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useModules } from '@/modules/shared/contexts/modules';
import { getDashboardWidgets } from '@/modules/shared/lib/dashboard-registry';
import { visibleWidgets } from './filter-widgets';
import { FluidWidgetCard } from './FluidWidgetCard';

export function FluidBentoGrid() {
  const { hasPermission } = useAuth();
  const { isEnabled } = useModules();
  const widgets = visibleWidgets(getDashboardWidgets(), hasPermission, isEnabled);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 24 }}>
      {widgets.map(w => {
        const Comp = w.component;
        return (
          <div key={w.id} style={{ gridColumn: `span ${Math.min(w.defaultW, 12)}` }}>
            <FluidWidgetCard title={w.label}>
              <Comp config={w.defaultConfig ?? {}} />
            </FluidWidgetCard>
          </div>
        );
      })}
    </div>
  );
}
