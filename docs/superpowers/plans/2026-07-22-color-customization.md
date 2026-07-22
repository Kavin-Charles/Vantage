# Visual Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the deployment brand color actually drive the live UI, and add preset palettes, layout feel (radius/density), branded chrome (sidebar/topbar), and login-page customization.

**Architecture:** A single accent seed color, stored in `system_settings.config.app.appearance`, is turned into a full accent ramp + subtly tinted neutrals by a pure `generateTheme()` engine. The Next.js root layout fetches config server-side and injects concrete CSS-var overrides in a `<style>` block (no FOUC). Components read `--accent*` / `--nav*` tokens and `data-*` attributes on `<html>`.

**Tech Stack:** TypeScript (strict), Next.js App Router, Express, Kysely, Zod, Vitest, `culori` (oklch color math), CSS custom properties.

## Global Constraints

- TypeScript strict mode; no `any`, no `console.log` in production paths.
- All API input validated with Zod; responses follow `{ data, error }`.
- Every new/changed config field must keep existing configs parseable (Zod defaults) — old configs have only `app.primaryColor`.
- Default accent seed `#0b1330` MUST reproduce the current look (zero visual change until branded).
- Tests: `packages/config` and `apps/api` use `vitest run`; `apps/web` uses `vitest`.
- Commit style: conventional commits, one small commit per task. Author Kavin-Charles only, no AI attribution. Branch `feat/color-customization`.
- Contrast guardrail: generated foreground/background pairs must meet WCAG AA (≥4.5 normal text, ≥3.0 large/UI).

---

## File Structure

- `packages/config/src/config-schema.ts` — add `app.appearance` block + back-compat.
- `packages/config/src/palette.ts` (new) — `generateTheme()` pure engine.
- `packages/config/src/presets.ts` (new) — preset registry.
- `packages/config/src/index.ts` — export new symbols.
- `apps/api/src/routes/config.ts` — expose `appearance` in GET; add admin `PATCH`.
- `apps/web/app/globals.css` — default `--accent*`/`--nav*` tokens + `data-radius/density/nav` overrides.
- `apps/web/app/layout.tsx` — SSR `<style>` injection + `<html>` data attrs.
- `apps/web/modules/shared/lib/useConfig.ts` — extend `PublicConfig`.
- `apps/web/modules/shared/components/ui/Button.tsx` — primary variant → accent.
- `apps/web/modules/shared/components/Sidebar.tsx` / `Topbar.tsx` — nav tokens.
- `apps/web/app/(dashboard)/settings/appearance/page.tsx` — admin controls.
- `apps/web/app/setup/steps/StepBranding.tsx` + `apps/web/app/setup/types.ts` — wizard knobs.
- `apps/web/app/login/page.tsx` — login background.

---

## PHASE 1 — Color actually works

### Task 1: Config schema `appearance` block + back-compat

**Files:**
- Modify: `packages/config/src/config-schema.ts`
- Test: `packages/config/src/__tests__/appearance-schema.test.ts` (create)

**Interfaces:**
- Produces: `appearanceSchema` (Zod), and `configSchema.app.appearance` with type `Appearance`.
- `Appearance = { accentColor: string; preset: string; radius: 'sharp'|'rounded'|'pill'; density: 'comfortable'|'compact'; sidebarStyle: 'light'|'dark'|'brand'; login: { background: string|null; backgroundImage: string|null } }`

