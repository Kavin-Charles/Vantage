import { describe, it, expect } from 'vitest';
import { BridgeRegistry } from '../bridge-registry';

describe('BridgeRegistry', () => {
  it('registers and looks up a handler', () => {
    const registry = new BridgeRegistry();
    const handle = async () => 'result';
    registry.register('contacts.list', 'contacts:read', handle);
    const def = registry.lookup('contacts.list');
    expect(def).toBeDefined();
    expect(def?.permission).toBe('contacts:read');
  });

  it('returns undefined for unknown method', () => {
    const registry = new BridgeRegistry();
    expect(registry.lookup('unknown.method')).toBeUndefined();
  });

  it('allows null permission (no auth required)', () => {
    const registry = new BridgeRegistry();
    registry.register('storage.get', null, async () => null);
    expect(registry.lookup('storage.get')?.permission).toBeNull();
  });

  it('register returns this for chaining', () => {
    const registry = new BridgeRegistry();
    const result = registry.register('a.b', null, async () => null);
    expect(result).toBe(registry);
  });
});
