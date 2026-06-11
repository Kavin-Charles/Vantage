import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { generateCompose } from './compose-generator';
import { writeEnvFile } from './env-writer';
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
  features: { crm: boolean; infra: boolean; alerts: boolean; analytics: boolean };
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
