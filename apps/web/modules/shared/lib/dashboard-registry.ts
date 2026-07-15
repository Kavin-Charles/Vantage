import type React from 'react';

export interface WidgetConfig {
  timeRange?: '1d' | '7d' | '30d';
  limit?: number;
  compactMode?: boolean;
  chartType?: 'line' | 'bar' | 'pie' | 'area';
  refreshInterval?: number;
  filters?: Record<string, string>;
}

export interface DashboardWidgetDef {
  id: string;
  label: string;
  description?: string;
  defaultW: number;
  defaultH: number;
  minW?: number;
  minH?: number;
  permission?: string;
  component: React.ComponentType;
}

const _registry: DashboardWidgetDef[] = [];

export function registerDashboardWidget(def: DashboardWidgetDef): void {
  if (_registry.some(d => d.id === def.id)) return;
  _registry.push(def);
}

export function getDashboardWidgets(): DashboardWidgetDef[] {
  return _registry;
}

export function getDashboardWidgetById(id: string): DashboardWidgetDef | undefined {
  return _registry.find(d => d.id === id);
}
