import { describe, it, expect } from 'vitest';
import { getContract, isKnownContract, listContracts, validateRecords, CONTRACT_ID_RE } from '../contracts';

describe('contract registry', () => {
  it('knows the core CRM contracts', () => {
    expect(isKnownContract('crm.contact@v1')).toBe(true);
    expect(isKnownContract('crm.company@v1')).toBe(true);
    expect(isKnownContract('crm.deal@v1')).toBe(true);
    expect(isKnownContract('crm.activity@v1')).toBe(true);
  });

  it('rejects unknown contracts', () => {
    expect(isKnownContract('crm.contact@v2')).toBe(false);
    expect(isKnownContract('nonsense')).toBe(false);
    expect(getContract('nope')).toBeUndefined();
  });

  it('lists contracts with labels', () => {
    const all = listContracts();
    expect(all.length).toBeGreaterThanOrEqual(4);
    expect(all.every((c) => c.id && c.label && c.schema)).toBe(true);
  });

  it('CONTRACT_ID_RE matches namespaced versioned ids only', () => {
    expect(CONTRACT_ID_RE.test('crm.contact@v1')).toBe(true);
    expect(CONTRACT_ID_RE.test('zoho-crm.blueprint@v2')).toBe(true);
    expect(CONTRACT_ID_RE.test('contact@v1')).toBe(false);
    expect(CONTRACT_ID_RE.test('crm.contact')).toBe(false);
    expect(CONTRACT_ID_RE.test('crm.contact@1')).toBe(false);
  });
});

describe('validateRecords', () => {
  const valid = { external_id: 'z-1', name: 'Ada Lovelace', email: 'ada@example.com' };

  it('accepts a valid batch', () => {
    const { violations } = validateRecords('crm.contact@v1', [valid]);
    expect(violations).toHaveLength(0);
  });

  it('accepts nullable optionals and extras', () => {
    const { violations } = validateRecords('crm.contact@v1', [
      { external_id: 'z-2', name: 'No Email', email: null, phone: null, extras: { zoho_lead_source: 'Web' } },
    ]);
    expect(violations).toHaveLength(0);
  });

  it('rejects missing required fields with index + path', () => {
    const { violations } = validateRecords('crm.contact@v1', [valid, { name: 'No id' }]);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.index).toBe(1);
    expect(violations[0]!.path).toBe('external_id');
  });

  it('rejects undeclared fields (strict schemas)', () => {
    const { violations } = validateRecords('crm.contact@v1', [
      { ...valid, zoho_owner: 'x' },
    ]);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('accepts loosely-shaped emails (CRM data is dirty by nature)', () => {
    const { violations } = validateRecords('crm.contact@v1', [{ external_id: 'z', name: 'X', email: 'not-an-email' }]);
    expect(violations).toHaveLength(0);
  });

  it('validates deal is_won / probability bounds', () => {
    const ok = validateRecords('crm.deal@v1', [
      { external_id: 'd-1', name: 'Big deal', value: 5000, is_won: true, probability: 90 },
    ]);
    expect(ok.violations).toHaveLength(0);

    const bad = validateRecords('crm.deal@v1', [
      { external_id: 'd-2', name: 'Bad deal', probability: 150 },
    ]);
    expect(bad.violations.length).toBeGreaterThan(0);
  });

  it('reports unknown contract as violation with index -1', () => {
    const { violations } = validateRecords('crm.contact@v9', [valid]);
    expect(violations[0]!.index).toBe(-1);
  });
});
