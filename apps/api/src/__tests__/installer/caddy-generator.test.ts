import { describe, it, expect } from 'vitest';
import { generateCaddyfile, generateNginxConf } from '../../lib/installer/caddy-generator';

describe('generateCaddyfile', () => {
  it('includes domain', () => {
    const cfg = generateCaddyfile({ domain: 'app.acme.com', appPort: 3000, apiPort: 3001, sslEmail: 'admin@acme.com' });
    expect(cfg).toContain('app.acme.com');
  });

  it('includes reverse_proxy to app and api', () => {
    const cfg = generateCaddyfile({ domain: 'app.acme.com', appPort: 3000, apiPort: 3001, sslEmail: 'admin@acme.com' });
    expect(cfg).toContain('reverse_proxy');
    expect(cfg).toContain(':3000');
    expect(cfg).toContain('/api/*');
  });

  it('includes email for ACME', () => {
    const cfg = generateCaddyfile({ domain: 'app.acme.com', appPort: 3000, apiPort: 3001, sslEmail: 'admin@acme.com' });
    expect(cfg).toContain('admin@acme.com');
  });
});

describe('generateNginxConf', () => {
  it('includes server_name', () => {
    const cfg = generateNginxConf({ domain: 'app.acme.com', appPort: 3000, apiPort: 3001 });
    expect(cfg).toContain('server_name app.acme.com');
  });

  it('proxies /api to apiPort', () => {
    const cfg = generateNginxConf({ domain: 'app.acme.com', appPort: 3000, apiPort: 3001 });
    expect(cfg).toContain('proxy_pass http://localhost:3001');
  });
});
