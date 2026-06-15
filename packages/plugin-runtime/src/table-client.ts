import type { Kysely } from 'kysely';
import type { BridgeResult } from '@vencore/plugin-types';
import type { BridgeContext } from './bridge-router';

/** Converts a plugin id to a safe SQL identifier fragment. */
export function slugify(id: string): string {
  return id.toLowerCase().replace(/[.\-]/g, '_');
}

/**
 * Physical PostgreSQL table name for a plugin-owned table.
 * Format: plugin_{slugified_plugin_id}_{table_name}
 * Example: com.example.crm-enricher + enrichment_cache
 *       → plugin_com_example_crm_enricher_enrichment_cache
 */
export function physicalTableName(pluginId: string, tableName: string): string {
  return `plugin_${slugify(pluginId)}_${tableName}`;
}

type DB = Kysely<any>;

/**
 * Dispatches table.* bridge calls to the correct plugin-owned table.
 * Validates the table name against ctx.tables before executing.
 * Injects workspace_id on all reads/writes automatically.
 */
export async function dispatchTableCall(
  db: DB,
  ctx: BridgeContext,
  verb: string,
  p: Record<string, unknown>,
): Promise<BridgeResult> {
  const tableName = p.name as string;

  if (!ctx.tables.includes(tableName)) {
    return {
      data: null,
      error: {
        code: 'FORBIDDEN',
        message:
          `Table '${tableName}' is not declared in the plugin manifest's 'tables' array. ` +
          `Declared tables: [${ctx.tables.join(', ')}].`,
      },
    };
  }

  const physical = physicalTableName(ctx.pluginSlug, tableName);

  try {
    switch (verb) {
      case 'list': {
        const MAX_LIMIT = 1000;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (db as any).selectFrom(physical).selectAll().where('workspace_id', '=', ctx.workspaceId);
        if (p.where) {
          for (const [k, v] of Object.entries(p.where as Record<string, unknown>)) {
            q = q.where(k, '=', v);
          }
        }
        if (p.orderBy) q = q.orderBy(p.orderBy as string, (p.order ?? 'asc') as 'asc' | 'desc');
        const limit = Math.min(Number(p.limit ?? MAX_LIMIT), MAX_LIMIT);
        q = q.limit(limit);
        if (p.offset) q = q.offset(Number(p.offset));
        return { data: await q.execute(), error: null };
      }

      case 'get': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = await (db as any)
          .selectFrom(physical)
          .selectAll()
          .where('id', '=', p.id as string)
          .where('workspace_id', '=', ctx.workspaceId)
          .executeTakeFirst();
        if (!row) return { data: null, error: { code: 'NOT_FOUND', message: `Row not found in table '${tableName}'` } };
        return { data: row, error: null };
      }

      case 'insert': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = await (db as any)
          .insertInto(physical)
          .values({ ...(p.data as Record<string, unknown>), workspace_id: ctx.workspaceId })
          .returningAll()
          .executeTakeFirstOrThrow();
        return { data: row, error: null };
      }

      case 'update': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = await (db as any)
          .updateTable(physical)
          .set(p.data as Record<string, unknown>)
          .where('id', '=', p.id as string)
          .where('workspace_id', '=', ctx.workspaceId)
          .returningAll()
          .executeTakeFirstOrThrow();
        return { data: row, error: null };
      }

      case 'delete': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .deleteFrom(physical)
          .where('id', '=', p.id as string)
          .where('workspace_id', '=', ctx.workspaceId)
          .execute();
        return { data: null, error: null };
      }

      case 'upsert': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = await (db as any)
          .insertInto(physical)
          .values({ ...(p.data as Record<string, unknown>), workspace_id: ctx.workspaceId })
          .onConflict((oc: any) => oc.column(p.on_conflict as string).doUpdateSet(p.data as Record<string, unknown>))
          .returningAll()
          .executeTakeFirstOrThrow();
        return { data: row, error: null };
      }

      case 'count': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let cq = (db as any)
          .selectFrom(physical)
          .select((eb: any) => eb.fn.countAll().as('count'))
          .where('workspace_id', '=', ctx.workspaceId);
        if (p.where) {
          for (const [k, v] of Object.entries(p.where as Record<string, unknown>)) {
            cq = cq.where(k, '=', v);
          }
        }
        const result = await cq.executeTakeFirstOrThrow();
        return { data: Number(result.count), error: null };
      }

      default:
        return { data: null, error: { code: 'UNKNOWN_METHOD', message: `table.${verb} not supported` } };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: { code: 'BRIDGE_ERROR', message } };
  }
}