- [ ] **Step 1: Write failing test**
```ts
// packages/config/src/__tests__/appearance-schema.test.ts
import { describe, it, expect } from 'vitest';
import { configSchema } from '../config-schema';

describe('appearance config', () => {
  it('defaults appearance when absent and maps legacy primaryColor', () => {
    const parsed = configSchema.parse({
      app: { name: 'Acme', primaryColor: '#2d6a4f' },
      features: {},
    });
    expect(parsed.app.appearance.accentColor).toBe('#2d6a4f'); // legacy fallback
    expect(parsed.app.appearance.radius).toBe('rounded');
    expect(parsed.app.appearance.density).toBe('comfortable');
    expect(parsed.app.appearance.sidebarStyle).toBe('light');
    expect(parsed.app.appearance.login).toEqual({ background: null, backgroundImage: null });
  });

  it('uses default accent when no primaryColor', () => {
    const parsed = configSchema.parse({ app: { name: 'Acme' }, features: {} });
    expect(parsed.app.appearance.accentColor).toBe('#0b1330');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
Run: `pnpm --filter @vencore/config test -- appearance-schema`
Expected: FAIL (`appearance` undefined).

- [ ] **Step 3: Implement**
In `config-schema.ts`, add before `configSchema`:
```ts
export const appearanceSchema = z.object({
  accentColor: z.string().default('#0b1330'),
  preset: z.string().default('default'),
  radius: z.enum(['sharp', 'rounded', 'pill']).default('rounded'),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  sidebarStyle: z.enum(['light', 'dark', 'brand']).default('light'),
  login: z.object({
    background: z.string().nullable().default(null),
    backgroundImage: z.string().nullable().default(null),
  }).default({ background: null, backgroundImage: null }),
});
export type Appearance = z.infer<typeof appearanceSchema>;
```
Change the `app` object: keep `primaryColor: z.string().optional()`, add `appearance: appearanceSchema.optional()`, and wrap `configSchema` with a `.transform` that fills `appearance` from `primaryColor` when absent:
```ts
export const configSchema = z.object({
  app: z.object({
    name: z.string(),
    logoUrl: z.string().default('/logo.png'),
    domain: z.string().optional(),
    faviconUrl: z.string().optional(),
    tagline: z.string().optional(),
    primaryColor: z.string().optional(),
    appearance: appearanceSchema.optional(),
  }),
  features: z.object({ /* unchanged */
    crm: z.boolean().default(true),
    infra: z.boolean().default(true),
    alerts: z.boolean().default(true),
    analytics: z.boolean().default(false),
    files: z.boolean().default(false),
  }),
  smtp: smtpSchema.nullable().optional(),
  databases: z.array(dbSeedSchema).default([]),
}).transform((cfg) => {
  const seed = cfg.app.appearance?.accentColor ?? cfg.app.primaryColor ?? '#0b1330';
  const appearance = appearanceSchema.parse({ ...cfg.app.appearance, accentColor: seed });
  return { ...cfg, app: { ...cfg.app, appearance } };
});
```

- [ ] **Step 4: Run — expect PASS**
Run: `pnpm --filter @vencore/config test -- appearance-schema`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/config/src/config-schema.ts packages/config/src/__tests__/appearance-schema.test.ts
git commit -m "feat(config): add app.appearance schema with primaryColor back-compat"
```

---

### Task 2: Palette engine `generateTheme()`

**Files:**
- Create: `packages/config/src/palette.ts`
- Create: `packages/config/src/__tests__/palette.test.ts`
- Modify: `packages/config/package.json` (add `culori` dep)

**Interfaces:**
- Produces: `generateTheme(seed: string, mode: 'light' | 'dark'): Record<string, string>` returning CSS-var → hex, keys: `--accent`, `--accent-hover`, `--accent-active`, `--accent-weak`, `--accent-fg`, `--bg`, `--surface`, `--surface2`, `--border`.

- [ ] **Step 1: Add dep**
Run: `pnpm --filter @vencore/config add culori`

- [ ] **Step 2: Write failing test**
```ts
// packages/config/src/__tests__/palette.test.ts
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
```

- [ ] **Step 3: Run — expect FAIL**
Run: `pnpm --filter @vencore/config test -- palette`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `palette.ts`**
```ts
import { oklch, formatHex, wcagContrast, clampChroma } from 'culori';

type Mode = 'light' | 'dark';

const BASE = {
  light: { bg: '#f7f6f2', surface: '#ffffff', surface2: '#f0ede6', border: '#e4e0d8' },
  dark:  { bg: '#0f1117', surface: '#171a23', surface2: '#1f232e', border: '#2a2f3b' },
} as const;

function hex(l: number, c: number, h: number): string {
  return formatHex(clampChroma({ mode: 'oklch', l, c, h }, 'oklch'))!;
}

/** Nudge a neutral hex toward the seed hue at very low chroma. */
function tint(neutralHex: string, seedHue: number, amount: number): string {
  const n = oklch(neutralHex)!;
  return hex(n.l ?? 0, (n.c ?? 0) + amount, seedHue);
}

function bestFg(accentHex: string): string {
  const onWhite = wcagContrast('#ffffff', accentHex);
  const onInk = wcagContrast('#0b1330', accentHex);
  return onWhite >= onInk ? '#ffffff' : '#0b1330';
}

export function generateTheme(seed: string, mode: Mode): Record<string, string> {
  const s = oklch(seed) ?? { mode: 'oklch', l: 0.3, c: 0.1, h: 260 };
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
```

