# Setup Wizard Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add installer-only API routes (test-db, test-smtp, server-ip, domain check, deploy SSE) to `apps/api`, plus support libraries (compose generator, env writer, Caddy generator, Docker socket client, deploy job store) and the `curl | bash` bootstrap script.

**Pre-requisite:** Plan 1 (`2026-06-06-setup-wizard-ui.md`) must be complete — this plan wires up the backend behind the buttons that Plan 1 created.

**Architecture:** New routes registered in `apps/api/src/index.ts` only when `INSTALLER_MODE=true`. Deploy uses an in-memory job map keyed by UUID; SSE stream connects client to live log output. Docker commands run via the Docker socket HTTP API mounted at `/var/run/docker.sock`. Files written to `/opt/vencore/` on the host via volume mount.

**Tech Stack:** Express, TypeScript, Zod, node `net` module (Docker socket), nodemailer (SMTP test), `pg` (DB test), `crypto` (UUID), vitest.

---

## File Structure

### New Files
- `apps/api/src/routes/installer.ts` — all installer endpoints behind INSTALLER_MODE guard
- `apps/api/src/lib/installer/compose-generator.ts` — build docker-compose.yml string
- `apps/api/src/lib/installer/env-writer.ts` — write .env to /opt/vencore/
- `apps/api/src/lib/installer/caddy-generator.ts` — build Caddyfile / nginx.conf string
- `apps/api/src/lib/installer/docker-client.ts` — HTTP over Unix socket to Docker daemon
- `apps/api/src/lib/installer/deploy-job.ts` — in-memory job store + deploy orchestration
- `apps/api/src/__tests__/installer/compose-generator.test.ts`
- `apps/api/src/__tests__/installer/env-writer.test.ts`
- `apps/api/src/__tests__/installer/caddy-generator.test.ts`
- `scripts/install.sh` — curl | bash bootstrap script

### Modified Files
- `apps/api/src/index.ts` — register installer router when `INSTALLER_MODE=true`

---

## Task 1: `compose-generator.ts`

**Files:**
- Create: `apps/api/src/lib/installer/compose-generator.ts`
- Create: `apps/api/src/__tests__/installer/compose-generator.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/__tests__/installer/compose-generator.test.ts
import { describe, it, expect } from 'vitest';
import { generateCompose } from '../../lib/installer/compose-generator';
import type { ComposeOptions } from '../../lib/installer/compose-generator';

const base: ComposeOptions = {
  mode: 'docker-deploy',
  dataDir: '/opt/vencore/data',
  postgresVersion: '16',
  redisVersion: '7',
  appPort: 3000,
  apiPort: 3001,
};

describe('generateCompose', () => {
  it('docker-deploy: includes postgres and redis services', () => {
    const yml = generateCompose(base);
    expect(yml).toContain('postgres:');
    expect(yml).toContain('redis:');
    expect(yml).toContain('postgres:16');
    expect(yml).toContain('redis:7');
  });

  it('docker-deploy: mounts data dir for postgres', () => {
    const yml = generateCompose(base);
    expect(yml).toContain('/opt/vencore/data/postgres');
  });

  it('own-creds: does not include postgres or redis services', () => {
    const yml = generateCompose({ ...base, mode: 'own-creds' });
    expect(yml).not.toContain('image: postgres');
    expect(yml).not.toContain('image: redis');
  });

  it('includes vencore-app and vencore-api services', () => {
    const yml = generateCompose(base);
    expect(yml).toContain('vencore-app:');
    expect(yml).toContain('vencore-api:');
  });

  it('exposes correct ports', () => {
    const yml = generateCompose(base);
    expect(yml).toContain('3000:3000');
    expect(yml).toContain('3001:3001');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
cd Vencore/apps/api && npx vitest run src/__tests__/installer/compose-generator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `compose-generator.ts`**

```typescript
// apps/api/src/lib/installer/compose-generator.ts

export type ComposeOptions = {
  mode: 'docker-deploy' | 'own-creds';
  dataDir: string;
  postgresVersion: string;
  redisVersion: string;
  appPort: number;
  apiPort: number;
};

