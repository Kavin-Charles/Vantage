// packages/config/src/read-config.ts
import * as fs from 'fs';
import * as path from 'path';
import { configSchema, type VantageConfig } from './config-schema';

let cached: VantageConfig | null = null;

const SAFE_DEFAULTS: VantageConfig = {
  app: { name: 'Vencore', logoUrl: '/logo.png', domain: undefined },
  features: { crm: true, infra: true, alerts: true, analytics: false, files: false },
  smtp: null,
  databases: [],
};

export function readConfig(): VantageConfig {
  if (cached) return cached;

  const configPath =
    process.env['CONFIG_PATH'] ??
    path.resolve(process.cwd(), 'vencore.config.json');

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    console.warn(
      `[Vencore] Config file not found at ${configPath}. Using defaults. Run setup wizard or set CONFIG_PATH.`
    );
    cached = SAFE_DEFAULTS;
    return cached;
  }

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`[Vencore] Invalid vencore.config.json: ${result.error.message}`);
  }

  cached = result.data;
  return cached;
}

/** Reset singleton — for tests only */
export function _resetConfig(): void {
  cached = null;
}
