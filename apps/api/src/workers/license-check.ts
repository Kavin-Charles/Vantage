// Periodically re-checks paid marketplace plugin licenses against the
// platform (/v1/licenses/check) and auto-disables plugins whose license is
// no longer usable. This is the poll fallback the platform's push design
// assumes ("the instance's daily poll will catch up").
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { logger } from '../lib/logger';
import { USABLE_LICENSE_STATUSES } from '../lib/marketplace-license';
import { disablePluginRuntime } from '../lib/plugin-disable';

const INTERVAL_MS = 30 * 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LicenseStatus = 'active' | 'grace' | 'expired' | 'revoked' | 'bound_elsewhere' | 'not_found';

interface CheckResult {
  key: string;
  valid: boolean;
  status: string;
}

export async function runLicenseCheck(
  db: Kysely<Database>,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const marketplaceUrl = process.env['MARKETPLACE_API_URL'] ?? '';
  if (!marketplaceUrl) return;
  const svcToken = process.env['MARKETPLACE_SERVICE_TOKEN'] ?? '';

  const rows = await db
    .selectFrom('workspace_plugins')
    .select(['id', 'workspace_id', 'plugin_id', 'name', 'license_key', 'enabled'])
    .where('pricing_type', '=', 'paid')
    .where('source', '=', 'marketplace')
    .where('license_key', 'is not', null)
    .execute();

  const checkable = rows.filter(r => r.license_key !== null && UUID_RE.test(r.license_key));
  if (checkable.length === 0) return;

  const byWorkspace = new Map<string, typeof checkable>();
  for (const r of checkable) {
    const list = byWorkspace.get(r.workspace_id) ?? [];
    list.push(r);
    byWorkspace.set(r.workspace_id, list);
  }

  for (const [workspaceId, plugins] of byWorkspace) {
    try {
      const res = await fetchFn(`${marketplaceUrl}/v1/licenses/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-service-token': svcToken },
        body: JSON.stringify({ instance_id: workspaceId, keys: plugins.map(p => p.license_key) }),
      });
      if (!res.ok) {
        logger.warn({ workspaceId, status: res.status }, '[license-check] platform check failed');
        continue;
      }
      const json = await (res.json() as Promise<{ data: CheckResult[] | null }>);
      const byKey = new Map((json.data ?? []).map(r => [r.key, r]));
      const now = new Date();

      for (const plugin of plugins) {
        const result = byKey.get(plugin.license_key!);
        if (!result) continue;
        const status = result.status as LicenseStatus;
        const usable = USABLE_LICENSE_STATUSES.has(status);

        if (!usable && plugin.enabled) {
          await db
            .updateTable('workspace_plugins')
            .set({ enabled: false, license_status: status, license_checked_at: now })
            .where('id', '=', plugin.id)
            .execute();
          await disablePluginRuntime(
            db, workspaceId, plugin.plugin_id, plugin.name,
            `License is ${status.replace('_', ' ')} — the plugin was disabled. Renew or update the key in Settings → Plugins.`,
          );
          logger.warn({ workspaceId, pluginId: plugin.plugin_id, status }, '[license-check] plugin auto-disabled');
        } else {
          await db
            .updateTable('workspace_plugins')
            .set({ license_status: status, license_checked_at: now })
            .where('id', '=', plugin.id)
            .execute();
        }
      }
    } catch (err) {
      logger.error({ err, workspaceId }, '[license-check] workspace check failed');
    }
  }
}

export function startLicenseCheck(db: Kysely<Database>): void {
  // Run shortly after startup, then every 30 min
  void runLicenseCheck(db).catch(err => logger.error({ err }, '[license-check] initial run failed'));
  setInterval(() => {
    void runLicenseCheck(db).catch(err => logger.error({ err }, '[license-check] run failed'));
  }, INTERVAL_MS);
  logger.info('license check worker started (30-min polling)');
}
