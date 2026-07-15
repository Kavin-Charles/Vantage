import { describe, it, expect } from 'vitest';
import { hasHubPermission, HUB_LIMITS } from '../hub';

describe('hasHubPermission', () => {
  it('matches exact contract grants', () => {
    expect(hasHubPermission(['hub:read:crm.contact@v1'], 'read', 'crm.contact@v1')).toBe(true);
    expect(hasHubPermission(['hub:read:crm.contact@v1'], 'read', 'crm.deal@v1')).toBe(false);
  });

  it('matches namespace wildcards', () => {
    expect(hasHubPermission(['hub:write:crm.*'], 'write', 'crm.contact@v1')).toBe(true);
    expect(hasHubPermission(['hub:write:crm.*'], 'write', 'crm.deal@v1')).toBe(true);
    expect(hasHubPermission(['hub:write:crm.*'], 'write', 'billing.invoice@v1')).toBe(false);
  });

  it('matches global wildcard', () => {
    expect(hasHubPermission(['hub:read:*'], 'read', 'anything.at-all@v3')).toBe(true);
  });

  it('never crosses read/write actions', () => {
    expect(hasHubPermission(['hub:read:crm.*'], 'write', 'crm.contact@v1')).toBe(false);
    expect(hasHubPermission(['hub:write:crm.contact@v1'], 'read', 'crm.contact@v1')).toBe(false);
  });

  it('non-hub grants never match', () => {
    expect(hasHubPermission(['contacts:read', 'http:fetch'], 'read', 'crm.contact@v1')).toBe(false);
  });
});

describe('HUB_LIMITS', () => {
  it('exposes production limits', () => {
    expect(HUB_LIMITS.maxBatchSize).toBe(500);
    expect(HUB_LIMITS.maxRecordBytes).toBe(64 * 1024);
    expect(HUB_LIMITS.maxQueryLimit).toBe(100);
    expect(HUB_LIMITS.publishCallsPerMinute).toBeGreaterThan(0);
  });
});
