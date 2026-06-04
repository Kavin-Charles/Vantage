# Plugin Marketplace Website — Design Spec

**Date:** 2026-05-31
**Status:** Approved
**Scope:** `market.vencore.dev` — standalone platform, zero changes to main Vencore repo

---

## Overview

A standalone website and API for the Vencore plugin ecosystem. Handles public plugin discovery, developer publishing tools, and internal review/moderation. The main Vencore app only reads from this system via a single public catalog endpoint.

**Surfaces:**

| Surface | URL | Auth |
|---|---|---|
| Public marketplace | `market.vencore.dev/browse` | None |
| Developer portal | `market.vencore.dev/developer` | Clerk (developer) |
| Admin panel | `market.vencore.dev/admin` | Clerk (admin role) |

---

## Infrastructure

```
market.vencore.dev          Next.js 14 (App Router) — Vercel
market-api.vencore.dev      Express + TypeScript — Railway
market-db                   PostgreSQL (own instance) — Railway
market-storage              Backblaze B2 (plugin bundles, screenshots, icons)
auth                        Clerk (separate instance from main Vencore app)
payments                    Stripe Connect (20% platform cut, monthly payouts)
```

**Main Vencore app coupling — read-only, one endpoint:**
```
GET https://market-api.vencore.dev/catalog
```
No auth. Rate-limited by IP. Returns listed plugins for the main app's `/api/marketplace/plugins` proxy. No other coupling between this system and the main repo.

---

## Data Models

```sql
-- Developer accounts (linked to Clerk user ID from marketplace Clerk instance)
developer_accounts
  id                    uuid PK
  clerk_user_id         string unique
  name                  string
  email                 string
  stripe_connect_id     string (nullable)
  payout_enabled        boolean default false
  created_at            timestamp

-- Plugin listings
plugins
  id                    uuid PK
  slug                  string unique        -- com.acme.crm-enricher
  name                  string
  tagline               string               -- one-liner for cards
  description           text                 -- markdown
  developer_id          uuid FK → developer_accounts
  category              enum(crm, infra, integrations, messaging, analytics, other)
  status                enum(draft, submitted, approved, listed, deprecated, suspended)
  current_version       string
  install_count         int default 0
  avg_rating            decimal(3,2) default 0
  review_count          int default 0
  pricing_type          enum(free, one_time, subscription)
  price_usd_cents       int (nullable)
  sub_interval          enum(month, year) (nullable)
  icon_b2_key           string (nullable)
  screenshots_b2_keys   jsonb default '[]'
  created_at            timestamp
  updated_at            timestamp

-- Versioned bundles
plugin_versions
  id                    uuid PK
  plugin_id             uuid FK → plugins
  version               string               -- semver
  bundle_b2_key         string               -- backend.js path in B2
  frontend_b2_key       string (nullable)    -- frontend bundle path in B2
  manifest              jsonb                -- plugin.json contents
  status                enum(pending, approved, rejected)
  review_notes          text (nullable)
  submitted_at          timestamp
  reviewed_at           timestamp (nullable)
  reviewed_by           string (nullable)    -- admin Clerk user ID

-- Ratings and reviews (submitted by Vencore workspace admins via main app)
plugin_reviews
  id                    uuid PK
  plugin_id             uuid FK → plugins
  workspace_id          uuid                 -- main Vencore workspace, stored as reference
  reviewer_clerk_id     string               -- Vencore Clerk user ID (different instance)
  rating                smallint             -- 1–5
  body                  text (nullable)
  helpful_count         int default 0
  created_at            timestamp
  UNIQUE(plugin_id, workspace_id)

-- Revenue per charge (written by marketplace API when main app notifies of install payment)
plugin_revenue
  id                    uuid PK
  plugin_id             uuid FK → plugins
  workspace_id          uuid
  stripe_charge_id      string
  amount_usd_cents      int
  platform_cut_cents    int                  -- 20%
  developer_cut_cents   int                  -- 80%
  paid_out              boolean default false
  payout_id             string (nullable)
  created_at            timestamp
```

---

## API (`market-api.vencore.dev`)

### Public (no auth)

```
GET  /catalog                          Listed plugins, paginated + filterable by category/pricing/search
GET  /catalog/:slug                    Plugin detail + current version manifest
GET  /catalog/:slug/reviews            Reviews, paginated
```

### Developer (Clerk JWT, developer role)

