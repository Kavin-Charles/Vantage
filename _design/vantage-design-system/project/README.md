# Vantage Design System

> **Vantage — Build, sell, and ship — one place.**
> A self-hosted all-in-one platform for developer-led teams that bundles a CRM, infrastructure monitoring, team tools, and billing into a single product.

This folder is the visual-design source of truth for any artifact (mock, prototype, slide, marketing page) that needs to look and feel like Vantage. It was reverse-engineered from the production codebase, then iterated on with the brand team — design tokens, components, and motion all live here as the canonical reference.

## Source repository

**GitHub:** [Kavin-Charles/Vantage](https://github.com/Kavin-Charles/Vantage)

A Turborepo monorepo with five apps (`web`, `api`, `worker`, `agent`, `mobile`) and four shared packages. The design lives in `apps/web` — a Next.js 14 App-Router project. Keep that repo open in another window when you're building anything Vantage-shaped — the codebase is the deepest reference; this folder is its design summary.

Useful paths if you dig in:

- `apps/web/app/globals.css` — original color and layout tokens
- `apps/web/components/ui/` — Button, Badge, FormField, Modal primitives
- `apps/web/components/Sidebar.tsx` — full nav + the old 15px icon set
- `apps/web/app/(dashboard)/pipeline/page.tsx` — the kanban
- `apps/web/app/(dashboard)/analytics/KpiCards.tsx` — KPI card pattern
- `screenshots/` — 10 captured screens from a running instance (also in this folder)

> The visual language in this folder has been refined past the literal state of the code: a different type pairing, a different text ramp, a different icon system, and a more rounded chrome scale. Those decisions are documented in *Visual Foundations* below.

---

## Product surface area

Vantage is one product, three feature pillars, all on a single dashboard:

| Pillar | Pages |
|---|---|
| **CRM** | Pipeline (kanban), Contacts, Companies, Tasks, Activity, Mail |
| **Infrastructure** | Servers, Databases, Websites, Files |
| **General** | Analytics, Alerts, Settings |

Sidebar is grouped by these three buckets. Feature pillars can be toggled off per-instance via `vantage.config.json`.

Target user: **technical founders, dev agencies, and dev-led SaaS teams of 2–20 people** who don't want to glue Hubspot to Datadog to Linear. The voice and visuals reflect that — calm, dense-but-uncluttered, no growth-marketing energy.

---

## Content fundamentals

**Voice:** Direct, technical, quiet. Vantage talks to engineers like a coworker, not a salesperson. Three pillars:

- **Direct** — Tells the user what changed, what to do, what to expect. No hype words.
- **Technical** — Speaks in product nouns (pipeline, agent, threshold) not marketing nouns (journey, magic, growth).
- **Quiet** — Uses the smallest sentence that does the job. Loudness lives in the numbers, not in exclamation points.

**Casing:**

- **Title Case** for nav items, button labels, modal titles: *Add Contact, Log Activity, Sign in, Add Server.*
- **UPPERCASE** with `letter-spacing: 1.4px` for sidebar group headers and table column heads: *CRM, INFRASTRUCTURE, NAME, STATUS, LAST PING.*
- **Sentence case** for everything else: body copy, descriptions, table cells.
- The tagline preserves its punctuation exactly: *"Build, sell, and ship — one place."* with the em-dash, with *one place* set in italic.

**Pronouns:** When the product addresses the user it uses **you** (*Sign in*, *Forgot password?*, placeholder *What happened?*). Help text and CLI output is in the imperative or refers to the workspace by name.

**Numbers and dates:**

- Currency: USD, no decimals (`$36,000`, `$33.6K` for KPI cards, `$1.2M` for millions).
- Dates: locale-formatted in tables (`5/11/2026`); relative in activity feeds (`2m ago`).
- Percentages: integer, with the `%` symbol pressed against the number.

**Vantage vs Not-Vantage (sample copy):**

| ✓ Vantage | ✗ Not Vantage |
|---|---|
| `Invalid email or password` | `Hmm, that didn't look right ✨` |
| `No activity yet.` | `Nothing to see here — your timeline awaits!` |
| `prod-worker-01 memory 91.7% — above 90% threshold` | `Yikes! Your server is feeling the heat 🔥` |
| `Close 6/27/2026` | `Closes in about a month, give or take` |

**Emoji:** **No.** Emoji are not used anywhere in the product surface — not as activity icons, not as decorative accents, not in marketing. Every glyph is a stroke icon from the set in `assets/icons/`.

---

## Visual foundations

### Palette

A **warm parchment + cool ink** system. Backgrounds are creamy off-whites that read like book paper. Text colors are cool deep-ink blues drawn from the brand mark — the contrast of warm paper against cool ink is the signature print-feel.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f7f6f2` | Page background |
| `--surface` | `#ffffff` | Cards, panels, modals |
| `--surface2` | `#f0ede6` | Row hover, avatar tile |
| `--border` / `--border2` | `#e4e0d8` / `#d4cfc5` | 1px dividers |
| `--text` | `#0b1330` | Primary, headings |
| `--text2` | `#4a5677` | Secondary, labels |
| `--text3` | `#8e96ac` | Muted, timestamps |

Semantic colors (green / amber / red / blue / purple) are always used as a **foreground + tinted background pair** — they appear in badges, the alert bar, kanban stage chips, and activity-type accents. Backgrounds are pastel; foregrounds are dark enough to clear AA on the pastel bg.

**Brand blues** (from the cloud mark): `#0F1A6B` (Ink) · `#1652F0` (Vantage Blue) · `#2A8CFF` (Sky) · `#67B6FF` (Air). Used for the logo and brand moments only — not as UI accent colors. The product chrome stays in the warm-paper + cool-ink neutral palette.

### Type

Three families:

- **Bricolage Grotesque** (display) — page titles, KPI numbers, wordmark. Variable axes (width 75–100, weight 300–800) let it stretch into confident headlines without a separate display cut.
- **IBM Plex Sans** (UI / body) — every label, button, table cell. Purpose-built for dev contexts; reads cleanly at 11–14px which is where the UI lives.
- **IBM Plex Mono** (data) — server names, ports, hosts, agent tokens, CLI output.

The UI runs **small**: 14 body, 13 default, 11 captions, 10 eyebrow labels. Letter-spacing is **negative on display** (-0.3 to -0.6) and **positive on uppercase eyebrows** (1.4px).

### Spacing & layout

Fixed-shell layout: **220px sidebar**, **56px topbar**, content in the rest. Page padding is **24px**. Card interiors are **16–20px**. The spacing scale isn't a rigid grid — it uses values where the design wants them (8/10 for tight chrome, 14/16 for card insets, 24 for page gutters).

### Backgrounds

Solid color, full stop. **No gradients on chrome, no patterns, no textures, no hero imagery.** Variation comes from the warm palette itself — `--bg` vs `--surface` vs `--surface2` reads as three distinct planes without decoration. The only exception is the floating Alert card, which uses a subtle amber gradient (`#fff7ed → #fef3c7`) to lift it off the page.

### Borders, radii, shadows

Most "elevation" is done with **1px borders**, not shadows. Two shadows in the entire system:

- `0 2px 8px rgba(0,0,0,0.08)` — kanban-card hover lift.
- `0 8px 32px rgba(0,0,0,0.12)` — modal.

Corner radii are **rounded and plush** — friendly, not corporate:

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `6px` | Stage chips, kanban tags |
| `--radius` | `10px` | Inputs, small buttons |
| `--radius-md` | `12px` | Buttons, sidebar nav, kanban card |
| `--radius-lg` | `16px` | KPI cards, activity list, table panels |
| `--radius-xl` | `20px` | Modals, login card, scene containers |
| `--radius-pill` | `999px` | Badges |

### Hover & press

- **Nav items** — text-color fill, white label, 500 weight, count badges flip to translucent white.
- **Buttons** — minimal state change; `opacity: 0.6` on disabled, no press-down transform.
- **Kanban cards** — soft 2/8 shadow appears on hover, cursor goes to `grab`.
- **Activity rows / table rows** — background swaps to `--surface2` on hover.
- **Form inputs** — focus state shows a darker border (`--text2`) plus a 3px low-alpha ink halo. The cursor blinks at 1.05s.

### Motion

A single duration, single easing: **`.15s` ease** on everything. No bounces, no springs, no staggered enter animations, no skeleton shimmer. The two exceptions:

- **Critical alert dot** — 1.6s ease-out pulse ring (`scale .8 → 1.9`) so red dots in the sidebar catch the eye.
- **Focused input** — 2.2s ease-in-out halo pulse on the actively-typed-in field.

### Transparency & blur

Almost none. The modal overlay is `rgba(0,0,0,0.3)` — a flat scrim, no `backdrop-filter`. There's no glassmorphism anywhere.

### Imagery

The brand mark itself is the only first-party image: the cloud + ascending V + arrow logo (`assets/logo-cloud-trimmed.png`). **Use it everywhere Vantage appears** — sidebar, marketing, decks, exports, social. No illustrations, no stock photography. If a surface needs a focal point, prefer a piece of data (a chart, a number, a sparkline) over a stock visual.

### Cards & surfaces

A "card" in Vantage is:

- `background: var(--surface)` (pure white)
- `border: 1px solid var(--border)` (tan-gray)
- `border-radius: 16px` (surfaces) or `12px` (kanban items)
- No shadow at rest. Optional `--shadow-hover` on draggable cards.
- Internal padding 16–20px for KPI/panel cards, 12/14 for kanban items.

A "table" is a card-shaped container with a header row using uppercase eyebrow styling and rows separated by `1px solid var(--border)`. No zebra striping. Row hover is a `--surface2` fill.

---

## Iconography

**One system, end to end.** All icons in Vantage are **24×24 viewBox stroke icons** at `1.75px` stroke weight, with rounded caps and rounded joins, no fills. `currentColor` only — they inherit the surrounding text color and flip to white in active nav items.

This replaces the legacy 15×15 filled set that the source codebase shipped with. If you're working in the source repo, you'll see the old filled icons inline in `Sidebar.tsx` and elsewhere — port them over by name (the names in `assets/icons/` match 1:1 with the source).

The full set, by group:

- **CRM** — pipeline, contacts, companies, tasks, activity, mail
- **Infrastructure** — servers, databases, websites, files
- **General** — analytics, alerts, settings
- **Utility** — search, bell, plus, chevron-down, arrow-right, check, x, warning, dot, grip, logout, filter, phone, meeting, note

**No emoji.** Earlier versions of the product surfaced emoji as activity-row icons; that has been replaced — every activity type now uses the matching stroke glyph (call → phone, email → mail, meeting → meeting, note → note, deal_change → arrow-right, contact_created → contacts).

**The brand mark** lives in `assets/logo-cloud-trimmed.png`. It is the only mark — use it in the sidebar (28px white tile + serif wordmark), as the favicon (mark only), and at any other size on any other surface where Vantage appears. There is no "secondary" mark.

---

## Files in this folder

```
README.md                  This file
SKILL.md                   Agent skill manifest (cross-compatible with Claude Code)
colors_and_type.css        CSS variables + semantic type classes — the foundation

assets/
  logo-cloud.png           Original master (1536×1024)
  logo-cloud-trimmed.png   Trimmed presentation copy (380×300)
  logo-cloud-small.png     Smaller version for chrome lockups
  icons/                   29 stroke icons (24px viewBox, 1.75px, rounded)

screenshots/               10 captured screens from a running Vantage instance

preview/                   Cards rendered into the Design System tab —
                           one concept per file (colors, type, components, …)

ui_kits/
  web/                     Pixel-faithful recreation of the Vantage dashboard,
                           updated to the new visual language.
                           Click-thru: Pipeline, Contacts, Activity,
                           Servers, Analytics.
```

---

## How to use this system

1. **Link `colors_and_type.css` first.** Every other rule depends on its variables.
2. **Build the shell before the content.** Sidebar + topbar + content area is the universal layout; don't fight it.
3. **Match the density.** This is a 14px-baseline product. Big padding and generous whitespace will read as "not Vantage."
4. **Reach for the display face sparingly.** Page title, KPI number, modal title, wordmark. If everything is Bricolage, the brand stops working.
5. **Use semantic colors as pairs.** Never green text on a white card. Always green text on `--green-bg`, inside a pill or row tile.
6. **When you need an icon, copy one from `assets/icons/` first.** Only draw a new SVG if nothing in the set works, and match the 24×24 / 1.75px stroke style when you do.
7. **The cloud logo is the brand mark — use it everywhere.** Don't invent abbreviated marks, monogram tiles, or simplified glyphs.

---

## Known gaps / caveats

- **`vantage-full.html` was not found in the source repo at scrape time** — `CLAUDE.md` references it as the canonical UI reference but the file is not committed. The system here is reconstructed from the live component tree plus the brand iteration captured in *Visual Foundations*.
- **Fonts ship from Google.** Bricolage Grotesque, IBM Plex Sans, and IBM Plex Mono are all loaded via `@import`. The repo doesn't ship `.woff2` files. For an offline build you'll need to host them yourself.
- **The Files page and Mail compose flow** exist in the source codebase but aren't in the UI kit recreation — they were behind feature flags and weren't central to the visual story.
