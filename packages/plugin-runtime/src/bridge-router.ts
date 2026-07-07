import type { Kysely } from 'kysely';
import type { PluginPermission, PluginManifest, BridgeCall, BridgeResult } from '@vencore/plugin-types';
import { bridgeRegistry } from './bridge-registry';
import { dispatchTableCall } from './table-client';

export interface BridgeContext {
  workspaceId: string;
  pluginSlug: string;
  /** Bridge data-access permissions from plugin.json data_access field. */
  dataAccess: readonly PluginPermission[];
  /** Table names as declared in manifest (without prefix). */
  tables: string[];
  /** Full manifest — used by handlers that need provides/consumes/emits. */
  manifest?: PluginManifest;
}

type DB = Kysely<any>;

export async function dispatchBridgeCall(
  db: DB,
  ctx: BridgeContext,
  call: BridgeCall,
): Promise<BridgeResult> {
  const { method, payload } = call;
  const p = (payload ?? {}) as Record<string, unknown>;

  try {
    // Registered handler (modules + plugins)
    const handler = bridgeRegistry.lookup(method);
    if (handler) {
      if (handler.permission !== null && !ctx.dataAccess.includes(handler.permission)) {
        return {
          data: null,
          error: {
            code: 'FORBIDDEN',
            message: `Method '${method}' requires data_access permission '${handler.permission}'.`,
          },
        };
      }
      const data = await handler.handle(ctx, p, db);
      return { data, error: null };
    }

    // Built-in: table.* (controlled by declared tables list)
    const dot = method.indexOf('.');
    const namespace = dot >= 0 ? method.slice(0, dot) : method;
    const verb = dot >= 0 ? method.slice(dot + 1) : '';

    if (namespace === 'table') {
      const tableName = p.name as string;
      if (!ctx.tables.includes(tableName)) {
        return {
          data: null,
          error: { code: 'FORBIDDEN', message: `Table '${tableName}' not declared in plugin manifest.` },
        };
      }
      return dispatchTableCall(db, ctx, verb, p);
    }

    return { data: null, error: { code: 'UNKNOWN_METHOD', message: `Unknown bridge method: ${method}` } };
  } catch (e) {
    // Normalize to a plain { code, message }. Error/DatabaseError 'message' is
    // non-enumerable and is lost over the sandbox IPC boundary, so copy it into
    // a plain object explicitly.
    if (e !== null && typeof e === 'object' && 'code' in e && 'message' in e) {
      const err = e as { code: unknown; message: unknown };
      return { data: null, error: { code: String(err.code), message: String(err.message) } };
    }
    const message = e instanceof Error ? e.message : 'Internal bridge error';
    return { data: null, error: { code: 'INTERNAL', message } };
  }
}
