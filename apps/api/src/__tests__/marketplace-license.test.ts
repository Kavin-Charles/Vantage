import { describe, it, expect } from 'vitest';
import {
  buildLicenseValidatePayload,
  buildLicenseDeactivatePayload,
  USABLE_LICENSE_STATUSES,
} from '../lib/marketplace-license';

const WS = { id: 'ws-uuid-1', name: 'Acme Inc', domain: 'acme.example.com' };

describe('buildLicenseValidatePayload', () => {
  it('binds by workspace id as instance_id and never sends workspace_id', () => {
    const p = buildLicenseValidatePayload(WS, 'plugin-uuid', 'key-uuid');
    expect(p).toEqual({
      plugin_id: 'plugin-uuid',
      key: 'key-uuid',
      instance_id: 'ws-uuid-1',
      instance_name: 'Acme Inc',
      instance_domain: 'acme.example.com',
    });
    expect('workspace_id' in p).toBe(false);
  });

  it('omits instance_domain when workspace has none', () => {
    const p = buildLicenseValidatePayload({ ...WS, domain: null }, 'plugin-uuid', 'key-uuid');
    expect('instance_domain' in p).toBe(false);
  });
});

describe('buildLicenseDeactivatePayload', () => {
  it('includes instance_id for the secure deactivate contract', () => {
    expect(buildLicenseDeactivatePayload('ws-uuid-1', 'plugin-uuid', 'key-uuid')).toEqual({
      plugin_id: 'plugin-uuid',
      key: 'key-uuid',
      instance_id: 'ws-uuid-1',
    });
  });
});

describe('USABLE_LICENSE_STATUSES', () => {
  it('treats active and grace as usable, everything else not', () => {
    expect(USABLE_LICENSE_STATUSES.has('active')).toBe(true);
    expect(USABLE_LICENSE_STATUSES.has('grace')).toBe(true);
    expect(USABLE_LICENSE_STATUSES.has('expired')).toBe(false);
    expect(USABLE_LICENSE_STATUSES.has('revoked')).toBe(false);
    expect(USABLE_LICENSE_STATUSES.has('bound_elsewhere')).toBe(false);
    expect(USABLE_LICENSE_STATUSES.has('not_found')).toBe(false);
  });
});
