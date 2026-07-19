/**
 * Payload builders for the platform's v1 license API.
 * A Vencore "instance" from the platform's perspective is one workspace:
 * instance_id = workspace.id, so each workspace activates its own key.
 */

export interface LicenseValidatePayload {
  plugin_id: string;
  key: string;
  instance_id: string;
  instance_name: string;
  instance_domain?: string;
}

export function buildLicenseValidatePayload(
  workspace: { id: string; name: string; domain: string | null },
  platformPluginId: string,
  key: string,
): LicenseValidatePayload {
  return {
    plugin_id: platformPluginId,
    key,
    instance_id: workspace.id,
    instance_name: workspace.name,
    ...(workspace.domain ? { instance_domain: workspace.domain } : {}),
  };
}

export interface LicenseDeactivatePayload {
  plugin_id: string;
  key: string;
  instance_id: string;
}

export function buildLicenseDeactivatePayload(
  workspaceId: string,
  platformPluginId: string,
  key: string,
): LicenseDeactivatePayload {
  return { plugin_id: platformPluginId, key, instance_id: workspaceId };
}

/** Statuses under which a paid plugin may keep running (grace warns, never disables). */
export const USABLE_LICENSE_STATUSES: ReadonlySet<string> = new Set(['active', 'grace']);
