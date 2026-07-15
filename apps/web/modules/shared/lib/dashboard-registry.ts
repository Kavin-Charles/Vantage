import type React from 'react';

export type WidgetCategory = 'sales' | 'projects' | 'infra' | 'communication' | 'insights';
export type WidgetSize = 'small' | 'medium' | 'large' | 'wide' | 'full';
export type WidgetFilterKey =
  | 'timeRange'
  | 'limit'
  | 'compactMode'
  | 'chartType'
  | 'refreshInterval'
  | 'owner'
  | 'status';

export const CATEGORY_ORDER: WidgetCategory[] = [
  'sales',
  'projects',
  'infra',
  'communication',
  'insights',
];

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
  description: string;
  icon?: string;
  category?: WidgetCategory;
  sizeOptions?: WidgetSize[];
  defaultSize?: WidgetSize;
  defaultW: number;
  defaultH: number;
  minW?: number;
  minH?: number;
  permission?: string;
  supportedFilters?: WidgetFilterKey[];
  defaultConfig?: WidgetConfig;
  component: React.ComponentType<{ config?: WidgetConfig }>;
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

export function getDashboardWidgetsByCategory(): Map<WidgetCategory, DashboardWidgetDef[]> {
  const map = new Map<WidgetCategory, DashboardWidgetDef[]>();
  for (const category of CATEGORY_ORDER) {
    const widgets = _registry.filter(d => d.category === category);
    if (widgets.length > 0) {
      map.set(category, widgets);
    }
  }
  return map;
}
