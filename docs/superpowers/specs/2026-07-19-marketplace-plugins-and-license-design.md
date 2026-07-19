# Marketplace Plugin Listing + Working License System — Design

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan

## Goal

Make the Vencore plugin page list plugins from the marketplace and make paid-plugin
licensing work end-to-end:

- Plugin settings page shows approved plugins fetched from the platform marketplace.
- Installing a paid plugin validates a license against the platform.
- Licenses bind per workspace and are re-checked periodically; plugins whose license
  becomes invalid are auto-disabled.

All changes are **Vencore-side only**. The `vencore-platform` repo is the source of
truth for the marketplace/license contract and is not modified.

## Context: what already exists

The plumbing is largely wired but broken by contract drift with the platform's current
`v1` API.

**Vencore (this repo):**
- `GET /api/plugins/marketplace` — proxies platform `GET /v1/plugins` using
  `MARKETPLACE_API_URL` + `MARKETPLACE_SERVICE_TOKEN`.
- `POST /api/plugins/marketplace/install/:platformPluginId` — downloads plugin zip,
  validates license for paid plugins, installs into `workspace_plugins`.
- `PATCH /api/plugins/:id` — enable/disable; enabling a paid plugin re-validates the
  license, disabling deactivates it.
- UI: `apps/web/app/(dashboard)/settings/plugins/page.tsx` — lists installed +
  marketplace plugins, has a `LicenseModal`, installs from marketplace.
- `workspace_plugins` columns (migration `20260610_002`): `pricing_type`, `license_key`,
  `source`, `platform_plugin_id`, plus base `enabled`.

**Platform (reference, not modified):**
- `GET /v1/plugins` — list approved plugins (returns `id`, `slug`, pricing, etc.).
- `GET /v1/plugins/:slug` — plugin detail **by slug**, includes `download_url`.
- `POST /v1/licenses/validate` — binds a key to an `instance_id`, returns state.
- `POST /v1/licenses/deactivate` — unbinds a key.
- `POST /v1/licenses/check` — batch status for many keys under one `instance_id`.
- All `v1` routes guarded by a `serviceToken` middleware (`x-service-token`).

### Platform license model (source of truth)

- `license_keys` columns: `key` (uuid), `status` (`active` | `grace` | `expired` |
  `revoked`), `expires_at`, `grace_until`, `instance_id` (uuid, **no FK**),
  `instance_name`, `instance_domain`, `callback_url`, `callback_secret`,
  `razorpay_subscription_id`.
- Keys are subscription-based: minted by Razorpay webhook or free-install, emailed to
  the buyer.
- State machine (`lib/license-state.ts`): `active → grace (7 days) → expired`, or
  `revoked`. `decideValidation` binds a key to the first `instance_id` that validates;
  a different instance is rejected with `BOUND_ELSEWHERE`.
- A platform sweep cron transitions states and **pushes** events to a per-key
  `callback_url` (HMAC-signed). The push code comments that "the instance's daily poll
  will catch up within 24h" — i.e. polling `/v1/licenses/check` is the intended
  fallback. Vencore uses the poll path; it does not register callbacks.

## The bugs (why it doesn't work today)

1. **Install detail lookup by id vs slug.** Install calls
   `GET /v1/plugins/{uuid}` (passing `mp.id`), but the platform route matches by
   **slug** with `where status = approved` → 404 on every paid install.
2. **License validate payload mismatch.** Platform `validate` requires `instance_id`
   (uuid) and ignores the legacy `workspace_id`. Vencore sends `{plugin_id,
   workspace_id, key}` with **no `instance_id`** → 400 (`BAD_REQUEST`) every time.
   This happens at **two** call sites: install and enable-toggle.
3. **No instance identity.** Vencore has no concept of an instance id; the platform
   binds licenses to one.
4. **Config empty by default.** `MARKETPLACE_API_URL` is empty, so the list endpoint
   returns `[]` (fails safe).

## Decisions

- **License binding granularity: per workspace.** `instance_id = workspace.id` (already
  a UUID; the platform's `instance_id` has no FK, so an opaque workspace UUID is
  accepted). Consequence: one license key binds to exactly one workspace; reusing the
  same key on a second workspace returns `BOUND_ELSEWHERE`. One key per workspace.
- **Enforcement depth: validate-at-install + periodic re-check.** No revoke callbacks.
  A cron periodically calls `/v1/licenses/check` and auto-disables plugins whose license
  is no longer usable.
- **Grace = warn, do not disable.** Grace-status licenses keep the plugin enabled; a
  badge warns the admin.

## Design

### 1. Fix contract drift — `apps/api/src/routes/plugins.ts`

