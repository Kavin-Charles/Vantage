import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('readConfig', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vantage-config-'));
    configPath = path.join(tmpDir, 'vantage.config.json');
    process.env['CONFIG_PATH'] = configPath;
    // Reset singleton before each test
    const { _resetConfig } = await import('../read-config');
    _resetConfig();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
    delete process.env['CONFIG_PATH'];
  });

  it('parses a valid config', async () => {
    const raw = {
      app: { name: 'TestCo', logoUrl: '/logo.png', domain: 'app.test.com' },
      features: { crm: true, infra: true, alerts: true, analytics: false, files: false },
      smtp: null,
      databases: [],
    };
    fs.writeFileSync(configPath, JSON.stringify(raw));
    const { readConfig } = await import('../read-config');
    const cfg = readConfig();
    expect(cfg.app.name).toBe('TestCo');
    expect(cfg.features.crm).toBe(true);
  });

  it('throws on missing required field', async () => {
    fs.writeFileSync(configPath, JSON.stringify({ app: {} }));
    const { readConfig } = await import('../read-config');
    expect(() => readConfig()).toThrow();
  });

  it('throws if config file missing', async () => {
    // Set invalid path BEFORE singleton has been touched (already reset in beforeEach)
    process.env['CONFIG_PATH'] = '/nonexistent/path.json';
    const { readConfig, _resetConfig } = await import('../read-config');
    _resetConfig(); // reset again so the new path is used
    expect(() => readConfig()).toThrow();
  });
});
