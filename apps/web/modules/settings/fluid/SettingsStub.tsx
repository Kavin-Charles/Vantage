import { GlassCard } from '@/modules/shared/fluid/ui';

/**
 * Minimal placeholder panel for settings entries whose real UI lands in
 * later tasks. Registered by ./register.ts purely so the scope nav has a
 * route to point at; replace each usage as its dedicated panel ships.
 */
export function SettingsStub() {
  return (
    <GlassCard>
      <p style={{ fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>Coming soon.</p>
    </GlassCard>
  );
}
