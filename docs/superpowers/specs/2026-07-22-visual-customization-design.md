# Vencore Visual Customization — Design

**Date:** 2026-07-22
**Status:** Approved (brainstorming) — ready for implementation plan
**Scope:** Deployment/admin-level visual white-labeling. Make the existing (dead) brand color actually apply, and add preset palettes, layout feel, branded chrome, and login-page customization.

---

## 1. Problem

The setup wizard collects `app.primaryColor`, stores it in config, previews it, and serves it via `/api/config` + `useConfig` — **but it is never injected into the running app.** It is a dead value. The live UI's "primary action" color is actually `var(--text)` (`#0b1330`), and the dead `primaryColor` default happens to be that same hex, hiding the fact that nothing is wired.

Goal: make the brand color genuinely drive the UI, and add more deployment-level visual customization.

## 2. Decisions (locked during brainstorming)

- **Control level:** deployment/admin only. Matches the existing single config-file / `system_settings.config` model. No per-user color overrides (per-user light/dark theme stays).
- **Palette generation:** a single accent **seed** color generates a full **accent ramp** plus a **subtle tint** of the neutral surfaces. Neutral text ladder is left untouched for readability. Warm off-white (light) and dark neutrals stay recognizable. (Chosen over a full neutral remap to limit accessibility risk.)
- **Extra knobs (all in):** preset palettes, layout feel (radius + density), branded chrome (sidebar/topbar), login page.
- **Injection:** server-side rendered `<style>` in root `<head>` → no color flash (FOUC).
- **Color engine dependency:** add `culori` (small, well-tested oklch math) rather than hand-rolling a converter.
- **Default seed = current look** → zero visual change until an admin brands the instance. All customization is opt-in.

## 3. Architecture overview

```
admin edits appearance (settings UI or setup wizard)
      │  PATCH /api/config  (new admin route, zod-validated)
      ▼
system_settings.config.app.appearance   (DB, JSON blob)
      ▼  readConfigFromDb (file fallback)
GET /api/config  ──►  root layout getBranding()/getAppearance()  (SSR)
      ▼  generateTheme(seed, 'light' | 'dark')  +  data-* attributes
<style id="brand-theme"> :root{…}  [data-theme="dark"]{…} </style>
<html data-radius data-density data-nav>
      ▼
Components read CSS vars ( --accent*, --nav*, --radius*, tinted neutrals )
```

Per-user light/dark still layers on top: dark mode consumes the generated **dark** token set.

## 4. Config schema

`packages/config/src/config-schema.ts` — add `app.appearance` (all fields defaulted so existing configs parse unchanged):

```ts
appearance: {
  accentColor:  string;   // hex seed. default '#0b1330'
  preset:       string;   // preset id | 'custom'. default 'default'
  radius:       'sharp' | 'rounded' | 'pill';        // default 'rounded'
  density:      'comfortable' | 'compact';           // default 'comfortable'
  sidebarStyle: 'light' | 'dark' | 'brand';          // default 'light'
  login: {
    background:      string | null;   // hex, default null
    backgroundImage: string | null;   // data URL or URL, default null
  };
}
```

Back-compat: legacy `app.primaryColor`, if present and `appearance.accentColor` absent, maps to `accentColor`. `/api/config` response gains the `appearance` object (keep `primaryColor` in the response too for now).

## 5. Palette engine — `packages/config/src/palette.ts` (pure, unit-tested)

`generateTheme(seed: string, mode: 'light' | 'dark'): Record<string, string>`

Uses `culori` (hex ↔ oklch).

**Accent ramp:**
- `--accent` — seed adjusted for mode (slightly lift lightness in dark).
- `--accent-hover` — accent, −lightness.
- `--accent-active` — accent, −−lightness.
- `--accent-weak` — high-lightness, low-chroma tint (badge/hover backgrounds).
- `--accent-fg` — `#fff` or ink, whichever meets WCAG contrast ≥ 4.5 against `--accent`.

