import { describe, it, expect } from 'vitest';
import { deriveDealPriority } from './deal-priority';
describe('deriveDealPriority', () => {
  it('maps probability bands', () => {
    expect(deriveDealPriority(90)).toBe('urgent');
    expect(deriveDealPriority(80)).toBe('urgent');
    expect(deriveDealPriority(60)).toBe('high');
    expect(deriveDealPriority(45)).toBe('medium');
    expect(deriveDealPriority(30)).toBe('medium');
    expect(deriveDealPriority(10)).toBe('low');
  });
});
