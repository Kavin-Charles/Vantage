import { describe, it, expect } from 'vitest';
import { generateRecoveryCodes } from './recovery-codes';

describe('generateRecoveryCodes', () => {
  it('generates n unique codes', () => {
    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach(c => expect(c).toMatch(/^[0-9a-f]{16}$/));
  });

  it('defaults to 10 codes when n is not provided', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
  });

  it('generates a custom number of codes when n is provided', () => {
    const codes = generateRecoveryCodes(3);
    expect(codes).toHaveLength(3);
  });
});