export function generateCompose(opts: ComposeOptions): string {
  const { mode, dataDir, postgresVersion, redisVersion, appPort, apiPort } = opts;

  const dbService = mode === 'docker-deploy' ? `
  vencore-db:
    image: postgres:${postgresVersion}-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: vencore
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: vencore
    volumes:
      - ${dataDir}/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vencore"]
      interval: 10s
      retries: 5
` : '';

  const redisService = mode === 'docker-deploy' ? `
  vencore-redis:
    image: redis:${redisVersion}-alpine
    restart: unless-stopped
    volumes:
      - ${dataDir}/redis:/data
    command: redis-server --appendonly yes
` : '';

  const dbDepends = mode === 'docker-deploy' ? `
    depends_on:
      vencore-db:
        condition: service_healthy` : '';

  return `version: '3.9'

services:
  vencore-app:
    image: vencore/web:latest
    restart: unless-stopped
    ports:
      - "${appPort}:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://vencore-api:3001
      NEXT_PUBLIC_APP_URL: \${APP_URL}
    env_file: .env
    depends_on:
      - vencore-api

  vencore-api:
    image: vencore/api:latest
    restart: unless-stopped
    ports:
      - "${apiPort}:3001"
    environment:
      DATABASE_URL: \${DATABASE_URL}
      REDIS_URL: \${REDIS_URL}
    env_file: .env
    volumes:
      - ${dataDir}/uploads:/app/uploads${dbDepends}
${dbService}${redisService}
networks:
  default:
    name: vencore-network
`;
}
```

- [ ] **Step 4: Run — expect PASS**

```
cd Vencore/apps/api && npx vitest run src/__tests__/installer/compose-generator.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd Vencore && git add apps/api/src/lib/installer/compose-generator.ts apps/api/src/__tests__/installer/compose-generator.test.ts
git commit -m "feat(installer): add compose-generator for docker-compose.yml output"
```

---

## Task 2: `env-writer.ts`

**Files:**
- Create: `apps/api/src/lib/installer/env-writer.ts`
- Create: `apps/api/src/__tests__/installer/env-writer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/__tests__/installer/env-writer.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildEnvString } from '../../lib/installer/env-writer';
import type { EnvOptions } from '../../lib/installer/env-writer';

const base: EnvOptions = {
  appName: 'Acme CRM',
  appUrl: 'https://app.acme.com',
  jwtSecret: 'test-jwt-secret-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  databaseUrl: 'postgresql://vencore:pass@localhost:5432/vencore',
  redisUrl: 'redis://localhost:6379',
  nodeEnv: 'production',
};

