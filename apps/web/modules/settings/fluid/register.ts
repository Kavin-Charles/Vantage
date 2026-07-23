import { registerSettingsEntry } from '@/modules/shared/fluid/settings-registry';
import { SettingsStub } from './SettingsStub';

// Personal
registerSettingsEntry({
  id: 'profile',
  scope: 'personal',
  label: 'Profile',
  icon: 'person',
  component: SettingsStub,
});

registerSettingsEntry({
  id: 'preferences',
  scope: 'personal',
  label: 'Preferences',
  icon: 'tune',
  component: SettingsStub,
});

registerSettingsEntry({
  id: 'security',
  scope: 'personal',
  label: 'Security',
  icon: 'lock',
  component: SettingsStub,
});

// Workspace (admin-gated; no RBAC permission key covers these panels
// individually, so each relies on the registry's workspace-admin gate —
// same reasoning as modules/crm/fluid/settings/register.ts)
registerSettingsEntry({
  id: 'workspace',
  scope: 'workspace',
  label: 'Workspace',
  icon: 'domain',
  adminOnly: true,
  component: SettingsStub,
});

registerSettingsEntry({
  id: 'users',
  scope: 'workspace',
  label: 'Users',
  icon: 'group',
  adminOnly: true,
  component: SettingsStub,
});

registerSettingsEntry({
  id: 'roles',
  scope: 'workspace',
  label: 'Roles',
  icon: 'admin_panel_settings',
  adminOnly: true,
  component: SettingsStub,
});

registerSettingsEntry({
  id: 'modules',
  scope: 'workspace',
  label: 'Modules',
  icon: 'widgets',
  adminOnly: true,
  component: SettingsStub,
});

registerSettingsEntry({
  id: 'plugins',
  scope: 'workspace',
  label: 'Plugins',
  icon: 'extension',
  adminOnly: true,
  component: SettingsStub,
});

registerSettingsEntry({
  id: 'api-keys',
  scope: 'workspace',
  label: 'API Keys',
  icon: 'vpn_key',
  adminOnly: true,
  component: SettingsStub,
});

registerSettingsEntry({
  id: 'updates',
  scope: 'workspace',
  label: 'Updates',
  icon: 'system_update',
  adminOnly: true,
  component: SettingsStub,
});

registerSettingsEntry({
  id: 'about',
  scope: 'workspace',
  label: 'About',
  icon: 'info',
  adminOnly: true,
  component: SettingsStub,
});
