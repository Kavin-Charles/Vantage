'use client';
import { GlassCard, FluidBadge, FluidButton } from '@/modules/shared/fluid/ui';

// Mirrors the state model in modules/settings/components/HooksPage.tsx.
export type HookState = 'enabled' | 'available' | 'disabled' | 'provider_required' | 'unavailable';

export interface HookFeature {
  id: string;
  name: string;
  description: string;
  state: HookState;
  enabled: boolean;
}

const TONE: Record<HookState, 'green' | 'blue' | 'neutral' | 'gold' | 'red'> = {
  enabled: 'green', available: 'blue', disabled: 'neutral', provider_required: 'gold', unavailable: 'red',
};
const LABEL: Record<HookState, string> = {
  enabled: 'Enabled', available: 'Available', disabled: 'Disabled',
  provider_required: 'Provider Required', unavailable: 'Unavailable',
};

export function HookFeatureCard({
  feature, onToggle,
}: {
  feature: HookFeature;
  moduleId: string;
  onToggle: (next: boolean) => void;
}) {
  const canToggle = feature.state !== 'provider_required' && feature.state !== 'unavailable';
  return (
    <GlassCard>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <p style={{ margin: 0, fontFamily: 'var(--fl-font-display)', fontWeight: 600, fontSize: 16 }}>{feature.name}</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>{feature.description}</p>
        </div>
        <FluidBadge tone={TONE[feature.state]}>{LABEL[feature.state]}</FluidBadge>
      </div>
      {canToggle ? (
        <div style={{ marginTop: 16 }}>
          <FluidButton variant={feature.enabled ? 'ghost' : 'primary'} onClick={() => onToggle(!feature.enabled)}>
            {feature.enabled ? 'Disable' : 'Enable'}
          </FluidButton>
        </div>
      ) : null}
    </GlassCard>
  );
}