describe('buildEnvString', () => {
  it('includes DATABASE_URL', () => {
    expect(buildEnvString(base)).toContain('DATABASE_URL=postgresql://vencore:pass@localhost:5432/vencore');
  });

  it('includes JWT_SECRET', () => {
    expect(buildEnvString(base)).toContain(`JWT_SECRET=${base.jwtSecret}`);
  });

  it('includes NODE_ENV', () => {
    expect(buildEnvString(base)).toContain('NODE_ENV=production');
  });

  it('includes APP_URL', () => {
    expect(buildEnvString(base)).toContain('APP_URL=https://app.acme.com');
  });

  it('omits REDIS_URL line when redisUrl is empty', () => {
    const s = buildEnvString({ ...base, redisUrl: '' });
    expect(s).not.toContain('REDIS_URL=');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
cd Vencore/apps/api && npx vitest run src/__tests__/installer/env-writer.test.ts
```

Expected: FAIL

- [ ] **Step 3: Create `env-writer.ts`**

```typescript
// apps/api/src/lib/installer/env-writer.ts
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export type EnvOptions = {
  appName: string;
  appUrl: string;
  jwtSecret: string;
  databaseUrl: string;
  redisUrl: string;
  nodeEnv: 'production' | 'development';
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFrom?: string;
  smtpSecure?: boolean;
  sshEncryptionKey?: string;
  cronSecret?: string;
};

export function buildEnvString(opts: EnvOptions): string {
  const lines: string[] = [
    `NODE_ENV=${opts.nodeEnv}`,
    `APP_URL=${opts.appUrl}`,
    `DATABASE_URL=${opts.databaseUrl}`,
    `JWT_SECRET=${opts.jwtSecret}`,
    `CRON_SECRET=${opts.cronSecret ?? crypto.randomBytes(32).toString('hex')}`,
    `SSH_ENCRYPTION_KEY=${opts.sshEncryptionKey ?? crypto.randomBytes(32).toString('hex')}`,
  ];

  if (opts.redisUrl) lines.push(`REDIS_URL=${opts.redisUrl}`);

  if (opts.smtpHost) {
    lines.push(
      `SMTP_HOST=${opts.smtpHost}`,
      `SMTP_PORT=${opts.smtpPort ?? 587}`,
      `SMTP_USER=${opts.smtpUser ?? ''}`,
      `SMTP_PASSWORD=${opts.smtpPassword ?? ''}`,
      `SMTP_FROM=${opts.smtpFrom ?? ''}`,
      `SMTP_SECURE=${opts.smtpSecure ? 'true' : 'false'}`,
    );
  }

  return lines.join('\n') + '\n';
}

export function writeEnvFile(opts: EnvOptions, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  const envPath = path.join(destDir, '.env');
  fs.writeFileSync(envPath, buildEnvString(opts), 'utf-8');
}
```

- [ ] **Step 4: Run — expect PASS**

```
cd Vencore/apps/api && npx vitest run src/__tests__/installer/env-writer.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd Vencore && git add apps/api/src/lib/installer/env-writer.ts apps/api/src/__tests__/installer/env-writer.test.ts
git commit -m "feat(installer): add env-writer to generate and write .env file"
```

---

## Task 3: `caddy-generator.ts`

**Files:**
- Create: `apps/api/src/lib/installer/caddy-generator.ts`
- Create: `apps/api/src/__tests__/installer/caddy-generator.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/__tests__/installer/caddy-generator.test.ts
import { describe, it, expect } from 'vitest';
import { generateCaddyfile, generateNginxConf } from '../../lib/installer/caddy-generator';

describe('generateCaddyfile', () => {
  it('includes domain', () => {
    const cfg = generateCaddyfile({ domain: 'app.acme.com', appPort: 3000, apiPort: 3001, sslEmail: 'admin@acme.com' });
    expect(cfg).toContain('app.acme.com');
  });

  it('includes reverse_proxy to app and api', () => {
    const cfg = generateCaddyfile({ domain: 'app.acme.com', appPort: 3000, apiPort: 3001, sslEmail: 'admin@acme.com' });
    expect(cfg).toContain('reverse_proxy');
    expect(cfg).toContain(':3000');
    expect(cfg).toContain('/api/*');
  });

  it('includes email for ACME', () => {
    const cfg = generateCaddyfile({ domain: 'app.acme.com', appPort: 3000, apiPort: 3001, sslEmail: 'admin@acme.com' });
    expect(cfg).toContain('admin@acme.com');
  });
});

describe('generateNginxConf', () => {
  it('includes server_name', () => {
    const cfg = generateNginxConf({ domain: 'app.acme.com', appPort: 3000, apiPort: 3001 });
    expect(cfg).toContain('server_name app.acme.com');
  });

  it('proxies /api to apiPort', () => {
    const cfg = generateNginxConf({ domain: 'app.acme.com', appPort: 3000, apiPort: 3001 });
    expect(cfg).toContain('proxy_pass http://localhost:3001');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
cd Vencore/apps/api && npx vitest run src/__tests__/installer/caddy-generator.test.ts
```

Expected: FAIL

- [ ] **Step 3: Create `caddy-generator.ts`**

```typescript
// apps/api/src/lib/installer/caddy-generator.ts

type CaddyOpts = { domain: string; appPort: number; apiPort: number; sslEmail: string };
type NginxOpts = { domain: string; appPort: number; apiPort: number };

export function generateCaddyfile(opts: CaddyOpts): string {
  const { domain, appPort, apiPort, sslEmail } = opts;
  return `{
  email ${sslEmail}
}

${domain} {
  handle /api/* {
    reverse_proxy localhost:${apiPort}
  }
  handle {
    reverse_proxy localhost:${appPort}
  }
}
`;
}

export function generateNginxConf(opts: NginxOpts): string {
  const { domain, appPort, apiPort } = opts;
  return `server {
    listen 80;
    server_name ${domain};

    location /api/ {
        proxy_pass http://localhost:${apiPort};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://localhost:${appPort};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
`;
}
```

- [ ] **Step 4: Run — expect PASS**

```
cd Vencore/apps/api && npx vitest run src/__tests__/installer/caddy-generator.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd Vencore && git add apps/api/src/lib/installer/caddy-generator.ts apps/api/src/__tests__/installer/caddy-generator.test.ts
git commit -m "feat(installer): add Caddyfile and nginx.conf generators"
```

---

## Task 4: `docker-client.ts`

**Files:**
- Create: `apps/api/src/lib/installer/docker-client.ts`

No unit test for this one — it wraps the Docker socket directly. Tested via integration in deploy-job.

- [ ] **Step 1: Create `docker-client.ts`**

```typescript
// apps/api/src/lib/installer/docker-client.ts
import * as http from 'http';

type DockerRequestOptions = {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
};

function dockerRequest(opts: DockerRequestOptions): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const reqOpts: http.RequestOptions = {
      socketPath: '/var/run/docker.sock',
      method: opts.method,
      path: opts.path,
      headers: {
        'Content-Type': 'application/json',
        'Host': 'localhost',
      },
    };

    const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
    if (bodyStr) {
      reqOpts.headers!['Content-Length'] = Buffer.byteLength(bodyStr).toString();
    }

    const req = http.request(reqOpts, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

export async function dockerPull(image: string, onLog: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const reqOpts: http.RequestOptions = {
      socketPath: '/var/run/docker.sock',
      method: 'POST',
      path: `/images/create?fromImage=${encodeURIComponent(image)}`,
      headers: { 'Host': 'localhost' },
    };

    const req = http.request(reqOpts, res => {
      let buf = '';
      res.on('data', (chunk: Buffer) => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line) as { status?: string; progress?: string; error?: string };
            if (obj.error) { reject(new Error(obj.error)); return; }
            if (obj.status) onLog(`  ${obj.status}${obj.progress ? ` ${obj.progress}` : ''}`);
          } catch { /* partial JSON */ }
        }
      });
      res.on('end', resolve);
    });

    req.on('error', reject);
    req.end();
  });
}

export async function dockerComposeUp(composeFile: string, onLog: (line: string) => void): Promise<void> {
  const { spawn } = await import('child_process');
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', ['compose', '-f', composeFile, 'up', '-d', '--remove-orphans'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (d: Buffer) => d.toString().split('\n').filter(Boolean).forEach(onLog));
    proc.stderr.on('data', (d: Buffer) => d.toString().split('\n').filter(Boolean).forEach(onLog));

    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`docker compose up exited with code ${code}`));
    });
  });
}

