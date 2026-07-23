import { describe, it, expect } from 'vitest';
import { visibleWidgets } from './filter-widgets';
import type { DashboardWidgetDef } from '@/modules/shared/lib/dashboard-registry';

const Noop = () => null;
const w = (over: Partial<DashboardWidgetDef>): DashboardWidgetDef => ({
  id: 'w', label: 'W', description: '', icon: 'x', category: 'sales',
  sizeOptions: ['medium'], defaultSize: 'medium', defaultW: 4, defaultH: 4,
  component: Noop, ...over,
});

describe('visibleWidgets', () => {
  it('keeps widgets with no permission and enabled module', () => {
    const all = [w({ id: 'a', module: 'crm' })];
    expect(visibleWidgets(all, () => true, () => true).map(x => x.id)).toEqual(['a']);
  });
  it('drops widgets whose permission is missing', () => {
    const all = [w({ id: 'a', permission: 'crm.read' })];
    expect(visibleWidgets(all, () => false, () => true)).toHaveLength(0);
  });
  it('drops widgets whose module is disabled', () => {
    const all = [w({ id: 'a', module: 'infra' })];
    expect(visibleWidgets(all, () => true, id => id !== 'infra')).toHaveLength(0);
  });
  it('keeps module-less widgets', () => {
    const all = [w({ id: 'a' })];
    expect(visibleWidgets(all, () => true, () => false)).toHaveLength(1);
  });
});
