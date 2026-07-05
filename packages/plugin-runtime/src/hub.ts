/**
 * Data hub — host-owned store for cross-plugin data sharing.
 *
 * Providers publish contract-shaped records; consumers query them without
 * knowing which plugin produced them. All access is workspace-scoped and
 * gated by hub:read:<contract> / hub:write:<contract> data_access grants.
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { PluginManifest } from '@vencore/plugin-types';
import { bridgeRegistry } from './bridge-registry';
import type { BridgeContext } from './bridge-router';
import { pluginEventBus } from './bus';
import { getContract, validateRecords, isKnownContract } from './contracts';

export const HUB_LIMITS = {
  maxBatchSize: 500,
  maxRecordBytes: 64 * 1024,
  maxQueryLimit: 100,
  /** Sliding-window publish rate limit per (plugin, workspace). */
  publishCallsPerMinute: 60,
} as const;

// ── Permission matching ───────────────────────────────────────────────────────
// Grants support exact ids and prefix wildcards:
//   hub:read:crm.contact@v1   exact
//   hub:read:crm.*            any contract under the crm namespace
//   hub:read:*                any contract

export function hasHubPermission(
  dataAccess: readonly string[],
  action: 'read' | 'write',
  contractId: string,
): boolean {
  const namespace = contractId.split('.')[0] ?? '';
  return dataAccess.some((g) =>
    g === `hub:${action}:${contractId}` ||
    g === `hub:${action}:${namespace}.*` ||
    g === `hub:${action}:*`,
  );
}

// ── Publish rate limiting (in-memory, per API process) ───────────────────────

const publishWindows = new Map<string, number[]>();

function checkPublishRate(key: string): boolean {
  const now = Date.now();
  const cutoff = now - 60_000;
  const window = (publishWindows.get(key) ?? []).filter((t) => t > cutoff);
  if (window.length >= HUB_LIMITS.publishCallsPerMinute) {
    publishWindows.set(key, window);
    return false;
  }
  window.push(now);
  publishWindows.set(key, window);
  return true;
}

// ── Workspace feature toggle ──────────────────────────────────────────────────

async function isHubEnabled(db: Kysely<any>, workspaceId: string): Promise<boolean> {
  const row = await db.selectFrom('workspaces')
    .select('plugin_data_sharing')
    .where('id', '=', workspaceId)
    .executeTakeFirst() as { plugin_data_sharing: boolean } | undefined;
  return row?.plugin_data_sharing ?? true;
}

