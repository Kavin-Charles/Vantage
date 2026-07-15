# Instance Updater — Design

**Date:** 2026-07-03
**Status:** Approved

## Summary

Self-hosted Vencore instances currently update manually (`docker compose pull && up -d`). This feature makes the instance aware of new releases published to GHCR and lets an admin apply them with one click from the dashboard.

**Decisions made:**
- **Update mode:** notify + one-click. No unattended auto-update in v1.
- **Version scope:** any new semver release (patch, minor, major). Major bumps get a stronger confirmation warning.
- **Executor:** a dedicated `vencore-updater` sidecar container with the Docker socket mounted. The main app never touches the socket.
- **Pinning:** compose images pinned via `VENCORE_VERSION` in `.env` (fallback `latest`). The updater bumps the variable and recreates services.

## Background

- CI publishes `vencore-web`, `vencore-api`, `vencore-worker` to `ghcr.io/vencorehq/*` — `latest` on main pushes, plus `{version}` and `{major}.{minor}` semver tags on `v*` git tags (`.github/workflows/docker-publish.yml`). Packages are public.
- Customers install via `install/install.sh` / `install.ps1`, which writes a compose file pinned to `:latest`.
- Nothing runs DB migrations in prod today — `db:migrate` is a manual script; `Dockerfile.api` just starts the server.
- The About settings page shows the web `package.json` version only.

## Architecture

```
GHCR (public)
   ▲ tags/list (anon token)          ▲ docker pull
   │                                 │
worker ── update-check job      vencore-updater (sidecar)
   │  writes                        ▲ POST /update, GET /status
   ▼                                │ internal network only, UPDATER_SECRET
instance_meta table ◄── api ────────┘
                         ▲ admin-only proxy routes
                         │
                        web ── Settings → Updates page, admin badge
```

### 1. Versioning groundwork

