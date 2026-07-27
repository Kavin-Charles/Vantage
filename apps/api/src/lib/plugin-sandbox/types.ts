/**
 * Shared types for the plugin sandbox strategies (child-process and in-process).
 * manager.ts is the dispatcher that selects between them at runtime.
 */
import type { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { PluginPermission, PluginManifest } from '@vencore/plugin-types';

export interface SandboxSpawnInput {
  pluginId: string;
  workspaceId: string;
  bundlePath: string;
  dataAccess: readonly PluginPermission[];
  tables: string[];
  db: Kysely<Database>;
  listens: readonly string[];
  manifest?: PluginManifest;
}

export interface SpawnHooks {
  /**
   * Invoked (at most once per spawn) when the child-process strategy detects
   * that fork is restricted — either fork() threw synchronously or the child
   * emitted an error / exited before signalling `ready`. The dispatcher uses
   * this to latch into in-process mode and re-spawn the plugin there.
   */
  onForkUnavailable?: () => void;
  /**
   * Invoked to re-spawn this plugin after an unexpected crash. The dispatcher
   * supplies this so the crash-restart path goes back through mode selection
   * (and respects the fork-unavailable latch) instead of blindly re-forking.
   */
  respawn?: () => void;
}

export interface SandboxStrategy {
  spawn(input: SandboxSpawnInput, hooks?: SpawnHooks): void;
  getRouter(pluginId: string, workspaceId: string): Router | null;
  sendBusEvent(pluginId: string, workspaceId: string, event: string, payload: unknown): boolean;
  isRunning(pluginId: string, workspaceId: string): boolean;
  has(pluginId: string, workspaceId: string): boolean;
  kill(pluginId: string, workspaceId: string): void;
  killAll(): void;
}

export function sandboxKey(pluginId: string, workspaceId: string): string {
  return `${pluginId}:${workspaceId}`;
}
