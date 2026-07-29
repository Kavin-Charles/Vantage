import { oklch, formatHex, wcagContrast, clampChroma } from 'culori';

type Mode = 'light' | 'dark';

const BASE = {
  light: { bg: '#f7f6f2', surface: '#ffffff', surface2: '#f0ede6', border: '#e4e0d8' },
  dark: { bg: '#0f1117', surface: '#171a23', surface2: '#1f232e', border: '#2a2f3b' },
} as const;

function hex(l: number, c: number, h: number): string {
  const clamped = clampChroma({ mode: 'oklch', l, c, h }, 'oklch');
  const formatted = formatHex(clamped);
  if (!formatted) {
    throw new Error(`generateTheme: failed to format color l=${l} c=${c} h=${h}`);
  }
  return formatted;
}

/** Nudge a neutral hex toward the seed hue at very low chroma. */
function tint(neutralHex: string, seedHue: number, amount: number): string {
  const n = oklch(neutralHex);
  if (!n) {
    throw new Error(`generateTheme: failed to parse neutral color ${neutralHex}`);
  }
  return hex(n.l ?? 0, (n.c ?? 0) + amount, seedHue);
}

function bestFg(accentHex: string): string {
  const onWhite = wcagContrast('#ffffff', accentHex);
  const onInk = wcagContrast('#0b1330', accentHex);
  return onWhite >= onInk ? '#ffffff' : '#0b1330';
}

export function generateTheme(seed: string, mode: Mode): Record<string, string> {
  const s = oklch(seed) ?? { mode: 'oklch' as const, l: 0.3, c: 0.1, h: 260 };
  const h = s.h ?? 260;
  const c = Math.max(s.c ?? 0.08, 0.06);

  // Accent lightness: readable in each mode.
  const accentL = mode === 'dark' ? Math.max(s.l ?? 0.3, 0.62) : Math.min(s.l ?? 0.3, 0.42);
  const accent = hex(accentL, c, h);
  const accentHover = hex(accentL + (mode === 'dark' ? 0.06 : -0.05), c, h);
  const accentActive = hex(accentL + (mode === 'dark' ? 0.12 : -0.1), c, h);
  const accentWeak = mode === 'dark' ? hex(0.28, c * 0.5, h) : hex(0.94, c * 0.4, h);
  const accentFg = bestFg(accent);

  const base = BASE[mode];
  const tintAmt = 0.004; // subtle
  return {
    '--accent': accent,
    '--accent-hover': accentHover,
    '--accent-active': accentActive,
    '--accent-weak': accentWeak,
    '--accent-fg': accentFg,
    '--bg': tint(base.bg, h, tintAmt),
    '--surface': tint(base.surface, h, tintAmt * 0.5),
    '--surface2': tint(base.surface2, h, tintAmt),
    '--border': tint(base.border, h, tintAmt),
  };
}