- Add `VENCORE_VERSION` build arg to all three Dockerfiles, baked in as an env var. CI passes the git tag version.
- New API route `GET /api/system/version` → `{ version }`. Unauthenticated is fine (it's not secret and the web needs it to detect the post-update restart), but keep response minimal.
- About page reads the product version from the API instead of the web `package.json`.
- `docker-compose.prod.yml` and installer-generated compose use `ghcr.io/vencorehq/vencore-*:${VENCORE_VERSION:-latest}`.

### 2. Update check — worker job

- New worker job `update-check`, every 6 hours and once on boot.
- Fetches an anonymous pull token from `ghcr.io/token?scope=repository:vencorehq/vencore-api:pull`, then `GET https://ghcr.io/v2/vencorehq/vencore-api/tags/list`.
- Parses full-semver tags only (ignores `latest` and `{major}.{minor}` aliases), finds the highest version greater than the running `VENCORE_VERSION`.
- Persists to a new **instance-level** table `instance_meta` (single row, not workspace-scoped): `current_version`, `latest_version`, `last_checked_at`, `release_url` (GitHub releases page for the tag).
- On first detection of a new version, notify workspace admins through the existing notification system (once per version, not per check).
- Network failures are logged and skipped — never crash the job loop. If the instance can't reach GHCR, the feature degrades to "no update info".

### 3. Updater sidecar

- New app `apps/updater`: minimal Node HTTP server, published as `ghcr.io/vencorehq/vencore-updater`, added to the compose stack.
- Mounts: `/var/run/docker.sock` and the install directory (compose file + `.env`).
- **No published ports.** Reachable only on the internal Docker network. Every request must carry `UPDATER_SECRET` (generated into `.env` by the installer, shared with the API).
- Endpoints:
  - `POST /update { version }` — validates the version is a well-formed semver that exists in GHCR, then:
    1. `docker compose pull` with the new tag (**pull before switch** — a failed pull leaves the stack untouched).
    2. Rewrite `VENCORE_VERSION` in `.env` (keep the previous value in a `VENCORE_PREVIOUS_VERSION` line for manual rollback).
    3. `docker compose up -d` — recreates web/api/worker. The updater recreates itself last so it survives long enough to finish.
  - `GET /status` — `{ state: idle | pulling | recreating | error, startedAt, targetVersion, log: string[] }` (last ~50 log lines).
  - Rejects a new `POST /update` while one is in flight.
- API proxy routes (admin role required):
  - `POST /api/system/update` → forwards to the sidecar with the secret.
  - `GET /api/system/update-status` → proxies sidecar status.

### 4. Migrations on boot

- API entrypoint runs pending Kysely migrations before starting the HTTP server, guarded by a Postgres advisory lock so concurrent starts don't race.
- If migration fails, the API exits non-zero (compose `restart: unless-stopped` retries; the healthcheck keeps `web` from flapping onto a broken API).
- This is a standalone prerequisite change — it also fixes today's gap where prod migrations are manual.

### 5. UI

- **Settings → Updates** page, admin-only:
  - Current version, latest version, last-checked time, "Check now" button, changelog link. The GHCR check logic lives in a shared module (e.g. `packages/` or `apps/api/src/lib`) so the worker cron and an API "check now" route both run the same code — no cross-process job triggering.
  - "Update now" button → confirmation dialog; when the bump is major, the dialog explicitly warns about breaking changes and requires typing the version to confirm.
  - During an update: progress state driven by `update-status` polling. When the API stops responding (recreate window), switch to "Waiting for services to come back…" and poll `GET /api/system/version` until it returns the target version, then hard-reload.
- **Update available indicator:** badge on the Settings sidebar entry for admins, dismissible per version.
- Follow the existing settings page patterns (`apps/web/app/(dashboard)/settings/*`) and design tokens.

### 6. Installer & compose changes

- `install/install.sh` and `install/install.ps1`:
  - Resolve the latest release version at install time and write `VENCORE_VERSION=<x.y.z>` to `.env`.
  - Generate `UPDATER_SECRET` alongside the other secrets.
  - Compose template gains the `updater` service (socket + install-dir mounts, no ports) and versioned image tags.
- `docker-compose.prod.yml` (reference file) updated to match.
- Existing installs on `:latest` keep working via the `${VENCORE_VERSION:-latest}` fallback; upgrading them to the updater flow means re-running the installer or copying the new compose — documented, not automated.

### 7. Error handling

| Failure | Behaviour |
|---|---|
| GHCR unreachable during check | Job logs and skips; UI shows stale `last_checked_at`. |
| Pull fails | Stack untouched; status → `error` with logs; UI shows the error and a retry button. |
| Recreate fails / API never comes back | Status → `error`; UI (once reachable) or docs show manual rollback: set `VENCORE_VERSION` back, `docker compose up -d`. `VENCORE_PREVIOUS_VERSION` in `.env` records the value. |
| Migration fails on new version | API exits and restarts in a crash loop; manual rollback as above (down-migrations are out of scope for v1). |

## Security notes

- Docker socket access is confined to the single-purpose updater container; the API/web/worker never mount it.
- The updater is not exposed outside the Docker network and requires the shared secret on every request.
- Update trigger requires an authenticated admin; the API validates the requested version against the worker-detected `latest_version` before forwarding (no arbitrary tag injection).

## Out of scope (v1)

- Unattended auto-update / maintenance windows
- One-click or automatic health-check rollback
- Down-migrations
- Updating pre-existing `:latest` installs in place automatically
- Release-notes rendering inside the dashboard (link out to GitHub instead)

## Testing

- **Unit:** semver comparison/selection logic in the update-check job; `.env` rewrite logic in the updater; version-validation in the API proxy route.
- **Integration:** update-check job against a mocked GHCR tags response; API proxy routes with a stubbed sidecar (auth, admin gating, in-flight rejection).
- **Manual/E2E:** full update run on a local compose stack — install old version, publish a newer tag, verify banner → one-click update → new version live and migrations applied.
