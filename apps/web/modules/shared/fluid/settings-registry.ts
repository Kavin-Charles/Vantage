import type { ComponentType } from 'react';

export type SettingsScope = 'personal' | 'workspace';

export interface SettingsEntryDef {
  id: string;
  scope: SettingsScope;
  label: string;
  icon: string;          // Material Symbols name
  order?: number;        // lower = earlier; unset sorts after all ordered entries
  permission?: string;   // RBAC gate key (checked at render by consumers)
  adminOnly?: boolean;   // workspace-scope admin gate
  component: ComponentType;
}

const _registry: SettingsEntryDef[] = [];

export function registerSettingsEntry(def: SettingsEntryDef): void {
  if (_registry.some(d => d.id === def.id)) return;
  _registry.push(def);
}

export function getSettingsEntries(scope: SettingsScope): SettingsEntryDef[] {
  const ORDER_MAX = Number.MAX_SAFE_INTEGER;
  return _registry
    .filter(d => d.scope === scope)
    .sort((a, b) => (a.order ?? ORDER_MAX) - (b.order ?? ORDER_MAX) || a.label.localeCompare(b.label));
}

export function getSettingsEntryById(id: string): SettingsEntryDef | undefined {
  return _registry.find(d => d.id === id);
}

/** Test-only: clears the module-level registry between tests. */
export function __resetSettingsRegistry(): void {
  _registry.length = 0;
}