function manifestProvides(ctx: BridgeContext, contractId: string): boolean {
  const provides = ctx.manifest?.provides ?? [];
  return provides.some((p) => p.contract === contractId);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function guard(
  db: Kysely<any>,
  ctx: BridgeContext,
  action: 'read' | 'write',
  contractId: unknown,
): Promise<{ code: string; message: string } | null> {
  if (typeof contractId !== 'string' || contractId.length === 0) {
    return { code: 'INVALID_REQUEST', message: 'contract is required' };
  }
  if (!isKnownContract(contractId)) {
    return { code: 'UNKNOWN_CONTRACT', message: `Unknown contract '${contractId}'` };
  }
  if (!hasHubPermission(ctx.dataAccess, action, contractId)) {
    return {
      code: 'FORBIDDEN',
      message: `Requires data_access permission 'hub:${action}:${contractId}'`,
    };
  }
  if (!(await isHubEnabled(db, ctx.workspaceId))) {
    return { code: 'FEATURE_DISABLED', message: 'Plugin data sharing is disabled for this workspace' };
  }
  return null;
}

export function registerHubBridgeMethods(): void {
  bridgeRegistry
    .register('hub.publish', null, async (ctx, p, db) => {
      const contractId = p['contract'];
      const err = await guard(db, ctx, 'write', contractId);
      if (err) throw err;
      const contract = contractId as string;

      if (!manifestProvides(ctx, contract)) {
        throw {
          code: 'NOT_A_PROVIDER',
          message: `Plugin does not declare '${contract}' in manifest provides[]`,
        };
      }

      const records = p['records'];
      if (!Array.isArray(records) || records.length === 0) {
        throw { code: 'INVALID_REQUEST', message: 'records must be a non-empty array' };
      }
      if (records.length > HUB_LIMITS.maxBatchSize) {
        throw {
          code: 'LIMIT_EXCEEDED',
          message: `Batch size ${records.length} exceeds limit of ${HUB_LIMITS.maxBatchSize}`,
        };
      }
      if (!checkPublishRate(`${ctx.pluginSlug}:${ctx.workspaceId}`)) {
        throw {
          code: 'LIMIT_EXCEEDED',
          message: `Publish rate limit exceeded (${HUB_LIMITS.publishCallsPerMinute} calls/min)`,
        };
      }

      const { violations } = validateRecords(contract, records);
      if (violations.length > 0) {
        throw {
          code: 'CONTRACT_VIOLATION',
          message: `${violations.length} violation(s): ` +
            violations.slice(0, 5).map((v) => `[${v.index}] ${v.path}: ${v.message}`).join('; '),
        };
      }

      for (const r of records) {
        if (Buffer.byteLength(JSON.stringify(r), 'utf8') > HUB_LIMITS.maxRecordBytes) {
          throw {
            code: 'LIMIT_EXCEEDED',
            message: `A record exceeds the ${HUB_LIMITS.maxRecordBytes / 1024} KB size limit`,
          };
        }
      }

      const now = new Date();
      const externalIds: string[] = [];
      for (const r of records as Array<Record<string, unknown>>) {
        const externalId = String(r['external_id']);
        externalIds.push(externalId);
        const jsonb = sql`${JSON.stringify(r)}::jsonb`;
        await db.insertInto('plugin_hub_records')
          .values({
            workspace_id: ctx.workspaceId,
            contract,
            provider_plugin_id: ctx.pluginSlug,
            external_id: externalId,
            data: jsonb,
            updated_at: now,
          })
          .onConflict((oc: any) =>
            oc.columns(['workspace_id', 'contract', 'provider_plugin_id', 'external_id'])
              .doUpdateSet({ data: jsonb, updated_at: now }),
          )
          .execute();
      }

      await pluginEventBus.forWorkspace(ctx.workspaceId).emit(`hub:${contract}:changed`, {
        provider: ctx.pluginSlug,
        contract,
        count: records.length,
        external_ids: externalIds.slice(0, 100),
      });

      return { published: records.length };
    })
    .register('hub.query', null, async (ctx, p, db) => {
      const contractId = p['contract'];
      const err = await guard(db, ctx, 'read', contractId);
      if (err) throw err;
      const contract = contractId as string;

      const limit = Math.min(
        typeof p['limit'] === 'number' && p['limit'] > 0 ? p['limit'] : HUB_LIMITS.maxQueryLimit,
        HUB_LIMITS.maxQueryLimit,
      );

      let q = db.selectFrom('plugin_hub_records')
        .select(['provider_plugin_id', 'external_id', 'data', 'updated_at', 'id'])
        .where('workspace_id', '=', ctx.workspaceId)
        .where('contract', '=', contract)
        .orderBy('updated_at', 'desc')
        .orderBy('id', 'desc')
        .limit(limit + 1);

      if (typeof p['provider'] === 'string' && p['provider'].length > 0) {
        q = q.where('provider_plugin_id', '=', p['provider']);
      }

      const filter = p['filter'];
      if (filter && typeof filter === 'object' && !Array.isArray(filter)) {
        for (const [key, value] of Object.entries(filter as Record<string, unknown>)) {
          if (!/^[a-z][a-z0-9_]*$/.test(key)) {
            throw { code: 'INVALID_REQUEST', message: `Invalid filter key '${key}'` };
          }
          q = q.where(sql`data->>${sql.lit(key)}`, '=', String(value));
        }
      }

      const cursor = p['cursor'];
      if (typeof cursor === 'string' && cursor.length > 0) {
        const [ts, id] = cursor.split('|');
        if (ts && id) {
          q = q.where((eb: any) => eb.or([
            eb('updated_at', '<', new Date(ts)),
            eb.and([eb('updated_at', '=', new Date(ts)), eb('id', '<', id)]),
          ]));
        }
      }

      const rows = await q.execute() as Array<{
        provider_plugin_id: string; external_id: string; data: unknown; updated_at: Date; id: string;
      }>;

      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      const hasMore = rows.length > limit;

      return {
        records: page.map((r) => ({
          provider: r.provider_plugin_id,
          external_id: r.external_id,
          data: r.data,
          updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
        })),
        next_cursor: hasMore && last
          ? `${last.updated_at instanceof Date ? last.updated_at.toISOString() : String(last.updated_at)}|${last.id}`
          : null,
      };
    })
    .register('hub.providers', null, async (ctx, p, db) => {
      const contractId = p['contract'];
      const err = await guard(db, ctx, 'read', contractId);
      if (err) throw err;
      const contract = contractId as string;

      const plugins = await db.selectFrom('workspace_plugins')
        .select(['plugin_id', 'name', 'manifest'])
        .where('workspace_id', '=', ctx.workspaceId)
        .where('enabled', '=', true)
        .execute() as Array<{ plugin_id: string; name: string; manifest: unknown }>;

      const providers = plugins.filter((pl) => {
        const mf = pl.manifest as PluginManifest;
        return (mf.provides ?? []).some((pr) => pr.contract === contract);
      });

      const stats = await db.selectFrom('plugin_hub_records')
        .select(['provider_plugin_id'])
        .select((eb: any) => eb.fn.count('id').as('record_count'))
        .select((eb: any) => eb.fn.max('updated_at').as('last_published_at'))
        .where('workspace_id', '=', ctx.workspaceId)
        .where('contract', '=', contract)
        .groupBy('provider_plugin_id')
        .execute() as Array<{ provider_plugin_id: string; record_count: unknown; last_published_at: Date | null }>;

      const statMap = new Map(stats.map((s) => [s.provider_plugin_id, s]));

      return providers.map((pl) => {
        const s = statMap.get(pl.plugin_id);
        return {
          plugin_id: pl.plugin_id,
          name: pl.name,
          record_count: s ? Number(s.record_count) : 0,
          last_published_at: s?.last_published_at
            ? (s.last_published_at instanceof Date ? s.last_published_at.toISOString() : String(s.last_published_at))
            : null,
        };
      });
    })
    .register('hub.delete', null, async (ctx, p, db) => {
      const contractId = p['contract'];
      const err = await guard(db, ctx, 'write', contractId);
      if (err) throw err;
      const contract = contractId as string;

      const externalIds = p['external_ids'];
      if (!Array.isArray(externalIds) || externalIds.length === 0) {
        throw { code: 'INVALID_REQUEST', message: 'external_ids must be a non-empty array' };
      }

      // Providers can only delete their own records
      const result = await db.deleteFrom('plugin_hub_records')
        .where('workspace_id', '=', ctx.workspaceId)
        .where('contract', '=', contract)
        .where('provider_plugin_id', '=', ctx.pluginSlug)
        .where('external_id', 'in', externalIds.map(String))
        .executeTakeFirst();

      const deleted = Number(result?.numDeletedRows ?? 0);
      if (deleted > 0) {
        await pluginEventBus.forWorkspace(ctx.workspaceId).emit(`hub:${contract}:changed`, {
          provider: ctx.pluginSlug,
          contract,
          deleted,
          external_ids: externalIds.slice(0, 100),
        });
      }
      return { deleted };
    })
    .register('hub.contracts', null, async (_ctx, _p, _db) => {
      const { listContracts } = await import('./contracts');
      return listContracts().map((c) => ({ id: c.id, label: c.label, description: c.description }));
    });
}

/**
 * Deletes all hub records published by a plugin in a workspace and emits
 * provider_removed for each affected contract. Called on plugin uninstall
 * and disable.
 */
export async function removeProviderHubData(
  db: Kysely<any>,
  workspaceId: string,
  pluginId: string,
): Promise<void> {
  const affected = await db.selectFrom('plugin_hub_records')
    .select('contract')
    .distinct()
    .where('workspace_id', '=', workspaceId)
    .where('provider_plugin_id', '=', pluginId)
    .execute() as Array<{ contract: string }>;

  await db.deleteFrom('plugin_hub_records')
    .where('workspace_id', '=', workspaceId)
    .where('provider_plugin_id', '=', pluginId)
    .execute();

  for (const { contract } of affected) {
    await pluginEventBus.forWorkspace(workspaceId).emit(`hub:${contract}:provider_removed`, {
      provider: pluginId,
      contract,
    });
  }
}
