# Installer Design

**Date:** 2026-06-17  
**Status:** Approved

## Problem

The existing installer was a heavy combined Next.js + Docker CLI image (`Dockerfile.installer`) that ran its own Express API to generate `docker-compose.yml` and trigger deploys. It was tightly coupled with the setup wizard's "docker-deploy" mode. This approach was complex, hard to maintain, and created a circular dependency where Vencore was responsible for deploying itself.

## Solution

Split the concerns cleanly:

- **Infrastructure setup** → a single `install.sh` shell script (no Docker image needed)
- **App configuration** → the existing setup wizard at `/setup` (already built, already works)

The installer script handles everything at the OS level (create dirs, write config, pull images, start containers). The setup wizard handles everything at the app level (workspace name, admin account, features, SMTP).

## Components

### 1. `install.sh`

Location: `install.sh` (repo root)  
Curl-installable: `curl -fsSL https://raw.githubusercontent.com/vencorehq/Vencore/main/install.sh | bash`

**Flow:**
1. Check dependencies: `docker`, `docker compose` (v2 plugin form)
2. Create `~/vencore/` working directory
3. Write `docker-compose.yml` inline (embedded in script, no separate download)
4. Write `.env` with auto-generated secrets (`openssl rand -hex 32` for each)
5. `docker compose pull` — fetch latest images from GHCR
6. `docker compose up -d` — start all containers
7. Print success URL

**Environment variables written to `.env`:**
```
DATABASE_URL=postgresql://vencore:vencore@db:5432/vencore
REDIS_URL=redis://redis:6379
JWT_SECRET=<random 32 bytes hex>
CRON_SECRET=<random 32 bytes hex>
AGENT_SIGNING_SECRET=<random 32 bytes hex>
NODE_ENV=production
API_URL=http://api:3001
COOKIE_SECURE=false
```

`DATABASE_URL` and `REDIS_URL` use Docker internal hostnames — no user input needed. `COOKIE_SECURE=false` because no TLS on first run (HTTP on port 80).

**Note on `NEXT_PUBLIC_` env vars:** `NEXT_PUBLIC_*` variables are inlined at `next build` time — they cannot be overridden at container runtime. Therefore `NEXT_PUBLIC_API_URL` is replaced by:
- **Server components**: read `process.env['API_URL']` (runtime, works in Docker via `.env`)
- **Client components** (browser): use relative paths (e.g. `fetch('/api/setup', ...)`) — Next.js rewrites proxy these to the Express API service at build time (hardcoded `http://api:3001` in `next.config.js`)

**No interactive prompts.** All config (workspace name, admin password, SMTP) is collected by the setup wizard after install.

### 2. Docker Compose stack

File embedded in `install.sh`, also committed as `docker-compose.prod.yml` for reference.

```yaml
services:
  web:
    image: ghcr.io/vencorehq/vencore-web:latest
    ports: ["80:3000"]
    env_file: .env
    depends_on: [api]
    restart: unless-stopped

  api:
    image: ghcr.io/vencorehq/vencore-api:latest
    env_file: .env
    depends_on: [db, redis]
    restart: unless-stopped

  worker:
    image: ghcr.io/vencorehq/vencore-worker:latest
    env_file: .env
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: vencore
      POSTGRES_PASSWORD: vencore
      POSTGRES_DB: vencore
    volumes: [db_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes: [redis_data:/data]
    restart: unless-stopped

volumes:
  db_data:
  redis_data:
```

Web is the only service exposed on port 80. All others are Docker-internal.

**Next.js rewrites** (in `next.config.js`, hardcoded at build time):
```js
async rewrites() {
  return {
    afterFiles: [
      { source: '/api/:path*', destination: 'http://api:3001/api/:path*' },
    ],
  };
}
```
`afterFiles` means Next.js first checks for a matching `app/api/` route file. If one exists (e.g. `/api/setup/activate`, `/api/auth/*`, `/api/config`), Next.js handles it. If not, the request is proxied to Express. This lets browser code use relative `/api/...` paths without knowing the server IP.

### 3. GitHub Actions: Docker image publishing

File: `.github/workflows/docker-publish.yml`

Triggers:
- Push to `main` → build + push `:latest` tag
- Push of version tag `v*` → build + push `:v1.2.3` tag

Registry: `ghcr.io/vencorehq/`

Images built: `vencore-web`, `vencore-api`, `vencore-worker`

Auth: `GITHUB_TOKEN` (automatic, no secrets needed beyond enabling package write permissions).

### 4. Setup wizard simplification

The wizard's "docker-deploy" mode is removed. All wizard runs are now equivalent to the old "own-creds" mode — by the time the user reaches `/setup`, infrastructure is already running.

**Removed wizard steps:**
- `StepInfrastructure.tsx` (infra mode picker + DB/Redis connection fields)
- `StepDB.tsx`
- `StepRedis.tsx`  
- `StepDomain.tsx`
- All `infra` state in `SetupState`

**New wizard flow:**
```
branding → features → smtp (skippable) → admin → review
```

`StepReview` always calls the Express `POST /api/setup` endpoint (the `own-creds` path). The docker-deploy streaming log panel is removed.

### 5. Cleanup

Files deleted:
- `Dockerfile.installer`
- `scripts/installer-entrypoint.sh`
- `apps/api/src/routes/installer.ts`
- `apps/api/src/lib/installer/` (entire directory)

Code removed:
- `INSTALLER_MODE` env branch in `apps/web/middleware.ts`
- Installer route mount in `apps/api/src/index.ts`
- `docker-deploy` branch in `StepReview.tsx` (already done)
- All `infra` step types from `apps/web/app/setup/types.ts`

Code changed:
- `apps/web/next.config.js` — add `afterFiles` rewrite: `/api/:path*` → `http://api:3001/api/:path*`
- `apps/web/app/page.tsx` — replace `NEXT_PUBLIC_API_URL` with `API_URL` (server component, runtime-safe)
- `apps/web/app/setup/steps/StepReview.tsx` — replace `${apiBase}/api/setup` with `/api/setup` (relative, browser uses rewrite)
- Any other client components using `NEXT_PUBLIC_API_URL` — same relative path fix

## First-run user journey

```
1. SSH into server
2. curl -fsSL https://raw.githubusercontent.com/vencorehq/Vencore/main/install.sh | bash
3. ~2 min: images pull, containers start
4. Script prints: "Vencore is running at http://1.2.3.4"
5. User opens browser → page.tsx detects no workspace → redirects to /setup
6. Wizard: enter workspace name, toggle features, skip SMTP, set admin email+password
7. Click "Complete Setup" → workspace created, session cookie set
8. Redirect to /login → log in → /dashboard
```

## Out of scope

- SSL/TLS setup (user adds nginx reverse proxy post-install if needed)
- Multi-node / HA deployments
- Auto-updates (user re-runs `docker compose pull && docker compose up -d` manually)
- Windows/macOS installer (Docker Desktop handles this; script targets Linux servers)
