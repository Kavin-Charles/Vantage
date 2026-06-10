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
