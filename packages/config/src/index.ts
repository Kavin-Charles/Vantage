import { z } from 'zod';

// Runtime config (vantage.config.json)
export { readConfig, _resetConfig } from './read-config';
export type { VantageConfig, DbSeedConfig, SmtpConfig } from './config-schema';
export { configSchema } from './config-schema';

// API env (process.env — only DB + secrets, no Clerk/Stripe)
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string(),
  CRON_SECRET: z.string(),
  SSH_ENCRYPTION_KEY: z.string().min(64, 'SSH_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)'),
  PORT: z.coerce.number().default(3001),
});

// Web env
export const webEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string(),
  NEXT_PUBLIC_API_URL: z.string(),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;
