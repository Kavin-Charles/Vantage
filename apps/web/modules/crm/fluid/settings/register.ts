import { registerSettingsEntry } from '@/modules/shared/fluid/settings-registry';
import { CrmPreferencesPanel } from './CrmPreferencesPanel';

// No CRM permission key in packages/modules/src/crm/index.ts covers general
// workspace CRM preferences (default pipeline / page size / columns) — the
// closest entries (`pipelines:config`, etc.) are scoped to pipeline
// configuration specifically, not this panel's broader scope. Rather than
// inventing a permission string that doesn't exist in the RBAC catalog, this
// entry relies solely on `adminOnly: true` (the registry's workspace-admin
// gate) and omits `permission`.
registerSettingsEntry({
  id: 'crm-preferences',
  scope: 'workspace',
  label: 'CRM',
  icon: 'contacts',
  adminOnly: true,
  component: CrmPreferencesPanel,
});