**Neutral tint:**
- Nudge `--bg`, `--surface`, `--surface2`, `--border` hue toward the seed hue at very low chroma (~2–4%). Text ladder (`--text/2/3`) untouched.

**Guardrails:**
- If any derived foreground/background pair fails its contrast threshold, clamp lightness until it passes.
- Unit tests sweep a range of seed hues and assert `--accent-fg`/`--accent` and text/tinted-surface contrast all pass.

## 6. Presets — `packages/config/src/presets.ts`

Registry: `{ id, name, seed, sidebarStyle? }[]`. Initial set: Default `#0b1330`, Midnight, Forest `#2d6a4f`, Slate, Ember `#92400e`, Violet `#4c1d95`. A preset only sets the seed (and optional sidebar default). "Custom" = free color picker. Reuses the swatch palette already present in `StepBranding`.

## 7. SSR injection — `apps/web/app/layout.tsx`

Extend the existing `getBranding()` fetch to also return `appearance`. In the layout:
- Compute `generateTheme(seed,'light')` and `generateTheme(seed,'dark')`.
- Emit `<style id="brand-theme">` with `:root{…}` and `[data-theme="dark"]{…}` blocks of concrete hex values.
- Set `data-radius`, `data-density`, `data-nav` on `<html>`.

Server-rendered concrete values ⇒ no FOUC. On fetch failure, omit the style block (globals.css defaults = current look).

## 8. Component retrofit (makes the accent actually apply)

- `Button.tsx` primary variant: `var(--text)` → `var(--accent)`; text → `var(--accent-fg)`; hover → `var(--accent-hover)`.
- Active sidebar/nav item, links, focus rings → `var(--accent)`.
- Primary chart series (e.g. `MetricChart`) → `var(--accent)`.
- Sidebar + Topbar chrome → new `--nav-*` tokens.
- Bound the change set by grepping for `var(--text)` used as a background/action color.

## 9. Layout feel — `globals.css`

- `[data-radius="sharp"]` / `[data-radius="pill"]` override the `--radius*` scale (rounded = current default).
- `[data-density="compact"]` overrides paddings, `--header-h`, and font-size vars.

## 10. Branded chrome

New tokens `--nav-bg`, `--nav-fg`, `--nav-active`, `--nav-border`. `data-nav` selects: `light` (default, current look), `dark`, `brand` (= accent). Sidebar and Topbar components consume these tokens.

## 11. Login / setup page

Reads `appearance.login`: background color or image (Dropzone, same pattern as logo) + tagline placement. Extend the existing login page, which already reads config.

## 12. Admin settings — `apps/web/app/(dashboard)/settings/appearance/page.tsx`

Add an RBAC-gated admin section (non-admins keep the existing light/dark toggle only):
- preset grid, accent picker + swatches (reuse StepBranding controls), radius/density/sidebar-style toggles, login background.
- live preview panel (reuse the setup wizard preview).
- Save → **new `PATCH /api/config` admin route**: RBAC admin, zod-validated, upserts `system_settings.config` `app.appearance`. (No post-setup config-write route exists today — must be added.)

## 13. Setup wizard — `StepBranding`

Add the same new knobs (preset, radius, density, sidebar style) so branding is set at install time. Share controls with the settings page.

## 14. Testing

- **Unit:** palette engine contrast sweep across hues; back-compat parse of an old config with only `primaryColor`.
- **Component:** Button primary uses `--accent`; nav active state uses `--accent`.
- **Manual:** apply Forest preset, toggle dark, eyeball contrast; verify no FOUC on reload.

## 15. Phasing (for the implementation plan)

1. **Color actually works** — config schema + palette engine + SSR injection + Button/nav retrofit.
2. **Presets + admin control** — presets registry + `PATCH /api/config` route + settings UI + wizard knobs.
3. **Structure** — layout feel (radius/density) + branded chrome (sidebar/topbar).
4. **Login page** customization.

## 16. Out of scope

- Per-user color overrides.
- Full neutral remap (whole-app hue takeover).
- Two-seed (separate accent + neutral) palettes.
- Runtime theme switching without reload (SSR reload is acceptable).
