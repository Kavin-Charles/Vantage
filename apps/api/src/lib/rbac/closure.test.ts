import { describe, it, expect } from 'vitest';
import { authorizedRoleClosure, wouldCreateCycle } from './closure';

const edges = [{ parent: 'A', child: 'B' }, { parent: 'B', child: 'C' }];

describe('authorizedRoleClosure', () => {
  it('includes transitive descendants', () => {
    expect([...authorizedRoleClosure(['A'], edges)].sort()).toEqual(['A', 'B', 'C']);
  });
  it('a leaf resolves to just itself', () => {
    expect([...authorizedRoleClosure(['C'], edges)]).toEqual(['C']);
  });
  it('handles diamonds without duplication', () => {
    const d = [{ parent: 'A', child: 'B' }, { parent: 'A', child: 'C' }, { parent: 'B', child: 'D' }, { parent: 'C', child: 'D' }];
    expect([...authorizedRoleClosure(['A'], d)].sort()).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('wouldCreateCycle', () => {
  it('detects a direct back-edge', () => {
    expect(wouldCreateCycle(edges, { parent: 'C', child: 'A' })).toBe(true);
  });
  it('allows a safe edge', () => {
    expect(wouldCreateCycle(edges, { parent: 'A', child: 'C' })).toBe(false);
  });
});
