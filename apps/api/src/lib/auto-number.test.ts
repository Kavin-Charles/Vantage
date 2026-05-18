import { describe, it, expect } from 'vitest';
import { formatAutoNumber } from './auto-number';

describe('formatAutoNumber', () => {
  it('formats PREFIX-YY-NNN', () => {
    const result = formatAutoNumber('PREFIX-YY-NNN', 'ATP', 1, new Date('2024-03-15'));
    expect(result).toBe('ATP-24-001');
  });

  it('formats PREFIX-YYYY-NNNN', () => {
    const result = formatAutoNumber('PREFIX-YYYY-NNNN', 'JOB', 42, new Date('2024-03-15'));
    expect(result).toBe('JOB-2024-0042');
  });

  it('formats NNNNN zero-padded to 5', () => {
    const result = formatAutoNumber('PREFIX-NNNNN', 'Q', 7, new Date('2024-01-01'));
    expect(result).toBe('Q-00007');
  });

  it('pads sequence to length of token', () => {
    const result = formatAutoNumber('NNN', '', 999, new Date('2024-01-01'));
    expect(result).toBe('999');
  });

  it('handles sequence beyond padding width', () => {
    const result = formatAutoNumber('PREFIX-NNN', 'X', 1234, new Date('2024-01-01'));
    expect(result).toBe('X-1234');
  });
});
