import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerSettingsEntry,
  getSettingsEntries,
  getSettingsEntryById,
  __resetSettingsRegistry,
  type SettingsEntryDef,
} from './settings-registry';

const Noop = () => null;
const entry = (over: Partial<SettingsEntryDef>): SettingsEntryDef => ({
  id: 'x', scope: 'personal', label: 'X', icon: 'settings', component: Noop, ...over,
});

describe('settings-registry', () => {
  beforeEach(() => __resetSettingsRegistry());

  it('registers and returns entries by scope', () => {
    registerSettingsEntry(entry({ id: 'profile', scope: 'personal', label: 'Profile' }));
    registerSettingsEntry(entry({ id: 'users', scope: 'workspace', label: 'Users' }));
    expect(getSettingsEntries('personal').map(e => e.id)).toEqual(['profile']);
    expect(getSettingsEntries('workspace').map(e => e.id)).toEqual(['users']);
  });

  it('ignores duplicate ids', () => {
    registerSettingsEntry(entry({ id: 'profile', label: 'Profile' }));
    registerSettingsEntry(entry({ id: 'profile', label: 'Dupe' }));
    expect(getSettingsEntries('personal')).toHaveLength(1);
    expect(getSettingsEntries('personal')[0]!.label).toBe('Profile');
  });

  it('sorts by order then label', () => {
    registerSettingsEntry(entry({ id: 'a', label: 'Zeta', order: 1 }));
    registerSettingsEntry(entry({ id: 'b', label: 'Alpha', order: 1 }));
    registerSettingsEntry(entry({ id: 'c', label: 'Beta' })); // no order → after ordered
    expect(getSettingsEntries('personal').map(e => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('looks up by id', () => {
    registerSettingsEntry(entry({ id: 'profile' }));
    expect(getSettingsEntryById('profile')?.id).toBe('profile');
    expect(getSettingsEntryById('missing')).toBeUndefined();
  });
});
