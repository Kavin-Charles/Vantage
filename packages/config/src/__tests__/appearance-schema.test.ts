import { describe, it, expect } from 'vitest';
import { configSchema } from '../config-schema';

describe('appearance config', () => {
  it('defaults appearance when absent and maps legacy primaryColor', () => {
    const parsed = configSchema.parse({
      app: { name: 'Acme', primaryColor: '#2d6a4f' },
      features: {},
    });
    expect(parsed.app.appearance.accentColor).toBe('#2d6a4f'); // legacy fallback
    expect(parsed.app.appearance.radius).toBe('rounded');
    expect(parsed.app.appearance.density).toBe('comfortable');
    expect(parsed.app.appearance.sidebarStyle).toBe('light');
    expect(parsed.app.appearance.login).toEqual({ background: null, backgroundImage: null });
  });

  it('uses default accent when no primaryColor', () => {
    const parsed = configSchema.parse({ app: { name: 'Acme' }, features: {} });
    expect(parsed.app.appearance.accentColor).toBe('#0b1330');
  });
});
