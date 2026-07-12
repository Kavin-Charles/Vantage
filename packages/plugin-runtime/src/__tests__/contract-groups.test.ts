import { describe, it, expect } from 'vitest';
import {
  CONTRACT_GROUPS, getContractGroup, groupForContract, groupsServedBy, validateGroupCoverage,
} from '../contracts';

describe('contract groups', () => {
  it('crm group requires contact/company/deal, activity optional', () => {
    const crm = getContractGroup('crm')!;
    expect(crm.required).toEqual(['crm.contact@v1', 'crm.company@v1', 'crm.deal@v1']);
    expect(crm.optional).toEqual(['crm.activity@v1']);
    expect(crm.builtin_provider).toBe('vencore-crm');
  });

  it('groupForContract resolves required and optional members', () => {
    expect(groupForContract('crm.contact@v1')?.id).toBe('crm');
    expect(groupForContract('crm.activity@v1')?.id).toBe('crm');
    expect(groupForContract('nonexistent.thing@v1')).toBeUndefined();
  });

  it('groupsServedBy requires full required coverage', () => {
    expect(groupsServedBy(['crm.contact@v1', 'crm.company@v1', 'crm.deal@v1']).map(g => g.id)).toEqual(['crm']);
    // Activity alone or partial coverage does not serve the group
    expect(groupsServedBy(['crm.contact@v1'])).toEqual([]);
    expect(groupsServedBy(['crm.activity@v1'])).toEqual([]);
    expect(groupsServedBy([])).toEqual([]);
  });

  it('validateGroupCoverage rejects partial required coverage', () => {
    expect(validateGroupCoverage(['crm.contact@v1', 'crm.company@v1', 'crm.deal@v1'])).toBeNull();
    expect(validateGroupCoverage([])).toBeNull();
    const err = validateGroupCoverage(['crm.contact@v1']);
    expect(err).toContain('crm');
    expect(err).toContain('crm.deal@v1');
  });

  it('optional-only provides pass coverage validation', () => {
    expect(validateGroupCoverage(['crm.activity@v1'])).toBeNull();
  });

  it('every group builtin provider is set', () => {
    for (const g of CONTRACT_GROUPS) {
      expect(g.builtin_provider.length).toBeGreaterThan(0);
    }
  });
});