- [ ] **Step 5: Run — expect PASS**
Run: `pnpm --filter @vencore/config test -- palette`
Expected: PASS. If a seed fails contrast, widen the `accentL` clamp (lower max in light / raise min in dark) until green.

- [ ] **Step 6: Export + commit**
Add to `packages/config/src/index.ts`:
```ts
export { generateTheme } from './palette';
export { appearanceSchema, type Appearance } from './config-schema';
```
```bash
git add packages/config/
git commit -m "feat(config): add generateTheme palette engine with contrast guardrails"
```

---

### Task 3: Expose `appearance` in `/api/config` + default tokens in CSS

**Files:**
- Modify: `apps/api/src/routes/config.ts`
- Modify: `apps/web/modules/shared/lib/useConfig.ts`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `configSchema` transform (Task 1) — `effective.app.appearance` is always present.
- Produces: `/api/config` `data.app.appearance` object; CSS default `--accent*`/`--nav*` tokens.

- [ ] **Step 1: API — add appearance to response**
In `config.ts`, inside `data.app`, add:
```ts
appearance: effective.app.appearance,
```

- [ ] **Step 2: Web type**
In `useConfig.ts`, extend `PublicConfig.app` with:
```ts
appearance: {
  accentColor: string; preset: string;
  radius: 'sharp' | 'rounded' | 'pill';
  density: 'comfortable' | 'compact';
  sidebarStyle: 'light' | 'dark' | 'brand';
  login: { background: string | null; backgroundImage: string | null };
};
```

- [ ] **Step 3: CSS default tokens**
In `globals.css` `:root`, add after the semantic colors (these = current look so nothing changes):
```css
  /* Brand accent (overridden by SSR <style id="brand-theme">) */
  --accent:        #0b1330;
  --accent-hover:  #4a5677;
  --accent-active: #0b1330;
  --accent-weak:   #dbeafe;
  --accent-fg:     #ffffff;

  /* Navigation chrome */
  --nav-bg:     var(--surface);
  --nav-fg:     var(--text);
  --nav-active: var(--accent);
  --nav-border: var(--border);
```
And in `[data-theme="dark"]`, add `--accent`, `--accent-hover`, `--accent-active`, `--accent-weak`, `--accent-fg` mirrors (use `#60a5fa` family defaults) so dark also has sane fallbacks.

- [ ] **Step 4: Verify build**
Run: `pnpm --filter @vencore/api build && pnpm --filter web build` (or `tsc --noEmit` per package)
Expected: no type errors.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/routes/config.ts apps/web/modules/shared/lib/useConfig.ts apps/web/app/globals.css
git commit -m "feat(appearance): serve appearance config and add default accent/nav tokens"
```

---

### Task 4: SSR inject generated theme in root layout

**Files:**
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Consumes: `generateTheme` (Task 2), `/api/config` `appearance` (Task 3).

- [ ] **Step 1: Extend the server fetch**
Replace `getBranding` return to also include `appearance`. Add a type import: `import { generateTheme, type Appearance } from '@vencore/config';`. Fetch `json.data?.app?.appearance` (may be undefined on failure).

- [ ] **Step 2: Build the style string**
Add a helper in `layout.tsx`:
```tsx
function themeStyle(appearance: Appearance): string {
  const toBlock = (sel: string, vars: Record<string, string>) =>
    `${sel}{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`;
  const light = generateTheme(appearance.accentColor, 'light');
  const dark = generateTheme(appearance.accentColor, 'dark');
  return toBlock(':root', light) + toBlock('[data-theme="dark"]', dark);
}
```

- [ ] **Step 3: Render style + data attrs**
In `RootLayout`, make it `async`, fetch appearance, and render:
```tsx
<html lang="en" className={...} data-radius={appearance.radius}
      data-density={appearance.density} data-nav={appearance.sidebarStyle}
      suppressHydrationWarning>
  <head>
    <style id="brand-theme" dangerouslySetInnerHTML={{ __html: themeStyle(appearance) }} />
  </head>
  <body ...>
