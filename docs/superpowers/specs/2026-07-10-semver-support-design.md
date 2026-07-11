# Semver Support — Design

**Date:** 2026-07-10
**Status:** Approved

## Goal

Introduce real semantic versioning across Vencore: release tagging that feeds the instance updater, and version rules for the plugin system (upgrade enforcement, SDK compatibility warnings, host version ranges).

## Current State

- `apps/api/src/lib/update-check.ts` has a hand-rolled `isSemver`/`compareSemver`/`pickLatest` limited to strict `X.Y.Z`. It pulls tags from GHCR and links to GitHub releases that have never been created — the repo has zero git tags.
- `docker-publish.yml` already builds on `v*` tags, applies semver image tags, and bakes `VENCORE_VERSION` into the API image (`Dockerfile.api` ARG → ENV). The pipeline works; it has just never been fed a tag.
- Plugin manifest `version` is validated only by regex (`/^\d+\.\d+\.\d+/`). Both install paths in `apps/api/src/routes/plugins.ts` (marketplace install ~L410, direct upload ~L735) upsert `workspace_plugins` with no version comparison — same or lower versions are silently accepted.
- Manifest `sdk_version` is accepted by the schema but enforced nowhere.
- No range support of any kind.

## Decisions

| Question | Decision |
|---|---|
| Release flow | Tag-driven. Push `vX.Y.Z` tag; workflow builds images and auto-creates a GitHub Release with generated notes. |
| Plugin publish rules | Strict: new version must be `>` installed version. Prereleases supported for dev iteration (`1.2.0-dev.1` → `1.2.0-dev.2` → `1.2.0`). |
| SDK compatibility | Warn only on major mismatch. Missing `sdk_version` accepted without warning. |
| Ranges | Manifest gains optional `host_version` range checked against `VENCORE_VERSION`. Failing the range **blocks** install/publish. |
| Semver engine | `semver` npm package as a direct dependency of `apps/api`. No new workspace package. |

## Design

### 1. Semver engine

Add `semver` to `apps/api` dependencies. New module `apps/api/src/lib/version.ts`:

- Re-exports the helpers used elsewhere: `valid`, `gt`, `satisfies`, `major`, `prerelease`, `validRange`.
- `pickLatest(tags: string[]): string | null` moves here from update-check. Now prerelease-aware: filters to valid semver **stable** versions only (prerelease tags excluded), returns highest. This lets `v0.2.0-rc.1` images ship to GHCR without triggering update notifications.
- `SUPPORTED_SDK_MAJOR` constant lives here — the SDK major version this host supports.
- `update-check.ts` drops its hand-rolled `isSemver`/`compareSemver`/`pickLatest` and imports from `version.ts`. Comparison behavior for stable versions is unchanged.

### 2. Manifest schema changes

In `manifestSchema` (`apps/api/src/routes/plugins.ts`):

- `version`: replace the regex check with a `semver.valid()` refinement — full spec compliance including prerelease identifiers.
- `sdk_version`: validate as an exact semver string; remains optional.
- New `host_version`: optional string validated with `semver.validRange()` (e.g. `">=1.2.0 <2"`, `"^1.2"`).

Mirror both fields in the `Manifest` type in `packages/plugin-types` and document them in `plugin-docs/types.mdx`.

### 3. Publish/install version gate

New helper `checkVersionRules(db, workspaceId, mf): Promise<{ error?: { code, message }, warnings: string[] }>` called in **both** install paths before `runMigrations`:

1. **Strict bump.** Fetch current `workspace_plugins.version` for `(workspace_id, plugin_id)`. If a row exists and `!semver.gt(mf.version, current)`, reject with HTTP 409:
   `{ code: 'VERSION_NOT_BUMPED', message: "Version 1.2.0 must be greater than installed 1.2.0" }`.
   Prerelease ordering follows the semver spec, so the dev chain `1.2.0-dev.1 < 1.2.0-dev.2 < 1.2.0` works naturally. Fresh installs (no existing row) skip this check.
2. **Host range block.** If `host_version` is declared and `!semver.satisfies(VENCORE_VERSION, range)`, reject with HTTP 409:
   `{ code: 'HOST_VERSION_UNSATISFIED', message: "Plugin requires host >=1.2.0 <2, this instance is 1.1.3" }`.
   Exception: the check is skipped when `VENCORE_VERSION` is the `0.0.0-dev` default or not a valid semver, so local development can always install.
3. **SDK warning.** If `sdk_version` is present and `semver.major(sdk_version) !== SUPPORTED_SDK_MAJOR`, append a human-readable warning to `warnings`. Never blocks. Missing `sdk_version` produces no warning.

Success responses from both install routes gain an optional `warnings: string[]` field alongside `data`.

### 4. Web UI

- Version-gate 409 errors surface through the existing field-error/dialog error path on the publish and install flows.
- `warnings` from a successful install render as an amber notice (existing `--amber`/`--amber-bg` tokens).
- Plugin detail view shows the installed version and, when declared, the `host_version` requirement.

### 5. Release setup

- Extend `.github/workflows/docker-publish.yml` with a step (tag pushes only) that runs `gh release create "$TAG" --generate-notes` if the release does not already exist. This fixes the updater's dead `releaseUrl` links.
- Root `package.json` gains a `"version"` field bumped at tag time. Documentation only — runtime truth remains `VENCORE_VERSION` injected from the tag at image build.
- After merge, cut `v0.1.0` as the first tag. That makes the updater live end-to-end: tag → GHCR image + GitHub Release → instance update-check sees it.

### 6. Error handling

- All rejections use the standard `{ data: null, error: { code, message } }` envelope with HTTP 409.
- Error messages always include both versions involved so the admin can act without digging.
- `checkVersionRules` runs before any side effect (file save, migration, upsert) — a rejected publish leaves no partial state.

### 7. Testing

- **Unit — `version.ts`:** `pickLatest` filters prereleases and non-semver tags; `SUPPORTED_SDK_MAJOR` sanity.
- **Unit — `checkVersionRules` matrix:** fresh install passes; equal version rejected; lower version rejected; higher version passes; prerelease chain passes in order; prerelease behind stable rejected; `host_version` satisfied/unsatisfied/absent; dev-instance skip; SDK major mismatch warns; missing `sdk_version` silent.
- **Route tests:** both install paths return 409 with the right code on violation; `warnings` propagate on success. Follows the existing `apps/api/src/__tests__/update-check.test.ts` pattern.
- **update-check regression:** existing tests keep passing after the refactor onto `semver`.

## Out of Scope

- Plugin-to-plugin dependencies and resolution ordering
- Changesets or npm publishing for workspace packages
- `sdk_version` as a range (stays exact)
- Making `sdk_version` mandatory
- Auto-bumping versions from commit history (release-please)
