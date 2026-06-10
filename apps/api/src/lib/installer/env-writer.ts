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