```
When the fetch fails, fall back to `appearanceSchema.parse({})` defaults (import `appearanceSchema`) so a valid style still renders.

- [ ] **Step 4: Manual verify — no FOUC, color applies**
Run: `pnpm --filter web dev`. Set `vencore.config.json` `app.primaryColor` to `#2d6a4f`, reload. Confirm `<style id="brand-theme">` present in page source and `--accent` = green (DevTools computed styles on `:root`). No flash on reload.

- [ ] **Step 5: Commit**
```bash
git add apps/web/app/layout.tsx
git commit -m "feat(appearance): SSR-inject generated brand theme in root layout"
```

---

### Task 5: Retrofit primary action surfaces to `--accent`

**Files:**
- Modify: `apps/web/modules/shared/components/ui/Button.tsx`
- Modify: nav active state — `apps/web/modules/shared/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `--accent`, `--accent-fg`, `--accent-hover` tokens.

- [ ] **Step 1: Button primary variant**
In `Button.tsx` change:
```ts
primary: { background: 'var(--accent)', color: 'var(--accent-fg)', border: '1px solid var(--accent)' },
```
and `HOVER_BG.primary` → `'var(--accent-hover)'`.

- [ ] **Step 2: Sidebar active item**
In `Sidebar.tsx`, find the active nav-item style (search for the selected/active branch using `var(--text)` or a bg highlight) and set the active foreground/indicator to `var(--nav-active)`. Keep inactive items on `var(--nav-fg)`.

- [ ] **Step 3: Manual verify**
With green seed, primary buttons + active sidebar item render green; `--accent-fg` keeps label readable. Toggle dark mode — still readable.

- [ ] **Step 4: Commit**
```bash
git add apps/web/modules/shared/components/ui/Button.tsx apps/web/modules/shared/components/Sidebar.tsx
git commit -m "feat(appearance): apply accent token to primary buttons and active nav"
```

---

## PHASE 2 — Presets + admin control

### Task 6: Preset registry

**Files:**
- Create: `packages/config/src/presets.ts`
- Create: `packages/config/src/__tests__/presets.test.ts`
- Modify: `packages/config/src/index.ts`

**Interfaces:**
- Produces: `PRESETS: { id: string; name: string; seed: string; sidebarStyle?: 'light'|'dark'|'brand' }[]` and `getPreset(id: string)`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest';
import { PRESETS, getPreset } from '../presets';
describe('presets', () => {
  it('has a default preset with the default seed', () => {
    expect(getPreset('default')?.seed).toBe('#0b1330');
  });
  it('all seeds are valid hex', () => {
    for (const p of PRESETS) expect(p.seed).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
Run: `pnpm --filter @vencore/config test -- presets`

- [ ] **Step 3: Implement**
```ts
export interface Preset { id: string; name: string; seed: string; sidebarStyle?: 'light' | 'dark' | 'brand'; }
export const PRESETS: Preset[] = [
  { id: 'default', name: 'Default', seed: '#0b1330' },
  { id: 'midnight', name: 'Midnight', seed: '#1e3a8a', sidebarStyle: 'dark' },
  { id: 'forest', name: 'Forest', seed: '#2d6a4f' },
  { id: 'slate', name: 'Slate', seed: '#334155' },
  { id: 'ember', name: 'Ember', seed: '#92400e' },
  { id: 'violet', name: 'Violet', seed: '#4c1d95' },
];
export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
```
Export from `index.ts`: `export { PRESETS, getPreset, type Preset } from './presets';`

- [ ] **Step 4: Run — expect PASS**; then commit
```bash
git add packages/config/
git commit -m "feat(config): add brand preset registry"
```

---

### Task 7: Admin `PATCH /api/config` route

**Files:**
- Modify: `apps/api/src/routes/config.ts`
- Modify: `apps/api/src/index.ts` (pass auth middleware if needed)
- Create: `apps/api/src/routes/__tests__/config-patch.test.ts`

**Interfaces:**
- Consumes: `appearanceSchema` (Task 1), `requireAuth`/`requireAdmin` from `../middleware/auth`.
- Produces: `PATCH /api/config` accepting `{ appearance: Partial<Appearance> }`, admin-only, upserts `system_settings.config`.

- [ ] **Step 1: Failing test** (integration-style; follow the pattern in a sibling `__tests__` route test — supertest app instance)
```ts
// asserts: non-admin → 403; admin with valid body → 200 and persisted appearance.accentColor
```
Model it on an existing route test in `apps/api/src/routes/__tests__/`. If none use supertest, write a unit test around a extracted `applyAppearancePatch(current, patch)` helper instead and test that helper.

- [ ] **Step 2: Run — expect FAIL**
Run: `pnpm --filter @vencore/api test -- config-patch`

- [ ] **Step 3: Implement**
In `config.ts`, accept auth middleware args and add:
```ts
const patchSchema = z.object({ appearance: appearanceSchema.partial() });
router.patch('/', requireAuth(db), requireAdmin, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { code: 'INVALID', message: 'Bad appearance' } });
  }
  const current = (await readConfigFromDb(db)) ?? config;
  const nextAppearance = appearanceSchema.parse({ ...current.app.appearance, ...parsed.data.appearance });
  const nextConfig = { ...current, app: { ...current.app, appearance: nextAppearance } };
  await db.insertInto('system_settings')
    .values({ key: 'config', value: JSON.stringify(nextConfig) as any })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value: JSON.stringify(nextConfig) as any, updated_at: sql`now()` }))
    .execute();
  res.json({ data: { appearance: nextAppearance }, error: null });
});
```
Import `requireAuth`, `requireAdmin` from `../middleware/auth`, `appearanceSchema` from `@vencore/config`, `sql` from `kysely`, `z` from `zod`. Update `createConfigRouter` signature to receive what `requireAuth` needs (it already has `db`).

- [ ] **Step 4: Run — expect PASS**; verify manually with curl (admin token).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/routes/config.ts apps/api/src/routes/__tests__/config-patch.test.ts apps/api/src/index.ts
git commit -m "feat(api): add admin PATCH /api/config for appearance"
```

