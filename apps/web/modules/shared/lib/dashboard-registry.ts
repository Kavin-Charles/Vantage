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

// --- New types ---

export interface FilterOption {
  label: string;
  value: string;
}

export interface WidgetFilterDef {
  key: string;
  label: string;
  type: 'pills' | 'select';
  options?: FilterOption[];
  fetchOptions?: (token: string) => Promise<FilterOption[]>;
  placeholder?: string;
  multi?: boolean;
}

export interface ModuleDef {
  id: string;
  label: string;
}

export const CATEGORY_MODULES: Record<WidgetCategory, ModuleDef[]> = {
  sales: [
    { id: 'contacts', label: 'Contacts' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'companies', label: 'Companies' },
  ],
  projects: [
    { id: 'tasks', label: 'Tasks' },
    { id: 'projects', label: 'Projects' },
  ],
  infra: [
    { id: 'servers', label: 'Servers' },
    { id: 'databases', label: 'Databases' },
    { id: 'websites', label: 'Websites' },
  ],
  communication: [],
  insights: [
    { id: 'analytics', label: 'Analytics' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'activity', label: 'Activity' },
  ],
};

// --- End new types ---

export interface DashboardWidgetDef {
  id: string;
  label: string;
  description: string;
  icon: string;
  iconEl?: React.ReactNode;       // NEW: takes precedence over icon when present
  category: WidgetCategory;
  module?: string;                // NEW: e.g. 'contacts', 'pipeline', 'servers'
  sizeOptions: WidgetSize[];
  defaultSize: WidgetSize;
  defaultW: number;
  defaultH: number;
  minW?: number;
  minH?: number;
  permission?: string;
  supportedFilters?: WidgetFilterKey[];
  filterDefs?: WidgetFilterDef[]; // NEW: widget-specific dynamic/static filter controls
  defaultConfig?: WidgetConfig;
  component: React.ComponentType<{ config: WidgetConfig }>;
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

export function getDashboardWidgetsByCategory(category: WidgetCategory): DashboardWidgetDef[] {
  return _registry.filter(d => d.category === category);
}
