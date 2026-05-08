import { z } from 'zod';

export const dbSeedSchema = z.object({
  name: z.string(),
  engine: z.enum(['postgres', 'mysql', 'redis', 'clickhouse', 'mongo', 'other']),
  host: z.string(),
  port: z.number(),
  db_user: z.string(),
  db_password: z.string(),
  database_name: z.string(),
  use_ssl: z.boolean().default(false),
});

export const smtpSchema = z.object({
  host: z.string(),
  port: z.number(),
  secure: z.boolean().default(false),
  user: z.string(),
  password: z.string(),
  from: z.string(),
});

export const configSchema = z.object({
  app: z.object({
    name: z.string(),
    logoUrl: z.string().default('/logo.png'),
    domain: z.string().optional(),
  }),
  features: z.object({
    crm: z.boolean().default(true),
    infra: z.boolean().default(true),
    alerts: z.boolean().default(true),
    analytics: z.boolean().default(false),
    files: z.boolean().default(false),
  }),
  smtp: smtpSchema.nullable().optional(),
  databases: z.array(dbSeedSchema).default([]),
});

export type VantageConfig = z.infer<typeof configSchema>;
export type DbSeedConfig = z.infer<typeof dbSeedSchema>;
export type SmtpConfig = z.infer<typeof smtpSchema>;