export async function getServerIp(): Promise<string> {
  try {
    const { networkInterfaces } = await import('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      if (name === 'lo' || name.startsWith('docker') || name.startsWith('br-')) continue;
      for (const net of nets[name] ?? []) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  } catch { /* fall through */ }
  return '127.0.0.1';
}
```

- [ ] **Step 2: Commit**

```bash
cd Vencore && git add apps/api/src/lib/installer/docker-client.ts
git commit -m "feat(installer): add Docker socket client (pull, compose up, server IP)"
```

---

## Task 5: `deploy-job.ts`

**Files:**
- Create: `apps/api/src/lib/installer/deploy-job.ts`

- [ ] **Step 1: Create `deploy-job.ts`**

```typescript
// apps/api/src/lib/installer/deploy-job.ts
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { generateCompose } from './compose-generator';
import { writeEnvFile, buildEnvString } from './env-writer';
import { generateCaddyfile, generateNginxConf } from './caddy-generator';
import { dockerPull, dockerComposeUp } from './docker-client';

export type DeployPayload = {
  branding: { name: string; logoUrl: string; primaryColor: string; tagline: string };
  infra: {
    mode: 'docker-deploy' | 'own-creds';
    db: { host: string; port: string; name: string; user: string; password: string; ssl: boolean };
    redis: { host: string; port: string; password: string };
    dataDir: string;
    postgresVersion: string;
    redisVersion: string;
  };
  domain: { domain: string; sslEnabled: boolean; sslEmail: string; proxyType: 'caddy' | 'nginx' };
  smtp: { host: string; port: number; user: string; password: string; from: string; secure: boolean } | null;
  features: { crm: boolean; infra: boolean; alerts: boolean; analytics: boolean; files: boolean };
  admin: { name: string; email: string; password: string };
  skipped: string[];
};

export type JobStatus = 'running' | 'done' | 'error';

export type Job = {
  id: string;
  status: JobStatus;
  logs: string[];
  subscribers: Set<(line: string, type: 'log' | 'done' | 'error') => void>;
};

const jobs = new Map<string, Job>();

export function createJob(): Job {
  const id = crypto.randomUUID();
  const job: Job = { id, status: 'running', logs: [], subscribers: new Set() };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

function emit(job: Job, line: string, type: 'log' | 'done' | 'error' = 'log') {
  if (type === 'log') job.logs.push(line);
  job.subscribers.forEach(fn => fn(line, type));
}

const DEST_DIR = process.env['VENCORE_DEST_DIR'] ?? '/opt/vencore';

export async function runDeploy(job: Job, payload: DeployPayload): Promise<void> {
  const log = (line: string) => emit(job, line);

  try {
    log('▶ Writing configuration files…');

    const dbUrl = payload.infra.mode === 'docker-deploy'
      ? `postgresql://vencore:\${POSTGRES_PASSWORD}@vencore-db:5432/vencore`
      : `postgresql://${payload.infra.db.user}:${payload.infra.db.password}@${payload.infra.db.host}:${payload.infra.db.port}/${payload.infra.db.name}${payload.infra.db.ssl ? '?ssl=true' : ''}`;

    const redisUrl = payload.skipped.includes('redis') || (!payload.infra.redis.host)
      ? ''
      : `redis://${payload.infra.redis.password ? `:${payload.infra.redis.password}@` : ''}${payload.infra.redis.host}:${payload.infra.redis.port}`;

    const appUrl = payload.domain.domain
      ? `http${payload.domain.sslEnabled ? 's' : ''}://${payload.domain.domain}`
      : 'http://localhost:3000';

    writeEnvFile({
      appName: payload.branding.name,
      appUrl,
      jwtSecret: crypto.randomBytes(64).toString('hex'),
      databaseUrl: dbUrl,
      redisUrl,
      nodeEnv: 'production',
      smtpHost: payload.smtp?.host,
      smtpPort: payload.smtp?.port,
      smtpUser: payload.smtp?.user,
      smtpPassword: payload.smtp?.password,
      smtpFrom: payload.smtp?.from,
      smtpSecure: payload.smtp?.secure,
    }, DEST_DIR);

    log('  ✓ .env written');

    const composeYml = generateCompose({
      mode: payload.infra.mode,
      dataDir: payload.infra.dataDir,
      postgresVersion: payload.infra.postgresVersion,
      redisVersion: payload.infra.redisVersion,
      appPort: 3000,
      apiPort: 3001,
    });

    fs.mkdirSync(DEST_DIR, { recursive: true });
    fs.writeFileSync(path.join(DEST_DIR, 'docker-compose.yml'), composeYml, 'utf-8');
    log('  ✓ docker-compose.yml written');

    if (!payload.skipped.includes('domain') && payload.domain.domain) {
      const proxyConf = payload.domain.proxyType === 'caddy'
        ? generateCaddyfile({ domain: payload.domain.domain, appPort: 3000, apiPort: 3001, sslEmail: payload.domain.sslEmail })
        : generateNginxConf({ domain: payload.domain.domain, appPort: 3000, apiPort: 3001 });
      const filename = payload.domain.proxyType === 'caddy' ? 'Caddyfile' : 'nginx.conf';
      fs.writeFileSync(path.join(DEST_DIR, filename), proxyConf, 'utf-8');
      log(`  ✓ ${filename} written`);
    }

    log('▶ Pulling Docker images…');
    await dockerPull('vencore/web:latest', log);
    await dockerPull('vencore/api:latest', log);
    if (payload.infra.mode === 'docker-deploy') {
      await dockerPull(`postgres:${payload.infra.postgresVersion}-alpine`, log);
      await dockerPull(`redis:${payload.infra.redisVersion}-alpine`, log);
    }
    log('  ✓ Images pulled');

    log('▶ Starting containers…');
    await dockerComposeUp(path.join(DEST_DIR, 'docker-compose.yml'), log);
    log('  ✓ Containers started');

    log('▶ Running database migrations…');
    // Migrations run automatically on API container startup via startup script.
    // Wait for API health check before declaring done.
    await waitForHealth(appUrl, log);

    job.status = 'done';
    emit(job, '', 'done');
  } catch (err) {
    job.status = 'error';
    const msg = err instanceof Error ? err.message : String(err);
    log(`✗ ${msg}`);
    emit(job, msg, 'error');
  }
}

async function waitForHealth(appUrl: string, log: (l: string) => void): Promise<void> {
  const apiUrl = appUrl.replace(':3000', ':3001');
  const maxAttempts = 24;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const res = await fetch(`${apiUrl}/api/setup/status`);
      if (res.ok) { log('  ✓ API healthy'); return; }
    } catch { /* not ready yet */ }
    log(`  … waiting for API (attempt ${i + 1}/${maxAttempts})`);
  }
  throw new Error('API did not become healthy after 2 minutes');
}
```

- [ ] **Step 2: Commit**

```bash
cd Vencore && git add apps/api/src/lib/installer/deploy-job.ts
git commit -m "feat(installer): add deploy-job orchestrator (write files, pull images, start containers)"
```

---

## Task 6: Installer routes — test-db, test-smtp, server-ip, check-domain, deploy

**Files:**
- Create: `apps/api/src/routes/installer.ts`

- [ ] **Step 1: Create `installer.ts`**

```typescript
// apps/api/src/routes/installer.ts
import { Router } from 'express';
import { z } from 'zod';
import { getServerIp } from '../lib/installer/docker-client';
import { createJob, getJob, runDeploy } from '../lib/installer/deploy-job';
import type { DeployPayload } from '../lib/installer/deploy-job';

