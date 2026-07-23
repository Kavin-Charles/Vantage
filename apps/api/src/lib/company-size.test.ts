import { describe, it, expect } from 'vitest';
import { sizeBand } from './company-size';

describe('sizeBand', () => {
  it('bands employee counts into startup/smb/mid/enterprise', () => {
    expect(sizeBand(null)).toBe('smb');
    expect(sizeBand(5)).toBe('startup');
    expect(sizeBand(50)).toBe('smb');
    expect(sizeBand(300)).toBe('mid');
    expect(sizeBand(2000)).toBe('enterprise');
  });

  it('treats band boundaries as inclusive lower bounds', () => {
    expect(sizeBand(19)).toBe('startup');
    expect(sizeBand(20)).toBe('smb');
    expect(sizeBand(199)).toBe('smb');
    expect(sizeBand(200)).toBe('mid');
    expect(sizeBand(999)).toBe('mid');
    expect(sizeBand(1000)).toBe('enterprise');
  });

  it('treats 0 as startup, not null-like', () => {
    expect(sizeBand(0)).toBe('startup');
  });
});
