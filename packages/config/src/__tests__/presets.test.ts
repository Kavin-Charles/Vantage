import { describe, it, expect } from 'vitest';
import { PRESETS, getPreset } from '../presets';

describe('presets', () => {
  it('has a default preset with the default seed', () => {
    expect(getPreset('default')?.seed).toBe('#0b1330');
  });

  it('all seeds are valid hex', () => {
    for (const p of PRESETS) {
      expect(p.seed).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
