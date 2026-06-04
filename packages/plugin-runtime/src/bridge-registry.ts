import type { Kysely } from 'kysely';
import type { PluginPermission } from '@vencore/plugin-types';
import type { BridgeContext } from './bridge-router';

export type BridgeHandlerFn = (
  ctx: BridgeContext,
  payload: Record<string, unknown>,
  db: Kysely<any>,
) => Promise<unknown>;

export interface BridgeHandlerDef {
  permission: PluginPermission | null;
  handle: BridgeHandlerFn;
}

export class BridgeRegistry {
  private readonly handlers = new Map<string, BridgeHandlerDef>();

  register(
    method: string,
    permission: PluginPermission | null,
    handle: BridgeHandlerFn,
  ): this {
    this.handlers.set(method, { permission, handle });
    return this;
  }

  lookup(method: string): BridgeHandlerDef | undefined {
    return this.handlers.get(method);
  }

  has(method: string): boolean {
    return this.handlers.has(method);
  }
}

/** Singleton registry shared across the API process. */
export const bridgeRegistry = new BridgeRegistry();
