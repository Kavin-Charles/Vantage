import { describe, it, expect } from 'vitest';
import { statusToBadgeTone, statusLabel } from './deriveViews';

describe('status display', () => {
  it('tone', () => {
    expect(statusToBadgeTone('customer')).toBe('blue');
    expect(statusToBadgeTone('prospect')).toBe('gold');
    expect(statusToBadgeTone('cold')).toBe('neutral');
    expect(statusToBadgeTone('churned')).toBe('red');
  });

  it('label', () => {
    expect(statusLabel('customer')).toBe('Active');
    expect(statusLabel('prospect')).toBe('Lead');
    expect(statusLabel('cold')).toBe('Dormant');
    expect(statusLabel('churned')).toBe('Churned');
  });
});
