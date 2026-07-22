# Vencore Repo SEO Refresh & Content Update — Design

**Date:** 2026-07-22
**Status:** Approved design → ready for implementation plan
**Scope:** GitHub repo discoverability + accuracy. README rewrite, repo metadata (About + topics), OG social-preview image, and refreshed/expanded screenshots for the current product.

---

## Problem

The public repo does not reflect the current product and is not optimized for discovery.

1. **Stale content.** README covers only CRM, Infra, Analytics. The product now also ships: Projects/PM (milestones, sprints, time logs, recurring, automation, client portal), Messaging, Dashboard + widgets + dark mode, a Plugin marketplace + SDK, a public v1 API with API keys + webhooks, notifications, RBAC roles (beyond admin/member), a setup wizard, and an instance self-updater (semver).
2. **Broken hero image.** README references `log_o.png`; the actual file is `logo.png`. The hero image is currently broken on GitHub.
3. **Stale screenshots.** Existing shots cover only the original modules; new modules have none.
4. **Weak SEO.** No keyword-optimized README structure, no OG social-preview image, and repo About/topics are not tuned for search intent.

## Goals

- Repo README, About, and topics accurately describe the current product and rank for relevant GitHub/web search intent.
- Positioning hook: **open-source, self-hosted company OS**; differentiator: **white-label, modular**.
- Every current module is represented in copy and screenshots.
- Shareable link previews (Twitter/Slack/LinkedIn) render a branded OG card.

## Non-Goals

- No external docs site / GitHub Pages (explicitly out of scope).
- No product code changes. This is repo-surface work only (README, images, metadata).
- No new marketing copy beyond the README.

---

## Positioning & Keywords

**H1 hook:** "Open-source, self-hosted company OS — white-label CRM, projects, infra monitoring & analytics in one modular platform."

**About description (~160 chars, keyword-front-loaded):**
"Open-source, self-hosted company OS — white-label CRM, project management, infra monitoring & analytics in one modular, multi-tenant platform."

**Topics (~20):**
`open-source, self-hosted, crm, company-management, white-label, project-management, infrastructure-monitoring, uptime-monitoring, saas, multi-tenant, plugin-system, nextjs, typescript, express, postgresql, kysely, monorepo, dashboard, business-management, team-collaboration`

---

## Design

### 1. README rewrite (marketing-forward structure)

Sections, in order:

1. **Hero** — fixed logo (`logo.png`), H1 hook line, badge row (license, CI, latest release, stars, PRs-welcome).
2. **Intro paragraph** — keyword-dense: open-source, self-hosted, white-label, modular, multi-tenant, CRM, project management, infrastructure monitoring, analytics.
3. **Why self-hosted / white-label** — short differentiator block (own your data, brand it as yours, enable only the modules you need, no per-seat SaaS sprawl).
4. **Screenshot gallery** — hero pair (light + dark), then a `<details>` grid of the rest. Keyword-rich `alt` text on every image (SEO + a11y).
5. **Features by module** — CRM, Projects/PM, Infrastructure, Analytics, Messaging, Dashboard, Plugins/Marketplace, Platform (RBAC, API, webhooks, notifications, white-label, self-updater).
6. **Architecture** — updated apps + real `packages/` (`db`, `types`, `config`, `modules`, `plugin-runtime`, `plugin-types`, `api-client`). Note plugin SDK and SSE realtime.
7. **Tech Stack** — table refreshed (add TanStack Query, SSE, plugin runtime).
8. **Getting Started** — keep existing quickstart; verify against current scripts/config; add agent + setup-wizard notes.
9. **Configuration / API / Development / Project Structure** — corrected to current tree; link `plugin-docs/` and the v1 API.
10. **License** — unchanged (MIT).

Accuracy fixes folded in:
- `log_o.png` → `logo.png`.
- Feature list expanded to every current module (see routes/pages inventory below).
- Version reference `0.2.0`.

### 2. Repo metadata (via `gh`)

- `gh repo edit` sets the About description and the topic list above. Requires `gh` authenticated with repo-admin scope on the origin (`vencorehq`).

### 3. OG social-preview image (1280×640)

- Build a self-contained HTML card using the design tokens (warm off-white `--bg #f7f6f2`, Instrument Serif + DM Sans, logo, hook line, module chips).
- Render with Playwright at a 1280×640 viewport → PNG. No backend required; can be produced independently of the app boot.
- Upload via repo Settings → Social preview (manual step; `gh` cannot set this — call it out in the plan).

### 4. Screenshots (requires app boot)

**Boot path (manual, privileged — user runs):**
```
sudo pacman -S --noconfirm docker-compose && sudo systemctl start docker && sudo usermod -aG docker $USER
sudo docker compose up -d
```
Then (assistant): verify images pulled, run migrations + `seed-demo`, confirm demo data, launch web/api/worker, log in with seeded admin creds.

**Capture (Playwright), consistent viewport, seeded data:**
- Refresh existing: `pipeline, contacts, companies, activity, tasks, servers, databases, websites, alerts, analytics`.
- New: `dashboard, projects, milestones-sprints, messaging, plugins-marketplace, portal, settings-rbac`.
- Hero pair captured in both light and dark theme.
- Save as PNG into `screenshots/`, wire into the README gallery with descriptive alt text.

---

## Current product inventory (source of truth for copy)

**Web pages:** `dashboard, crm, projects, infra, analytics, messaging, plugins, settings, activity, setup, invite, portal, (auth: login/sign-in/sign-up/forgot/reset)`.

**API route groups (selected):** `contacts, companies, deals/pipelines, pipeline-items/fields/automations, custom-fields, contact-tags, tasks/tasks-unified, activity, projects, project-tasks/members/docs/templates, milestones, sprints, recurring-rules, time-logs, pm-analytics, pm-search, portal, messaging, servers, agent, infra-databases, websites, alerts, alert-thresholds, ssh-actions/keypair, analytics, dashboards, hub-*, plugins, roles/user-roles/session-roles/rbac-constraints, api-keys, webhooks, hooks, notifications/notification-preferences, invites, setup, config, system, sse, workspace/workspace-modules, v1 (public API)`.

**Packages:** `db, types, config, modules, plugin-runtime, plugin-types, api-client`.

**Plugin SDK docs:** `plugin-docs/*.mdx`.

**Version:** `0.2.0`.

---

## Sequencing

Per decision: **everything ships after boot**, in one pass.

1. User boots Docker stack (manual, privileged).
2. Assistant seeds demo data, captures all screenshots.
3. Assistant rewrites README (content + SEO), wires screenshots.
4. Assistant builds + renders OG image.
5. Assistant sets About + topics via `gh`.
6. Manual: user uploads OG image in repo Settings (gh can't).
7. Run `Update Graphify` if file relationships changed (README/screenshots only — likely skip).

OG image, README copy, and metadata do **not** technically require the boot; only screenshots do. Bundled together per the "everything after boot" decision.

## Risks

- **TimescaleDB migration** may hard-require the extension; using the prebuilt `timescale/timescaledb:latest-pg15` image (per compose) avoids this.
- **ghcr images** must be public-pullable, else needs `ghcr` login.
- **`gh` auth scope** must allow `repo edit` on `vencorehq/vencore`.
- **Social preview** upload is manual — not scriptable via `gh`.

## Success criteria

- README renders with working hero, accurate module coverage, refreshed + new screenshots, keyword-optimized copy and alt text.
- `gh repo view` shows the new About + topics.
- A shared repo link renders the OG card.
