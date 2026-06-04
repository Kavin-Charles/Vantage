import { describe, it, expect } from 'vitest';
import {
  checkPermission,
  pluginPermissionKey,
  isPluginPermissionKey,
  parsePluginPermissionKey,
} from '../permissions';
import type { PluginPermission } from '@vencore/plugin-types';

const READ_CONTACTS: PluginPermission[] = ['contacts:read'];
const READ_WRITE: PluginPermission[] = ['contacts:read', 'contacts:write', 'storage:read', 'storage:write'];

describe('checkPermission', () => {
  it('returns null when storage permission satisfied', () => {
    expect(checkPermission(READ_WRITE, 'storage.get')).toBeNull();
    expect(checkPermission(READ_WRITE, 'storage.set')).toBeNull();
  });

  it('returns null for unknown method (custom action passthrough)', () => {
    expect(checkPermission(READ_CONTACTS, 'unknown.method')).toBeNull();
  });

  it('allows storage.get with storage:read', () => {
    expect(checkPermission(READ_WRITE, 'storage.get')).toBeNull();
  });

  it('allows storage.set with storage:write', () => {
    expect(checkPermission(READ_WRITE, 'storage.set')).toBeNull();
  });

  it('table.* methods return null (exempt)', () => {
    expect(checkPermission(READ_CONTACTS, 'table.list')).toBeNull();
    expect(checkPermission(READ_CONTACTS, 'table.insert')).toBeNull();
  });

  it('blocks http.fetch without permission', () => {
    const err = checkPermission(READ_CONTACTS, 'http.fetch');
    expect(err?.code).toBe('FORBIDDEN');
  });

  it('allows http.fetch with permission', () => {
    expect(checkPermission([...READ_CONTACTS, 'http:fetch'], 'http.fetch')).toBeNull();
  });

  it('returns FORBIDDEN error with data_access in message', () => {
    const err = checkPermission([], 'http.fetch');
    expect(err).not.toBeNull();
    expect(err?.code).toBe('FORBIDDEN');
    expect(err?.message).toContain('http:fetch');
  });

  it('module methods not in map return null (registered via registry at startup)', () => {
    expect(checkPermission([], 'contacts.list')).toBeNull();
    expect(checkPermission([], 'deals.get')).toBeNull();
  });
});

describe('plugin permission key helpers', () => {
  it('pluginPermissionKey formats correctly', () => {
    expect(pluginPermissionKey('com.vantage.calendar', 'calendar:view'))
      .toBe('plugin:com.vantage.calendar:calendar:view');
  });

  it('isPluginPermissionKey detects plugin keys', () => {
    expect(isPluginPermissionKey('plugin:com.vantage.calendar:calendar:view')).toBe(true);
    expect(isPluginPermissionKey('contacts:read')).toBe(false);
  });

  it('parsePluginPermissionKey parses correctly', () => {
    const result = parsePluginPermissionKey('plugin:com.vantage.calendar:calendar:view');
    expect(result).toEqual({ pluginId: 'com.vantage.calendar', key: 'calendar:view' });
  });

  it('parsePluginPermissionKey returns null for non-plugin keys', () => {
    expect(parsePluginPermissionKey('contacts:read')).toBeNull();
  });
});
