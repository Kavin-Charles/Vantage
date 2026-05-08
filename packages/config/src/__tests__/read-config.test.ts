import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('readConfig', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vantage-config-'));
    configPath = path.join(tmpDir, 'vantage.config.json');
    process.env['CONFIG_PATH'] = configPath;
    // Clear singleton between tests - import fresh module each time
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
    const { readConfig, _resetConfig } = await import('../read-config');
    _resetConfig();
    const cfg = readConfig();
    expect(cfg.app.name).toBe('TestCo');
    expect(cfg.features.crm).toBe(true);
  });

  it('throws on missing required field', async () => {
    fs.writeFileSync(configPath, JSON.stringify({ app: {} }));
    const { readConfig, _resetConfig } = await import('../read-config');
    _resetConfig();
    expect(() => readConfig()).toThrow();
  });

  it('throws if config file missing', async () => {
    const { readConfig, _resetConfig } = await import('../read-config');
    _resetConfig();
    process.env['CONFIG_PATH'] = '/nonexistent/path.json';
    expect(() => readConfig()).toThrow();
  });
});
