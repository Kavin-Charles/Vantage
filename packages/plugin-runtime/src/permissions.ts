import type { PluginPermission, PluginError } from '@vencore/plugin-types';

/** Prefix for user-facing plugin permission keys in user_permissions/group_permissions tables. */
export const PLUGIN_PERMISSION_PREFIX = 'plugin:';

/**
 * Returns namespaced key for a plugin's user-facing permission.
 * Example: pluginPermissionKey('com.vantage.calendar', 'calendar:view')
 *   → 'plugin:com.vantage.calendar:calendar:view'
 */
export function pluginPermissionKey(pluginId: string, key: string): string {
  return `${PLUGIN_PERMISSION_PREFIX}${pluginId}:${key}`;
}

/** Returns true if a permission key is a plugin permission (not a module permission). */
export function isPluginPermissionKey(key: string): boolean {
  return key.startsWith(PLUGIN_PERMISSION_PREFIX);
}

/**
 * Parses a plugin permission key into its parts.
 * 'plugin:com.vantage.calendar:calendar:view' → { pluginId: 'com.vantage.calendar', key: 'calendar:view' }
 */
export function parsePluginPermissionKey(key: string): { pluginId: string; key: string } | null {
  if (!isPluginPermissionKey(key)) return null;
  const rest = key.slice(PLUGIN_PERMISSION_PREFIX.length);
  const parts = rest.split(':');
  if (parts.length < 2) return null;
  return { pluginId: parts[0]!, key: parts.slice(1).join(':') };
}

/** Maps bridge method → required PluginPermission. null = no permission required. */
const METHOD_PERMISSION_MAP: Record<string, PluginPermission | null> = {
  'storage.get': 'storage:read',
  'storage.set': 'storage:write',
  'storage.delete': 'storage:write',
  'http.fetch': 'http:fetch',
  'table.list': null,
  'table.get': null,
  'table.insert': null,
  'table.update': null,
  'table.delete': null,
  'table.upsert': null,
  'table.count': null,
  'modal.open': null,
  'modal.close': null,
  'settings.get': null,
  'settings.set': null,
  'bus.emit': null,
  'files.upload': null,
  'files.getUrl': null,
  'files.delete': null,
  'user.get': null,
  'workspace.get': null,
  'permissions.check': null,
  'notify': null,
  'cron.register': null,
  'context.get': null,
};

export function checkPermission(
  dataAccess: readonly PluginPermission[],
  method: string,
): PluginError | null {
  if (Object.prototype.hasOwnProperty.call(METHOD_PERMISSION_MAP, method)) {
    const required = METHOD_PERMISSION_MAP[method];
    if (required === null) return null;
    if (dataAccess.includes(required)) return null;
    return {
      code: 'FORBIDDEN',
      message: `Bridge method '${method}' requires data_access permission '${required}'.`,
    };
  }
  return null;
}
