import { describe, it, expect } from 'vitest';
import { deriveDealPriority } from './dealPriority';

describe('deriveDealPriority', () => {
  it('maps probability bands', () => {
    expect(deriveDealPriority(100)).toBe('urgent');
    expect(deriveDealPriority(90)).toBe('urgent');
    expect(deriveDealPriority(80)).toBe('urgent');
  });

  it('drops to high just below urgent', () => {
    expect(deriveDealPriority(79)).toBe('high');
    expect(deriveDealPriority(60)).toBe('high');
  });

  it('drops to medium just below high', () => {
    expect(deriveDealPriority(59)).toBe('medium');
    expect(deriveDealPriority(30)).toBe('medium');
  });

  it('drops to low just below medium', () => {
    expect(deriveDealPriority(29)).toBe('low');
    expect(deriveDealPriority(0)).toBe('low');
  });
});
