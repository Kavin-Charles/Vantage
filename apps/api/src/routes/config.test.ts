import { describe, it, expect } from 'vitest';
import type { VencoreConfig } from '@vencore/config';
import { applyAppearancePatch } from './config';

function makeConfig(): VencoreConfig {
  return {
    app: {
      name: 'Acme',
      logoUrl: '/logo.png',
      domain: 'acme.example.com',
      faviconUrl: '/favicon.ico',
      tagline: 'Run your business',
      primaryColor: '#0b1330',
      appearance: {
        accentColor: '#0b1330',
        preset: 'default',
        radius: 'rounded',
        density: 'comfortable',
        sidebarStyle: 'light',
        login: { background: null, backgroundImage: null },
      },
    },
    features: {
      crm: true,
      infra: true,
      alerts: true,
      analytics: false,
      files: false,
    },
    smtp: null,
    databases: [],
  };
}

describe('applyAppearancePatch', () => {
  it('patches only accentColor while keeping other appearance fields', () => {
    const current = makeConfig();
    const { appearance } = applyAppearancePatch(current, { accentColor: '#ff0000' });

    expect(appearance.accentColor).toBe('#ff0000');
    expect(appearance.preset).toBe('default');
    expect(appearance.radius).toBe('rounded');
    expect(appearance.density).toBe('comfortable');
    expect(appearance.sidebarStyle).toBe('light');
  });

  it('rejects an invalid enum value', () => {
    const current = makeConfig();
    expect(() =>
      applyAppearancePatch(current, { radius: 'triangle' as unknown as 'rounded' }),
    ).toThrow();
  });

  it('preserves app.name and other non-appearance fields on the returned config', () => {
    const current = makeConfig();
    const { config: nextConfig } = applyAppearancePatch(current, { accentColor: '#00ff00' });

    expect(nextConfig.app.name).toBe('Acme');
    expect(nextConfig.app.logoUrl).toBe('/logo.png');
    expect(nextConfig.app.domain).toBe('acme.example.com');
    expect(nextConfig.features).toEqual(current.features);
    expect(nextConfig.app.appearance.accentColor).toBe('#00ff00');
  });
});
