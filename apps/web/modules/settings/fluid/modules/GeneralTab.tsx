'use client';

import { useInstalledPlugins } from '@/modules/shared/hooks/useInstalledPlugins';
import { useModules } from '@/modules/shared/contexts/modules';
import { getSettingsEntryById } from '@/modules/shared/fluid/settings-registry';
import { PluginSettingsSections } from '@/modules/settings/components/PluginSettingsSections';
import { GlassCard, FluidBadge, EmptyState } from '@/modules/shared/fluid/ui';
import { FIRST_PARTY_MODULES } from './moduleMeta';

/**
 * First-party moduleId → id of a settings-registry entry with a dedicated
 * panel. Modules not listed here fall back to the minimal GlassCard below.
 * 'crm' maps to the CrmPreferencesPanel registered by
 * apps/web/modules/crm/fluid/settings/register.ts as 'crm-preferences'.
 */
const MODULE_SETTINGS_ENTRY: Record<string, string> = {
  crm: 'crm-preferences',
};

interface Props {
  moduleId: string;
}

/**
 * General tab of a module/plugin's Fluid settings page.
 *  - Installed PLUGIN (moduleId matches an InstalledPlugin.id) → schema-driven
 *    PluginSettingsSections scoped to that plugin.
 *  - First-party module with a registered settings panel (see
 *    MODULE_SETTINGS_ENTRY) → render that panel.
 *  - Otherwise → a minimal fallback card with name/description/enabled state.
 */
export function GeneralTab({ moduleId }: Props) {
  const { data: plugins, isLoading } = useInstalledPlugins();
  const { isEnabled } = useModules();

  if (isLoading) {
    return <EmptyState icon="hourglass_empty" title="Loading…" />;
  }

  const plugin = plugins?.find(p => p.id === moduleId);
  if (plugin) {
    return <PluginSettingsSections pluginId={plugin.plugin_id} />;
  }

  const entryId = MODULE_SETTINGS_ENTRY[moduleId];
  const entry = entryId ? getSettingsEntryById(entryId) : undefined;
  if (entry) {
    const Component = entry.component;
    return <Component />;
  }

  const meta = FIRST_PARTY_MODULES.find(m => m.id === moduleId);
  return (
    <GlassCard>
      <p style={{ margin: 0, fontFamily: 'var(--fl-font-display)', fontWeight: 600, fontSize: 18 }}>
        {meta?.name ?? moduleId}
      </p>
      <p style={{ margin: '8px 0 16px', fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>
        {meta?.description ?? 'No dedicated settings for this module yet.'}
      </p>
      <FluidBadge tone={isEnabled(moduleId) ? 'green' : 'neutral'}>
        {isEnabled(moduleId) ? 'Enabled' : 'Disabled'}
      </FluidBadge>
    </GlassCard>
  );
}
