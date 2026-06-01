import type { PluginPermission, PluginError } from '@vantage/plugin-types';

/** Maps bridge method → required PluginPermission. null = exempt from permission check. */
const METHOD_PERMISSION_MAP: Record<string, PluginPermission | null> = {
  'contacts.list': 'contacts:read',
  'contacts.get': 'contacts:read',
  'contacts.create': 'contacts:write',
  'contacts.update': 'contacts:write',
  'contacts.delete': 'contacts:write',
  'companies.list': 'companies:read',
  'companies.get': 'companies:read',
  'companies.create': 'companies:write',
  'companies.update': 'companies:write',
  'companies.delete': 'companies:write',
  'deals.list': 'deals:read',
  'deals.get': 'deals:read',
  'deals.create': 'deals:write',
  'deals.update': 'deals:write',
  'deals.delete': 'deals:write',
  'tasks.list': 'tasks:read',
  'tasks.get': 'tasks:read',
  'tasks.create': 'tasks:write',
  'tasks.update': 'tasks:write',
  'activity.list': 'activity:read',
  'activity.create': 'activity:write',
  'servers.list': 'servers:read',
  'servers.get': 'servers:read',
  'websites.list': 'websites:read',
  'websites.get': 'websites:read',
  'storage.get': 'storage:read',
  'storage.set': 'storage:write',
  'storage.delete': 'storage:write',
  'http.fetch': 'http:fetch',
  // table.* — access controlled by declared table list, not a PluginPermission
  'table.list': null,
  'table.get': null,
  'table.insert': null,
  'table.update': null,
  'table.delete': null,
  'table.upsert': null,
  'table.count': null,
  // modal / navigate — host-side, no permission required
  'modal.open': null,
  'modal.close': null,
};

/**
 * Returns null if the permission check passes, or a PluginError if not.
 * table.* and action methods (custom verbs) are exempt from permission checks
 * here — table.* is checked by the table-client, action methods are passthrough.
 */
export function checkPermission(
  permissions: readonly PluginPermission[],
  method: string,
): PluginError | null {
  if (Object.prototype.hasOwnProperty.call(METHOD_PERMISSION_MAP, method)) {
    const required = METHOD_PERMISSION_MAP[method];
    if (required === null) return null;
    if (permissions.includes(required)) return null;
    return {
      code: 'FORBIDDEN',
      message: `Bridge method '${method}' requires permission '${required}', which is not declared in the plugin manifest.`,
    };
  }
  // Unknown method — could be a custom action (e.g. "deals.move-stage") — pass through
  return null;
}
