import { describe, it, expect } from 'vitest';
import { buildEnvString } from '../../lib/installer/env-writer';
import type { EnvOptions } from '../../lib/installer/env-writer';

const base: EnvOptions = {
  appName: 'Acme CRM',
  appUrl: 'https://app.acme.com',
  jwtSecret: 'test-jwt-secret-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  databaseUrl: 'postgresql://vencore:pass@localhost:5432/vencore',
  redisUrl: 'redis://localhost:6379',
  nodeEnv: 'production',
};

describe('buildEnvString', () => {
  it('includes DATABASE_URL', () => {
    expect(buildEnvString(base)).toContain('DATABASE_URL=postgresql://vencore:pass@localhost:5432/vencore');
  });

  it('includes JWT_SECRET', () => {
    expect(buildEnvString(base)).toContain(`JWT_SECRET=${base.jwtSecret}`);
  });

  it('includes NODE_ENV', () => {
    expect(buildEnvString(base)).toContain('NODE_ENV=production');
  });

  it('includes APP_URL', () => {
    expect(buildEnvString(base)).toContain('APP_URL=https://app.acme.com');
  });

  it('omits REDIS_URL line when redisUrl is empty', () => {
    const s = buildEnvString({ ...base, redisUrl: '' });
    expect(s).not.toContain('REDIS_URL=');
  });
});