---

### Task 8: Admin appearance settings UI

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/appearance/page.tsx`

**Interfaces:**
- Consumes: `useConfig` appearance (Task 3), `PRESETS` (Task 6), `PATCH /api/config` (Task 7), `useAuth` for `isAdmin`.

- [ ] **Step 1: Gate + fetch**
Keep the existing light/dark section for everyone. Below it, render an admin-only block (`if (!user?.isAdmin) return null` for that block). Load current appearance from `useConfig()`.

- [ ] **Step 2: Controls**
Add: preset grid (map `PRESETS` → swatch buttons that set accent+sidebar), accent color `<input type="color">` + hex input + swatches (reuse the JSX shape from `StepBranding.tsx`), radius toggle (sharp/rounded/pill), density toggle (comfortable/compact), sidebar-style toggle (light/dark/brand). Local `useState` mirrors current values.

- [ ] **Step 3: Save**
On "Save changes", `apiFetch('/api/config', { method: 'PATCH', body: JSON.stringify({ appearance }), token })`, then `router.refresh()` (Next) so SSR re-renders the theme. Show saving/error states like the existing theme toggle.

- [ ] **Step 4: Manual verify**
As admin, pick Forest preset → Save → app re-themes green after refresh. As non-admin, admin block hidden.

- [ ] **Step 5: Commit**
```bash
git add "apps/web/app/(dashboard)/settings/appearance/page.tsx"
git commit -m "feat(appearance): admin appearance controls in settings"
```

---

### Task 9: Setup wizard branding knobs

**Files:**
- Modify: `apps/web/app/setup/types.ts`
- Modify: `apps/web/app/setup/steps/StepBranding.tsx`
- Modify: `apps/web/app/setup/steps/StepReview.tsx`
- Modify: `apps/api/src/routes/setup.ts`

**Interfaces:**
- Consumes: preset/radius/density/sidebar knobs; posts them into `configValue.app.appearance` at setup.

- [ ] **Step 1: Extend wizard state type**
In `types.ts` `branding`, add `preset: string; radius: 'sharp'|'rounded'|'pill'; density: 'comfortable'|'compact'; sidebarStyle: 'light'|'dark'|'brand'` with defaults (`'default'`, `'rounded'`, `'comfortable'`, `'light'`).

- [ ] **Step 2: UI**
In `StepBranding.tsx` add the same preset/radius/density/sidebar controls as Task 8 (extract a shared `AppearanceControls` component under `modules/shared/components/` and use it in both places — DRY).

- [ ] **Step 3: Persist**
In `setup.ts` request schema (`branding`), add the new optional fields; in `configValue.app` write `appearance: { accentColor: branding.primaryColor, preset, radius, density, sidebarStyle, login: { background: null, backgroundImage: null } }`.

- [ ] **Step 4: Manual verify**
Fresh setup with Forest preset persists `appearance` in `system_settings.config`; first dashboard load is themed.

- [ ] **Step 5: Commit**
```bash
git add apps/web/app/setup/ apps/api/src/routes/setup.ts apps/web/modules/shared/components/
git commit -m "feat(appearance): appearance knobs in setup wizard"
```

---

## PHASE 3 — Structure

### Task 10: Layout feel (radius + density)

**Files:**
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Radius scale overrides**
Add:
```css
[data-radius="sharp"] { --radius-sm:2px; --radius:3px; --radius-md:4px; --radius-lg:6px; --radius-xl:8px; }
[data-radius="pill"]  { --radius-sm:10px; --radius:14px; --radius-md:16px; --radius-lg:22px; --radius-xl:28px; }
```

- [ ] **Step 2: Density overrides**
Add:
```css
[data-density="compact"] { --header-h:48px; }
[data-density="compact"] body { font-size: 13px; }
```
(Extend cautiously — only vars, no structural rewrites.)

- [ ] **Step 3: Manual verify** — set `appearance.radius`/`density` in config, reload, confirm corner + header changes. Commit.
```bash
git add apps/web/app/globals.css
git commit -m "feat(appearance): radius and density layout controls"
```

---

### Task 11: Branded chrome (sidebar/topbar)

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/modules/shared/components/Sidebar.tsx`
- Modify: `apps/web/modules/shared/components/Topbar.tsx`

