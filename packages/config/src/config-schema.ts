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

export const appearanceSchema = z.object({
  accentColor: z.string().default('#0b1330'),
  preset: z.string().default('default'),
  radius: z.enum(['sharp', 'rounded', 'pill']).default('rounded'),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  sidebarStyle: z.enum(['light', 'dark', 'brand']).default('light'),
  login: z.object({
    background: z.string().nullable().default(null),
    backgroundImage: z.string().nullable().default(null),
  }).default({ background: null, backgroundImage: null }),
});
export type Appearance = z.infer<typeof appearanceSchema>;

export const configSchema = z.object({
  app: z.object({
    name: z.string(),
    logoUrl: z.string().default('/logo.png'),
    domain: z.string().optional(),
    faviconUrl: z.string().optional(),
    tagline: z.string().optional(),
    primaryColor: z.string().optional(),
    appearance: appearanceSchema.optional(),
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
}).transform((cfg) => {
  const seed = cfg.app.appearance?.accentColor ?? cfg.app.primaryColor ?? '#0b1330';
  const appearance = appearanceSchema.parse({ ...cfg.app.appearance, accentColor: seed });
  return { ...cfg, app: { ...cfg.app, appearance } };
});

export type VantageConfig = z.infer<typeof configSchema>;
export type DbSeedConfig = z.infer<typeof dbSeedSchema>;
export type SmtpConfig = z.infer<typeof smtpSchema>;