```
POST   /developer/plugins                      Create plugin listing (draft)
GET    /developer/plugins                      List own plugins
GET    /developer/plugins/:id                  Plugin detail
PATCH  /developer/plugins/:id                  Update metadata, icon, screenshots
POST   /developer/plugins/:id/submit           Upload new version (multipart zip)
GET    /developer/plugins/:id/versions         Version history + review status per version
GET    /developer/analytics                    Installs over time, revenue, active workspaces, uninstalls
POST   /developer/stripe/connect               Generate Stripe Connect onboarding link
GET    /developer/stripe/status                Check Connect payout_enabled status
```

### Admin (Clerk JWT, `publicMetadata.role = 'admin'`)

```
GET    /admin/queue                            Pending submissions, sorted by submitted_at
GET    /admin/queue/:versionId                 Version detail — manifest, signed B2 bundle URL (15min TTL)
POST   /admin/queue/:versionId/approve         Approve → plugin promoted to listed
POST   /admin/queue/:versionId/reject          Reject with review_notes, email sent to developer
PATCH  /admin/plugins/:id/suspend              Suspend listed plugin immediately
PATCH  /admin/plugins/:id/restore              Restore suspended plugin to listed
GET    /admin/plugins                          All plugins, filterable by status
GET    /admin/plugins/:id                      Plugin audit log — all status transitions + reviewer notes
```

### Cross-system (main Vencore app → marketplace API)

```
POST   /reviews/:slug          Submit rating + review
  Body:   { workspaceId, reviewerClerkId, rating (1–5), body, installedDays }
  Auth:   HMAC-SHA256 shared secret (not Clerk — different Clerk instance)
  Guard:  installedDays < 7 → 403

POST   /revenue                Notify marketplace of a paid plugin install charge
  Body:   { pluginId, workspaceId, stripeChargeId, amountUsdCents }
  Auth:   HMAC-SHA256 shared secret
```

### Webhooks

```
POST   /webhooks/stripe        Stripe Connect events (transfer.created, payout.paid, charge.refunded)
```

---

## Frontend Pages (`market.vencore.dev`)

### Public (SSR — Next.js, indexed by search engines)

| Route | Description |
|---|---|
| `/` | Landing — hero, featured plugins, category grid, developer CTA |
| `/browse` | Plugin grid, filter by category / pricing type, full-text search |
| `/plugins/:slug` | Detail — icon, screenshots carousel, description (markdown), pricing, install count, avg rating, reviews preview, version history |
| `/plugins/:slug/reviews` | Full paginated review list |

### Developer portal (CSR, Clerk-gated)

| Route | Description |
|---|---|
| `/developer` | Dashboard — plugin list cards, total revenue, payout status banner |
| `/developer/new` | Create listing — slug, name, tagline, category, pricing type |
| `/developer/plugins/:id` | Edit metadata, upload icon (PNG ≤ 512KB), screenshots (PNG/JPG ≤ 2MB each, max 5) |
| `/developer/plugins/:id/submit` | Upload version zip, semver field, changelog; shows current review status |
| `/developer/plugins/:id/versions` | Version history table — version, submitted_at, status, review_notes |
| `/developer/analytics` | Install count over time chart, revenue breakdown table, active workspace count |
| `/developer/payouts` | Stripe Connect onboarding embed + payout history table |

### Admin panel (CSR, Clerk-gated, admin role)

| Route | Description |
|---|---|
| `/admin` | Review queue — pending submissions cards, oldest first |
| `/admin/review/:versionId` | Manifest viewer, diff vs previous approved version, signed bundle download link, approve/reject form |
| `/admin/plugins` | All plugins table — status filter, quick suspend/restore action |
| `/admin/plugins/:id` | Full audit log — every status transition with timestamp, reviewer, notes |

---

## Key Flows

### Bundle Upload & Validation

```
Developer uploads zip
→ Express receives multipart stream (busboy)
→ Validate:
    - plugin.json present and matches manifest JSON schema
    - bundle size < 5MB
    - semver format valid
    - slug matches plugin listing slug
→ Virus scan via VirusTotal API (async, blocks approval not upload)
→ Store to B2:
    plugins/{pluginId}/{version}/bundle.zip   (raw)
    plugins/{pluginId}/{version}/backend.js   (extracted)
    plugins/{pluginId}/{version}/frontend.js  (extracted, if present)
→ Create plugin_versions row (status: pending)
→ Notify admin queue (email via Resend)
```

