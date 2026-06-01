import { describe, it, expect } from 'vitest';
import { checkPermission } from '../permissions';
import type { PluginPermission } from '@vantage/plugin-types';

const READ_CONTACTS: PluginPermission[] = ['contacts:read'];
const READ_WRITE: PluginPermission[] = ['contacts:read', 'contacts:write', 'storage:read', 'storage:write'];

describe('checkPermission', () => {
  it('returns null when permission satisfied', () => {
    expect(checkPermission(READ_CONTACTS, 'contacts.list')).toBeNull();
    expect(checkPermission(READ_CONTACTS, 'contacts.get')).toBeNull();
  });

  it('returns PluginError when permission missing', () => {
    const err = checkPermission(READ_CONTACTS, 'contacts.create');
    expect(err).not.toBeNull();
    expect(err?.code).toBe('FORBIDDEN');
    expect(err?.message).toContain('contacts:write');
  });

  it('returns null for unknown method (custom action passthrough)', () => {
    const err = checkPermission(READ_CONTACTS, 'unknown.method');
    expect(err).toBeNull();
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

  it('allows custom action methods (passthrough)', () => {
    expect(checkPermission(READ_CONTACTS, 'deals.move-stage')).toBeNull();
  });
});