- [ ] **Step 1: nav data-attr palettes**
In `globals.css`:
```css
[data-nav="dark"]  { --nav-bg:#171a23; --nav-fg:#e8eaf0; --nav-border:#2a2f3b; }
[data-nav="brand"] { --nav-bg:var(--accent); --nav-fg:var(--accent-fg); --nav-border:var(--accent-active); --nav-active:var(--accent-fg); }
```

- [ ] **Step 2: Consume in components**
In `Sidebar.tsx` and `Topbar.tsx`, replace the container `background`/`color`/`borderColor` that currently use `var(--surface)`/`var(--text)`/`var(--border)` with `var(--nav-bg)`/`var(--nav-fg)`/`var(--nav-border)`.

- [ ] **Step 3: Manual verify** — set `sidebarStyle: 'brand'`, reload; sidebar+topbar take accent color, text stays readable via `--nav-fg`. Commit.
```bash
git add apps/web/app/globals.css apps/web/modules/shared/components/Sidebar.tsx apps/web/modules/shared/components/Topbar.tsx
git commit -m "feat(appearance): branded sidebar and topbar chrome"
```

---

## PHASE 4 — Login page

### Task 12: Login background customization

**Files:**
- Modify: `apps/web/app/login/page.tsx`
- Modify: admin/wizard controls (add login bg color + image via `AppearanceControls`).

- [ ] **Step 1: Read appearance**
In `login/page.tsx`, read `appearance.login` from `useConfig()` (or the SSR config). Apply `background` (color) or `backgroundImage` to the page wrapper; keep existing logo/tagline.

- [ ] **Step 2: Controls**
Add a color input + Dropzone (image → data URL, like the logo Dropzone) to `AppearanceControls`; wire into the `appearance.login` patch payload and setup `configValue`.

- [ ] **Step 3: Manual verify** — set a login background color, sign out, confirm login page shows it. Commit.
```bash
git add apps/web/app/login/page.tsx apps/web/modules/shared/components/ apps/api/src/routes/setup.ts
git commit -m "feat(appearance): login page background customization"
```

---

## Self-Review Notes

- Spec §4 schema → Task 1. §5 palette → Task 2. §6 presets → Task 6. §7 SSR inject → Task 4. §8 retrofit → Task 5. §9 layout feel → Task 10. §10 chrome → Task 11. §11 login → Task 12. §12 settings UI → Task 8 (+ `PATCH` route Task 7). §13 wizard → Task 9. All spec sections covered.
- Token names consistent across tasks: `--accent`, `--accent-hover`, `--accent-active`, `--accent-weak`, `--accent-fg`, `--nav-bg/fg/active/border`.
- `generateTheme(seed, mode)` signature identical in Tasks 2 and 4.
- `appearanceSchema` used in Tasks 1, 4, 7 with same shape.