### Admin Review & Approval

```
Admin opens /admin/review/:versionId
→ API returns manifest JSON + signed B2 URL for bundle download (15min TTL)
→ Admin inspects manifest diff vs previous approved version
→ Approve:
    plugin_versions.status = approved
    plugins.status = listed
    plugins.current_version = this version
    Invalidate /catalog cache
→ Reject:
    plugin_versions.status = rejected
    review_notes saved
    Email sent to developer via Resend
```

### Stripe Connect Payout (monthly cron)

```
Main Vencore app charges workspace for plugin install
→ POST /revenue { pluginId, workspaceId, stripeChargeId, amountUsdCents }
→ plugin_revenue row created:
    platform_cut_cents = amount * 0.20
    developer_cut_cents = amount * 0.80

1st of each month (Railway cron):
→ Group unpaid plugin_revenue by developer
→ For each developer with payout_enabled = true:
    → Stripe Transfer to stripe_connect_id
    → Mark plugin_revenue rows paid_out = true, payout_id set
→ Developers without Connect onboarding: revenue accrues, paid when they onboard
```

### Review Submission (from main Vencore app)

```
Workspace admin clicks "Write a review" in main Vencore app Settings → Plugins
→ Main app checks: installed_at < now - 7 days (enforced locally)
→ Main app POST /reviews/:slug {workspaceId, reviewerClerkId, rating, body, installedDays}
    with HMAC-SHA256 signature header
→ Marketplace API verifies HMAC, checks installedDays >= 7
→ Upserts plugin_reviews (unique per plugin + workspace)
→ Recalculates plugins.avg_rating, plugins.review_count
```

---

## Security

| Concern | Mitigation |
|---|---|
| B2 bundle access | All bundle URLs are signed (15min TTL). No public direct B2 access. |
| Admin role escalation | `publicMetadata.role = 'admin'` set only via Clerk dashboard, not via API. |
| Cross-system review/revenue calls | HMAC-SHA256 shared secret, verified on every request. Secret rotatable without deploy. |
| Markdown XSS | Plugin description rendered markdown → sanitized via DOMPurify before display. |
| Catalog scraping / abuse | `/catalog` rate-limited at 100 req/min per IP via express-rate-limit. |
| Malicious bundles | VirusTotal scan before approval. Admin manually reviews manifest permissions against allowlist before approve. |
| Semver spoofing | API rejects version upload if semver ≤ existing approved version for that plugin. |

---

## Environment Variables

```
# Clerk (marketplace-specific instance)
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Database
DATABASE_URL=            # PostgreSQL (marketplace DB on Railway)

# Backblaze B2
B2_KEY_ID=
B2_APPLICATION_KEY=
B2_BUCKET_ID=
B2_BUCKET_NAME=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PLATFORM_ACCOUNT_ID=

# Cross-system shared secrets
MAIN_APP_HMAC_SECRET=    # Shared with main Vencore app for /reviews + /revenue auth

# Email
RESEND_API_KEY=

# VirusTotal
VIRUSTOTAL_API_KEY=

# Cron protection
CRON_SECRET=
```

---

## UI Design Tokens

Match Vencore design system exactly:

```css
--bg: #f7f6f2
--surface: #ffffff
--surface2: #f0ede6
--border: #e4e0d8
--text: #1a1814
--text2: #6b665c
--text3: #9e998f
--green: #2d6a4f / --green-bg: #d8f3dc
--amber: #92400e / --amber-bg: #fef3c7
--red: #991b1b  / --red-bg: #fee2e2
--blue: #1e3a8a / --blue-bg: #dbeafe
```

Fonts: `Instrument Serif` (display, plugin names, numbers) + `DM Sans` (UI, body).

**Plugin card anatomy:** 48px icon, name (`Instrument Serif`), tagline, category badge, pricing label, star rating (filled/empty SVG), install count.

**Plugin detail screenshots:** horizontal scroll carousel, max 5 images, click to lightbox.

---

## Out of Scope (v1)

- Plugin versioning rollback (admin can only approve forward)
- Developer team accounts (one developer per plugin listing)
- Verified publisher badges
- Plugin analytics SDK (dev sees install counts, not runtime telemetry)
- Public API for third-party marketplace clients
- Mobile app for developers
