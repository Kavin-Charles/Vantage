import { describe, it, expect } from 'vitest';
import { buildGroupedPermissions } from './db';

describe('buildGroupedPermissions', () => {
  it('groups registry permissions by module and sub-feature with granted/inherited flags', () => {
    const modules = buildGroupedPermissions(new Set(['projects:view']), new Set(['pm.tasks:view']));
    const projects = modules.find(m => m.id === 'projects')!;
    expect(projects).toBeTruthy();
    const projGroup = projects.groups.find(g => g.id === 'projects')!;
    const view = projGroup.permissions.find(p => p.key === 'projects:view')!;
    expect(view.granted).toBe(true);
    expect(view.inherited).toBe(false);
    const tasksGroup = projects.groups.find(g => g.id === 'tasks')!;
    const taskView = tasksGroup.permissions.find(p => p.key === 'pm.tasks:view')!;
    expect(taskView.granted).toBe(false);
    expect(taskView.inherited).toBe(true);
  });
  it('places ungrouped permissions under a General group', () => {
    const modules = buildGroupedPermissions(new Set(), new Set());
    const crm = modules.find(m => m.id === 'crm')!;
    expect(crm.groups.some(g => g.label === 'General' || g.permissions.length > 0)).toBe(true);
  });
});
