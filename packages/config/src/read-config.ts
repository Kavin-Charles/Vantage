import * as fs from 'fs';
import * as path from 'path';
import { configSchema, type VantageConfig } from './config-schema';

let cached: VantageConfig | null = null;

export function readConfig(): VantageConfig {
  if (cached) return cached;

  const configPath =
    process.env['CONFIG_PATH'] ??
    path.resolve(process.cwd(), '../../vencore.config.json');

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    throw new Error(
      `[Vantage] Cannot read config file at ${configPath}: ${String(err)}`
    );
  }

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `[Vantage] Invalid vantage.config.json: ${result.error.message}`
    );
  }

  cached = result.data;
  return cached;
}

/** Reset singleton — for tests only */
export function _resetConfig(): void {
  cached = null;
}
