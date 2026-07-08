# Vencore Developer Rules

These rules are compiled from the Vencore Developer Guide (July 2026) and apply to all development work within this monorepo. All AI coding agents must adhere strictly to these conventions.

---

## 1. Core Architectural Invariant: Workspace Scoping

* **Strict Multi-Tenancy**: Every data table contains a `workspace_id` column.
* **Filter Every Query**: Every database query MUST filter by `workspace_id`. No exceptions.
* **Derivation**: The `workspace_id` must ALWAYS be derived from the authenticated JWT token (using `req.workspace.id` attached by the `requireAuth` middleware). **NEVER** accept `workspace_id` from request parameters, request bodies, or client input.

---

## 2. Database Layer & Migrations

* **Query Builder**: All database queries must use the **Kysely** query builder. No raw SQL strings without parameterization.
* **Date Columns**: Return database `DATE` columns as plain strings to prevent UTC timezone mismatch bugs.
* **Foreign Key Scoping**: When a route accepts references to other tables (e.g. linking `company_id` to a contact), you must query and validate that the referenced record belongs to the same `workspace_id` before completing the transaction.
* **Soft Deletes**: Apply soft deletes (`deleted_at: timestamp`) for core CRM tables (Contact, Company, Deal). Never hard delete CRM records.
* **Advisory Locks**: Each migration script must run with PostgreSQL advisory locks (lock ID: `74123001`) to prevent concurrent migration execution in multi-process deployments.
* **Migration Integrity**: Never modify existing migration files. Always create a new one using the naming convention: `YYYYMMDD_NNN_feature_name.ts`.

---

## 3. API & Middleware Standards

* **Response Format**: Every API endpoint must return a unified JSON shape:
  * **Success (200/201)**: `{ data: T, error: null }`
  * **Error (400/401/403/404/500)**: `{ data: null, error: { code: string, message: string } }`
* **Input Validation**: Validate all inputs at system boundaries (incoming request parameters, bodies, queries) using **Zod** schemas before executing database operations. Parse, don't validate.
* **Middleware Chain**: Order middleware correctly on routes:
  1. `requireAuth` (JWT verification and scoping setup)
  2. `requireModule(moduleName)` (Check module is enabled for workspace, cached 60s)
  3. `requirePermission(module, action)` (Check user permission, cached 60s)
* **Error Handling**: Return structured error codes (e.g. `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `MODULE_DISABLED`, `NOT_FOUND`, `INTERNAL_ERROR`). Hide specific stack traces/details from clients in production.

---

## 4. Module & Plugin Architectures

* **Module Registry**: All core modules are registered in `packages/modules/src/index.ts`. Gated routes must use the `requireModule` middleware.
* **Plugin Isolation**: Plugins run in sandboxed child processes (`fork()`). They **cannot** access the database, filesystem, or environment variables directly. All actions (storage, HTTP calls, events, database query proxies) must go through bridge calls (the `vencore` object).
* **Plugin Tables**: Plugin-owned tables are automatically prefixed as `plugin_{pluginId}_{tableName}` and scoped by `workspace_id`.

---

## 5. Frontend & Design System

* **Framework**: Next.js App Router (TypeScript, Tailwind CSS v4, React Query, Redux Toolkit).
* **Typography**: Use `Instrument Serif` for display text/names/numbers, and `DM Sans` for body and UI elements.
* **Layout Constants**: Sidebar width is `220px`. Topbar height is `56px`.
* **Design Tokens**: Do not introduce custom colors or deviate from these CSS variables:
  * Page Background: `--bg: #f7f6f2`
  * Panels/Cards: `--surface: #ffffff`
  * Hover States/Secondary: `--surface2: #f0ede6`
  * Borders: `--border: #e4e0d8`
  * Primary/Secondary Text: `--text: #1a1814` / `--text2: #6b665c`
  * Semantic Accents (Green/Amber/Red/Blue) and their respective `-bg` backgrounds.

---

## 6. Coding & Git Conventions

* **TypeScript Strictness**: Strict mode is enabled. **No `any` types allowed.**
* **Structured Logging**: Use the structured Pino logger (`logger`). Do not use `console.log` in production paths.
* **Code Comments**: Default is to write **no comments**. Only add a comment when the *WHY* behind the code is non-obvious (e.g., workarounds or hidden constraints). Avoid explaining *WHAT* the code does.
* **Naming Conventions**:
  * **Files**: kebab-case (e.g., `auth-middleware.ts`)
  * **Components**: PascalCase (e.g., `DealPipeline`)
  * **Functions/Variables**: camelCase (e.g., `resolveHook`)
  * **Database Tables & Columns**: snake_case (e.g., `workspace_id`, `pipeline_stages`)
  * **API Routes**: kebab-case (e.g., `/api/infra-databases`)
  * **Environment Variables**: SCREAMING_SNAKE (e.g., `JWT_SECRET`)
* **Git Workflow**: Never commit directly to `main`. Work on feature branches (`feat/`, `fix/`, `chore/`, `refactor/`), verify via build, and merge to `main` via PR.
