# Handoff — Execute Plan 2 (Fluid CRM)

You are taking over a multi-session refactor. Your job: **execute Plan 2 (CRM)** using
`superpowers:subagent-driven-development`, in `caveman` ultra mode. Read this whole file first.

## What this is
Redesigning the Vencore web app to the "Vencore Fluid" design language (glassmorphism, bento,
Space Grotesk + Inter, blue-primary, Material Symbols), scoped to the **CRM + Settings** modules.
Split into 3 plans: Foundation → **CRM (you)** → Settings.

- Worktree/repo root: `/home/kavin/Projects/Vencore/.claude/worktrees/refactor-crm-redesign-94d91e`
- Branch: `claude/refactor-crm-redesign-94d91e` (NEVER commit to main)
- Author rule: sole author **Kavin-Charles**, NEVER add AI/Claude/Anthropic attribution to any commit.

## Plan + specs (read the plan; skim specs as needed)
- **Plan to execute:** `docs/superpowers/plans/2026-07-22-fluid-crm.md` (16 tasks)
- Spec: `docs/superpowers/specs/2026-07-22-fluid-crm-design.md`
- Foundation (done) plan/spec: `docs/superpowers/plans/2026-07-22-fluid-foundation.md`, `...specs/...-foundation-design.md`
- Settings (next): `...-fluid-settings.md`

## State of the branch
- **Foundation (Plan 1) is DONE** — committed `5c7ce5d..8744e54` (11 commits: tokens, primitives,
  nav+RBAC filter, shell sidebar/topbar, FluidShell, `(fluid)` route group, host seams). All
  per-task reviewed clean; final review clean after 1 fix (`8744e54` nav dedup).
- **Foundation verified live in the browser** this session (light + dark) — it works.
- **UNCOMMITTED work you must handle first (git status):**
  - `apps/web/modules/shared/fluid/shell/FluidShell.tsx` (M) — a real bug fix made this session:
    FluidShell now wraps children in `ModuleProvider` + `ServerMetricsProvider` + `ToastProvider`
    (these live in `(dashboard)/layout.tsx`, NOT the root layout, so the Fluid shell crashed with
    "useModules must be used inside ModuleProvider" until fixed). **Commit this first** as
    `fix(fluid): provide module/metrics/toast providers in FluidShell`.
  - `packages/db/src/schema.ts` (M) + `packages/db/migrations/20260722_001_contacts_fluid_fields.ts`
    (untracked) — this is CRM Plan **Task 1** already partially on disk (contacts title/social_links/
    avatar_url). Verify it matches the plan's Task 1, then commit it as Task 1 (or fold into your
    Task 1 run). The migration has ALREADY been applied to the local DB.
  - `docs/superpowers/**` specs + plans (untracked) — commit once as `docs: fluid redesign specs + plans`.
- Progress ledger: `.superpowers/sdd/progress.md` — read it; Foundation tasks + deferred minors are listed.

## Local full stack is UP (use it to visually verify screens)
- Postgres `vencore-db-1` (:5432, vencore/vencore/vencore) and Redis `vencore-redis-1` (:6379) — healthy.
- **API** running background (`apps/api` `pnpm dev`, port **3001**) — auto-seeded.
- **Web** running via preview (`pnpm --filter @vencore/web dev`, port **3000**).
- **Login:** `admin@localhost` / `admin123`.
- Env files (all gitignored — do NOT commit): `.env`, `apps/api/.env`, `apps/web/.env.local`, `vencore.config.json`.
- Workspace package dists are built (api-client/config/db/modules/types/plugin-types/plugin-runtime).
  If a package import fails, rebuild it: `pnpm --filter @vencore/<pkg> build`.
- If the servers are down: web via `preview_start name:"web"` (`.claude/launch.json` exists);
  API via `cd apps/api && pnpm dev` (run in background). `db:migrate` reads `apps/api/.env`.

## CRITICAL gotchas discovered this session
1. **Route-conflict landmine:** `app/(dashboard)/[slug]/page.tsx` is a catch-all that grabs EVERY
   one-segment top-level path. So `(fluid)/crm/page.tsx` (`/crm`, one segment) collides with it,
   AND any one-segment probe route does too. Two-segment paths (`/crm/contacts`) are safe. Also:
   Next.js errors if the SAME path exists in both `(fluid)` and `(dashboard)` — so when you add a
   `(fluid)/crm/<seg>` page you MUST delete the old `(dashboard)/crm/<seg>` in the SAME commit
   (Plan Task 8 note). Decide how to handle the `/crm` hub vs `[slug]` (e.g. keep hub redirect but
   verify it resolves, or route hub differently).
