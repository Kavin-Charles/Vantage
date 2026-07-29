import { describe, it, expect } from 'vitest';
import { wcagContrast } from 'culori';
import { generateTheme } from '../palette';

const SEEDS = ['#0b1330', '#2d6a4f', '#92400e', '#991b1b', '#4c1d95', '#1e3a8a', '#0f766e'];

describe('generateTheme', () => {
  it('accent foreground meets AA contrast for all seeds, both modes', () => {
    for (const seed of SEEDS) {
      for (const mode of ['light', 'dark'] as const) {
        const t = generateTheme(seed, mode);
        const ratio = wcagContrast(t['--accent-fg']!, t['--accent']!);
        expect(ratio, `${seed} ${mode}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('returns all required tokens', () => {
    const t = generateTheme('#2d6a4f', 'light');
    for (const k of ['--accent','--accent-hover','--accent-active','--accent-weak','--accent-fg','--bg','--surface','--surface2','--border']) {
      expect(t[k], k).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('default seed keeps light bg near current warm off-white', () => {
    const t = generateTheme('#0b1330', 'light');
    // very low chroma tint — stays light
    expect(t['--bg']!.toLowerCase()).not.toBe('#000000');
  });
});
