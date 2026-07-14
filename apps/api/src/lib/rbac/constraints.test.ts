import { describe, it, expect } from 'vitest';
import { checkSSD, checkDSD, checkCardinality, type ConstraintSet } from './constraints';

const set: ConstraintSet = { id: 's1', name: 'Finance SoD', cardinality: 2, roleIds: ['pay', 'approve'] };

describe('checkSSD', () => {
  it('flags holding both mutually-exclusive roles', () => {
    expect(checkSSD(new Set(['pay', 'approve']), [set])).toEqual([{ setId: 's1', name: 'Finance SoD' }]);
  });
  it('passes when only one is held', () => {
    expect(checkSSD(new Set(['pay']), [set])).toEqual([]);
  });
});

describe('checkDSD', () => {
  it('flags activating both together', () => {
    expect(checkDSD(new Set(['pay', 'approve']), [set])).toHaveLength(1);
  });
});

describe('checkCardinality', () => {
  it('blocks assignment at the cap', () => {
    expect(checkCardinality({ id: 'r', max_members: 3 }, 3)).toBe(false);
  });
  it('allows under the cap and when uncapped', () => {
    expect(checkCardinality({ id: 'r', max_members: 3 }, 2)).toBe(true);
    expect(checkCardinality({ id: 'r', max_members: null }, 99)).toBe(true);
  });
});