**Install detail lookup by slug** (`POST /api/plugins/marketplace/install/...`):
- UI passes `mp.slug`; route fetches `GET /v1/plugins/{slug}` to obtain the detail body
  (`id`, `download_url`, `pricing_type`).
- Use the returned `mp.id` as both the `plugin_id` for validate and the stored
  `platform_plugin_id`.

**License validate payload** (both install site and enable-toggle site):
- Send `{ plugin_id, key, instance_id: workspace.id, instance_name: workspace.name,
  instance_domain: workspace.domain }`. Drop `workspace_id`.
- Surface the platform's error codes to the client: `EXPIRED` (403), `REVOKED` (403),
  `BOUND_ELSEWHERE` (409), `NOT_FOUND` (404), plus existing `LICENSE_REQUIRED` (402).

**Deactivate** (disable-toggle site): unchanged — `deactivate` only needs
`{plugin_id, key}`.

### 2. Instance identity

`instance_id = workspace.id`. No new storage. `instance_name` / `instance_domain` sent
from the workspace record for platform-side admin visibility.

### 3. License enforcement (periodic re-check)

**Migration** (new file, `packages/db/migrations/`):
- Add to `workspace_plugins`:
  - `license_status varchar(24)` nullable (values mirror the platform: `active`,
    `grace`, `expired`, `revoked`, `bound_elsewhere`, `not_found`).
  - `license_checked_at timestamptz` nullable.
- Update the Kysely type in `packages/db/src/schema.ts` to match.

**Worker** `apps/api/src/workers/license-check.ts` (mirrors `website-checker.ts`):
- On an interval (default 30 min), for each workspace that has paid marketplace plugins
  with a `license_key`:
  - POST `/v1/licenses/check` with `{ instance_id: workspace.id, keys: [...] }`.
  - For each returned key: write `license_status` + `license_checked_at` on the matching
    `workspace_plugins` row.
  - If a key's status is not usable (`expired` | `revoked` | `bound_elsewhere` |
    `not_found`) and the plugin is currently enabled: set `enabled = false` and run the
    same teardown the disable-toggle does (invalidate sandbox, deactivate hook provider)
    so consumers fall back to the builtin provider.
  - `active` / `grace`: leave `enabled` as-is (grace only warns via status).
- Guard on `MARKETPLACE_API_URL` being set (no-op when unset).
- Started from `apps/api/src/index.ts` alongside the other workers.

**Enforcement on use:** the bridge already blocks disabled plugins
(`where enabled = true`), so no extra gate is needed — auto-disable is sufficient.

### 4. UI — `apps/web/app/(dashboard)/settings/plugins/page.tsx`

- Pass `mp.slug` (not `mp.id`) to the install call.
- Add a `license_status` badge on paid installed plugins: `active` (neutral/green),
  `grace` (amber, "renew soon"), `expired` / `revoked` / `bound_elsewhere`
  (red, plugin auto-disabled with the reason shown instead of the generic disabled
  state).
- Surface the new validate error messages from install / enable failures.

### 5. Config

- Set `MARKETPLACE_API_URL` and `MARKETPLACE_SERVICE_TOKEN` (already in `.env.example`).
  Empty `MARKETPLACE_API_URL` keeps the marketplace list empty and the cron a no-op.

## Testing

- **Unit:** validate payload builder includes `instance_id`; cron re-check disable
  logic (usable vs not-usable → enabled flag); slug-based install path.
- **Contract:** a fake platform responder returning each status maps to the correct
  Vencore behavior (enabled/disabled + `license_status`).
- **Manual:** marketplace list loads; install a free plugin; install a paid plugin with
  a valid key; revoke the key on the platform → next cron tick disables the plugin and
  the UI shows `revoked`.
- **Regression:** `seed-demo.ts` still runs (its demo license row uses the new columns'
  defaults).

## Out of scope

- Modifying `vencore-platform`.
- Revoke callbacks / a Vencore webhook endpoint (poll fallback is used instead).
- Free-plugin flow changes; plugin sandbox/runtime changes.
- Purchasing / subscription management inside Vencore (buyers get keys from the
  platform).

## Files touched

- `apps/api/src/routes/plugins.ts` — slug install, validate payload (2 sites), error
  surfacing.
- `apps/api/src/workers/license-check.ts` — new worker.
- `apps/api/src/index.ts` — start the worker.
- `packages/db/migrations/<new>.ts` — `license_status`, `license_checked_at`.
- `packages/db/src/schema.ts` — Kysely type update.
- `apps/web/app/(dashboard)/settings/plugins/page.tsx` — slug install, status badge,
  error messages.
- Tests under `apps/api/src/__tests__/`.
