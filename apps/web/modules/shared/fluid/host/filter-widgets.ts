import type { DashboardWidgetDef } from '@/modules/shared/lib/dashboard-registry';

export function visibleWidgets(
  all: DashboardWidgetDef[],
  hasPermission: (key: string) => boolean,
  isModuleEnabled: (id: string) => boolean,
): DashboardWidgetDef[] {
  return all.filter(w => {
    if (w.permission && !hasPermission(w.permission)) return false;
    if (w.module && !isModuleEnabled(w.module)) return false;
    return true;
  });
}