2. **To view a Fluid page in-browser:** log in first, use a 2-segment URL. `/_probe` did NOT work
   (caught by `[slug]`); a temp `(fluid)/dev/probe` (2-seg) did. The temp probe route was removed.
3. **Plan Tasks 4 & 6 contain scaffold `expect(true).toBe(true)` markers** — the plan explicitly
   says REPLACE them with real assertions mirroring existing tests. Never leave them; reviewers
   treat asserts-nothing as a defect.
4. **`usePermission`/`<RequirePermission>` helper does NOT exist** (Foundation spec §4 promised it,
   plan dropped it). CRM screens gate via `useAuth().hasPermission('crm.*')` inline — that's fine.
   If you want a shared guard, add it, else keep inline. Not blocking.
5. Foundation deferred minors (in ledger, non-blocking): hardcoded green/dark/focus colors (token
   hygiene), `FluidModal` a11y (role/aria/Escape/focus-trap — fix before real modals, e.g. Add-Contact),
   plugin nav not RBAC-gated (needs `PluginNavItem` schema field), `HookFeatureCard` unused `moduleId`.

## How to run SDD (same as Foundation)
Skill scripts dir:
`/home/kavin/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills/subagent-driven-development/scripts`
- Per task: `task-brief <PLAN> <N>` → writes `.superpowers/sdd/task-N-brief.md`; dispatch a **fresh**
  general-purpose implementer with model per complexity (**haiku** for verbatim-transcription tasks,
  **sonnet** for backend/DB/integration tasks that reconcile real signatures). Dispatch has: 1 line on
  fit, the brief path ("read first, exact values verbatim"), interfaces from earlier tasks, your
  resolution of any ambiguity, and the report path `.superpowers/sdd/task-N-report.md`.
- After implementer DONE: `review-package <BASE> <HEAD>` (BASE = commit before this task, from
  ledger — never HEAD~1), dispatch a fresh **sonnet** task-reviewer with brief + report + diff paths +
  the plan's Global Constraints verbatim. Fix Critical/Important via one fix subagent; re-review.
- Record each clean task in `.superpowers/sdd/progress.md`. Continuous execution — don't stop to
  check in between tasks.
- **Subagent file-access caveat:** subagents were sometimes DECLINED reading/writing under
  `.superpowers/`. If that recurs, the controller writes the report file and reviews inline, or you
  retry. It was intermittent, not consistent.
- End: final whole-branch review (`review-package $(git merge-base main HEAD) HEAD`, most capable
  model), triage minors, then `superpowers:finishing-a-development-branch`.

## CRM plan specifics (already decided — in plan Global Constraints)
- Do NOT change `contacts.status` enum; Active/Lead/Dormant are DERIVED views.
- Deal priority DERIVED from probability (no migration): urgent≥80/high≥60/medium≥30/else low.
- Company detail page DEFERRED (HTML has list only). Keep single `contacts.name` (UI splits first/last).
- New APIs: contacts fields + last-activity + derived-view filters; companies status/annual_revenue/
  size-band; `GET /api/contacts/:id/overview` aggregate; declare CRM **analytics hook-feature**.
- Backend tests use a hand-rolled Kysely mock (see `apps/api/src/__tests__/contacts.test.ts`) — no
  live DB needed for `vitest run`. Verify screens against redesign HTML in the zip / `_design`.
- After the plan: run graphify update (`/graphify . --update`, user-invoked) per CLAUDE.md.

## First actions for you
1. Read this file + the CRM plan + the ledger.
2. Commit the 3 uncommitted buckets above (FluidShell fix; CRM Task 1 migration/schema; docs).
   Reconcile the on-disk Task 1 against plan Task 1 so the ledger BASE is a clean commit.
3. Start SDD at the first not-yet-done CRM task (Task 1 may already be on disk — verify, don't redo).
4. Use the running stack to eyeball each screen after its task.
