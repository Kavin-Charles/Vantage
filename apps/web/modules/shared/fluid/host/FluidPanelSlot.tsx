'use client';
import { GlassCard } from '@/modules/shared/fluid/ui';
import { PluginPanelSlot } from '@/modules/shared/components/PluginPanelSlot';

// Renders plugin-contributed record panels (e.g. record_type "contact") inside Fluid
// glass chrome. Reuses the existing plugin panel host so plugin iframes/bridge are unchanged.
export function FluidPanelSlot({ recordType, recordId }: { recordType: string; recordId: string }) {
  return (
    <GlassCard>
      <PluginPanelSlot recordType={recordType} recordId={recordId} />
    </GlassCard>
  );
}
