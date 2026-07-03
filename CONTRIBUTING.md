# Contributing to Vencore

Thanks for looking at this. Contributions are welcome — bug fixes, new features, documentation improvements, anything that makes the project more useful.

A few things upfront: PRs without a linked issue may still get merged if the change is small and obviously correct, but for anything substantial it's worth opening an issue first. Saves everyone time if the direction doesn't fit.

---

## Getting the project running

You'll need Node.js ≥ 20, pnpm ≥ 9, and Docker.

```bash
git clone https://github.com/your-org/vencore.git
cd vencore
pnpm install

# Start Postgres + Redis
docker compose up -d

# Copy and configure env files
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local
cp vencore.config.example.json vencore.config.json

# Set a JWT secret in apps/api/.env:
# JWT_SECRET=$(openssl rand -hex 32)

# Run migrations and start everything
pnpm db:migrate
pnpm dev
```

The web app is at [localhost:3000](http://localhost:3000). On first boot the API prints the admin credentials to its console output.

Each app can also be started individually from its own directory with `pnpm dev`.

---

## Project layout

```
apps/
  web/      Next.js 14 dashboard — pages live in app/(dashboard)/
  api/      Express REST API — one file per resource in src/routes/
  worker/   Background jobs — website pings, alert evaluation, DB health

packages/
  db/       Kysely client and generated types
  types/    Shared TypeScript types
  config/   Config file loader (vencore.config.json)
```

Most feature work touches `apps/api/src/routes/` (data + validation) and `apps/web/app/(dashboard)/` (UI) together. The shared types in `packages/types/` are what connect them.

---

## Contribution Rules

To help keep reviews efficient and maintain the quality of the project, please follow these rules before opening a pull request:

* **Open an issue before opening a pull request.** This allows maintainers and contributors to discuss the proposed change, confirm that it aligns with the project's direction, and avoid duplicate work. Small fixes such as typo corrections or obvious bug fixes may be exempt from this requirement.

* **Include screenshots or recordings for UI changes.** If your pull request affects the user interface, attach before-and-after screenshots (or a short screen recording when appropriate) so reviewers can easily understand and verify the changes.

* **Keep pull requests focused.** A pull request should address a single feature, fix, or improvement. Large PRs that combine unrelated changes are harder to review and may be asked to be split.

* **Update documentation when necessary.** If your change modifies behavior, configuration, workflows, or introduces new functionality, update the relevant documentation as part of the same pull request.

---

## Making changes

**Branches:** work off a feature branch, not main.

**Commits:** conventional commit style preferred — `feat:`, `fix:`, `chore:`, `docs:`. Keep them focused; one logical change per commit.

**TypeScript:** strict mode is on across all packages. No `any`. If you're fighting the type system on something legitimate, add a comment explaining why.

**API conventions:**
- Input validation with Zod before any DB query
- All responses follow `{ data: ..., error: null }` or `{ data: null, error: { code, message } }`
- Every query must be scoped to `workspace_id` — the `requireAuth` middleware attaches `req.workspace` and `req.user`
- New DB tables need a migration file in `apps/api/src/migrations/` — never modify existing migration files

**UI conventions:**
- Match the design system in `vencore-full.html` (project root). The design tokens (`--bg`, `--surface`, `--border`, etc.) are defined in the root layout CSS.
- Inline styles are used throughout — this is intentional, not an oversight.
- Data fetching via TanStack Query; mutations should invalidate the relevant query key on success.

---

## Adding a new resource

The pattern is consistent across the codebase. For a new resource `widgets`:

1. **Migration** — add `apps/api/src/migrations/NNN_create_widgets.sql`
2. **Types** — add `Widget` to `packages/types/src/index.ts`
3. **DB package** — add the table type to `packages/db/src/schema.ts`
4. **API route** — create `apps/api/src/routes/widgets.ts`, register it in `apps/api/src/index.ts`
5. **Frontend lib** — create `apps/web/lib/widgets.ts` with typed fetch helpers
6. **Page** — create `apps/web/app/(dashboard)/widgets/page.tsx`

Look at `apps/api/src/routes/contacts.ts` and `apps/web/app/(dashboard)/contacts/` as a reference — contacts are the simplest full resource in the codebase.

---

## Adding a new alert type

Alert evaluation lives in `apps/worker/src/jobs/alert-eval.ts`. It runs every 60 seconds. The pattern:

1. Query the relevant data
2. Check the threshold condition
3. Use the `consecutiveCounts` map for 2-ping deduplication (don't alert on a single bad reading)
4. Call the shared `fireAlert` / `resolveAlert` helpers

---

## Running checks

```bash
pnpm type-check   # TypeScript across all packages
pnpm lint         # ESLint
```

There's no test suite yet — contributions there are very welcome (see open issues).

---

## Pull requests

- Link the issue the PR addresses
- Describe what changed and why, not just what
- Keep PRs focused — a PR that does three things takes three times as long to review
- If you're adding a new dependency, explain why the existing stack can't handle it

PRs are reviewed within a few days. If it's been a week with no response, ping on the issue thread.

---

## What we're not taking on (yet)

- Full VM management (start/stop/provision servers)
- Built-in SQL query editor
- Mobile app
- AI features

If you want to discuss something outside this scope, open an issue and make the case — nothing is permanently off the table.