const testDbSchema = z.object({
  host: z.string(),
  port: z.number(),
  name: z.string(),
  user: z.string(),
  password: z.string(),
  ssl: z.boolean().default(false),
});

const testSmtpSchema = z.object({
  smtp: z.object({
    host: z.string(),
    port: z.number(),
    user: z.string(),
    password: z.string(),
    from: z.string(),
    secure: z.boolean(),
  }),
  to: z.string().email(),
});

const checkDomainSchema = z.object({
  domain: z.string(),
  ssl: z.boolean().default(false),
});

export function createInstallerRouter(): Router {
  const router = Router();

  router.get('/server-ip', async (_req, res) => {
    const ip = await getServerIp();
    res.json({ data: { ip }, error: null });
  });

  router.post('/test-db', async (req, res) => {
    const parsed = testDbSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
      return;
    }

    const { host, port, name, user, password, ssl } = parsed.data;
    try {
      const { Client } = await import('pg');
      const client = new Client({
        host, port, database: name, user, password,
        ssl: ssl ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 5000,
      });
      await client.connect();
      await client.end();
      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      res.json({ data: null, error: { code: 'DB_CONNECT_FAILED', message: (err as Error).message } });
    }
  });

  router.post('/test-smtp', async (req, res) => {
    const parsed = testSmtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
      return;
    }

    const { smtp, to } = parsed.data;
    try {
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
      });
      await transport.sendMail({
        from: smtp.from,
        to,
        subject: 'Vencore SMTP Test',
        text: 'This is a test email from your Vencore setup wizard.',
      });
      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      res.json({ data: null, error: { code: 'SMTP_FAILED', message: (err as Error).message } });
    }
  });

  router.post('/check-domain', async (req, res) => {
    const parsed = checkDomainSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
      return;
    }

    const { domain, ssl } = parsed.data;
    let dnsOk = false;
    let sslOk = false;

    try {
      const { promises: dns } = await import('dns');
      const serverIp = await getServerIp();
      const records = await dns.resolve4(domain);
      dnsOk = records.includes(serverIp);
    } catch { /* DNS not resolved yet */ }

    if (ssl && dnsOk) {
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);
        const r = await fetch(`https://${domain}`, { signal: controller.signal });
        sslOk = r.ok || r.status < 500;
      } catch { /* SSL not ready yet */ }
    }

    res.json({ data: { dns: dnsOk, ssl: sslOk }, error: null });
  });

  router.post('/deploy', async (req, res) => {
    const job = createJob();

    // Start deploy async — do not await
    runDeploy(job, req.body as DeployPayload).catch(() => {});

    res.json({ data: { jobId: job.id }, error: null });
  });

  router.get('/deploy/:jobId/stream', (req, res) => {
    const job = getJob(req.params['jobId']);
    if (!job) {
      res.status(404).json({ data: null, error: { code: 'JOB_NOT_FOUND' } });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (line: string, type: 'log' | 'done' | 'error') => {
      res.write(`data: ${JSON.stringify({ type, line })}\n\n`);
    };

    // Replay buffered logs for reconnecting clients
    job.logs.forEach(line => send(line, 'log'));

    if (job.status === 'done') { send('', 'done'); res.end(); return; }
    if (job.status === 'error') { send(job.logs.at(-1) ?? '', 'error'); res.end(); return; }

    job.subscribers.add(send);
    req.on('close', () => job.subscribers.delete(send));
  });

  return router;
}
```

- [ ] **Step 2: Commit**

```bash
cd Vencore && git add apps/api/src/routes/installer.ts
git commit -m "feat(installer): add installer API routes (test-db, test-smtp, server-ip, deploy SSE)"
```

---

## Task 7: Register installer routes in `apps/api/src/index.ts`

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Read the route registration block in index.ts**

Read `apps/api/src/index.ts` lines around 200-215 (the `app.use` calls).

- [ ] **Step 2: Add installer router import and registration**

Find the line:
```typescript
app.use('/api/setup', createSetupRouter(db));
```

Add immediately after it:
```typescript
if (process.env['INSTALLER_MODE'] === 'true') {
  const { createInstallerRouter } = await import('./routes/installer');
  app.use('/api/installer', createInstallerRouter());
}
```

Because `index.ts` likely uses top-level imports (not dynamic), add the import at the top instead:

At the top import block, add:
```typescript
import { createInstallerRouter } from './routes/installer';
```

Then in the route registration section, after `app.use('/api/setup', createSetupRouter(db));`:
```typescript
if (process.env['INSTALLER_MODE'] === 'true') {
  app.use('/api/installer', createInstallerRouter());
}
```

- [ ] **Step 3: Add `pg` and `nodemailer` as dependencies if missing**

```bash
cd Vencore/apps/api && npm list pg nodemailer 2>/dev/null | grep -E 'pg|nodemailer' || npm add pg nodemailer
npm add -D @types/pg @types/nodemailer
```

- [ ] **Step 4: Type-check**

```bash
cd Vencore/apps/api && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd Vencore && git add apps/api/src/index.ts apps/api/package.json
git commit -m "feat(installer): register installer routes when INSTALLER_MODE=true"
```

---

## Task 8: Run all backend tests

- [ ] **Step 1: Run vitest**

```bash
cd Vencore/apps/api && npx vitest run
```

Expected: all PASS (compose-generator, env-writer, caddy-generator).

- [ ] **Step 2: Fix any failures before continuing**

---

## Task 9: `install.sh` bootstrap script

**Files:**
- Create: `scripts/install.sh`

- [ ] **Step 1: Create `scripts/install.sh`**

```bash
#!/usr/bin/env bash
# Vencore installer bootstrap
# Usage: curl -fsSL https://get.vencore.in | bash

set -euo pipefail

INSTALLER_IMAGE="${VENCORE_INSTALLER_IMAGE:-vencore/installer:latest}"
INSTALLER_PORT="${VENCORE_PORT:-3000}"
DEST_DIR="${VENCORE_DEST_DIR:-/opt/vencore}"
CONTAINER_NAME="vencore-installer"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { echo -e "${BLUE}▶${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
err()   { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# Check OS
if [[ "$(uname -s)" != "Linux" ]]; then
  err "This installer supports Linux only. For other platforms, see https://vencore.in/docs/install"
fi

# Check Docker
if ! command -v docker &>/dev/null; then
  log "Docker not found — installing via get.docker.com..."
  curl -fsSL https://get.docker.com | sh
  ok "Docker installed"
else
  ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
fi

# Check Docker daemon running
if ! docker info &>/dev/null; then
  log "Starting Docker daemon..."
  sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null || true
  sleep 3
  docker info &>/dev/null || err "Docker daemon not running. Start it manually and re-run this script."
fi

# Remove existing installer container if present
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  log "Removing existing installer container..."
  docker rm -f "${CONTAINER_NAME}"
fi

# Create dest dir
mkdir -p "${DEST_DIR}"

# Get server IP for display
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

log "Pulling ${INSTALLER_IMAGE}..."
docker pull "${INSTALLER_IMAGE}"
ok "Image pulled"

log "Starting Vencore installer..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "${INSTALLER_PORT}:3000" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "${DEST_DIR}:${DEST_DIR}" \
  -e INSTALLER_MODE=true \
  -e VENCORE_DEST_DIR="${DEST_DIR}" \
  "${INSTALLER_IMAGE}"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Vencore installer is running!${NC}"
echo ""
echo -e "  Open your browser and go to:"
echo -e "  ${BLUE}http://${SERVER_IP}:${INSTALLER_PORT}/setup${NC}"
echo ""
echo -e "  After setup is complete, remove this container:"
echo -e "  docker rm -f ${CONTAINER_NAME}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
```

- [ ] **Step 2: Make executable and commit**

```bash
chmod +x Vencore/scripts/install.sh
cd Vencore && git add scripts/install.sh
git commit -m "feat(installer): add curl | bash bootstrap script (install.sh)"
```

---

## Task 10: End-to-end smoke test

- [ ] **Step 1: Set INSTALLER_MODE and start API**

```bash
cd Vencore/apps/api && INSTALLER_MODE=true npm run dev
```

- [ ] **Step 2: Test server-ip endpoint**

```bash
curl http://localhost:3001/api/installer/server-ip
```

Expected: `{"data":{"ip":"<your-ip>"},"error":null}`

- [ ] **Step 3: Test compose generator endpoint via test-db (verifies route registered)**

```bash
curl -X POST http://localhost:3001/api/installer/test-db \
  -H 'Content-Type: application/json' \
  -d '{"host":"localhost","port":5432,"name":"vencore","user":"vencore","password":"test","ssl":false}'
```

Expected: `{"data":null,"error":{"code":"DB_CONNECT_FAILED","message":"..."}}` (connection refused is fine — means route works)

- [ ] **Step 4: Without INSTALLER_MODE, routes should 404**

```bash
cd Vencore/apps/api && npm run dev &
curl http://localhost:3001/api/installer/server-ip
```

Expected: 404 (route not registered)

- [ ] **Step 5: Final commit**

```bash
cd Vencore && git add -A
git commit -m "feat(installer): white-label setup wizard backend complete (Plan 2)"
```
