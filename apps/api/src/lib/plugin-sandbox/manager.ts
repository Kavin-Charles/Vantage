/**
 * Plugin sandbox dispatcher.
 *
 * Selects between two execution strategies and exposes a single stable API to
 * the rest of the app (plugin-loader, plugin-cron, hook-features, index.ts):
 *
 *   - child-process.ts — isolated forked child per (pluginId, workspaceId).
 *                        Security-preferred; used whenever fork works.
 *   - in-process.ts    — runs the bundle in the API process. Used when
 *                        PLUGIN_SANDBOX_MODE=in-process, or in `auto` mode once
 *                        child-process fork is detected as restricted (GH #93).
 *
 * Mode is read from PLUGIN_SANDBOX_MODE (auto | child | in-process; default
 * auto). In `auto`, the first detected fork failure latches `forkDisabled` and
 * every plugin — this one and all subsequent — runs in-process from then on.
 */
import type { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { PluginPermission, PluginManifest } from '@vencore/plugin-types';
import { logger } from '../logger';
import { childProcessStrategy } from './child-process';
import { inProcessStrategy } from './in-process';
import type { SandboxSpawnInput, SpawnHooks } from './types';

type SandboxMode = 'auto' | 'child' | 'in-process';

// Latched true the first time fork is found to be restricted (auto mode only).
let forkDisabled = false;

function resolveMode(): SandboxMode {
  const raw = process.env['PLUGIN_SANDBOX_MODE'];
  if (raw === 'child' || raw === 'in-process' || raw === 'auto') return raw;
  return 'auto';
}

/** The configured sandbox mode (auto | child | in-process). */
export function getSandboxMode(): SandboxMode {
  return resolveMode();
}

/** True when the effective strategy for a fresh spawn is in-process. */
export function usingInProcessSandbox(): boolean {
  const mode = resolveMode();
  return mode === 'in-process' || (mode === 'auto' && forkDisabled);
}

function fallBackToInProcess(input: SandboxSpawnInput): void {
  if (!forkDisabled) {
    forkDisabled = true;
    logger.warn(
      { pluginId: input.pluginId, workspaceId: input.workspaceId },
      'Child-process fork unavailable — falling back to in-process plugin sandbox for all plugins',
    );
  }
  // Ensure no half-spawned child lingers, then run in-process.
  childProcessStrategy.kill(input.pluginId, input.workspaceId);
  inProcessStrategy.spawn(input);
}

function dispatch(input: SandboxSpawnInput): void {
  const { pluginId, workspaceId } = input;

  // Cross-strategy cleanup: a plugin may switch strategies between spawns.
  childProcessStrategy.kill(pluginId, workspaceId);
  inProcessStrategy.kill(pluginId, workspaceId);

  const mode = resolveMode();

  if (mode === 'in-process' || (mode === 'auto' && forkDisabled)) {
    inProcessStrategy.spawn(input);
    return;
  }

  // Child process (forced `child`, or `auto` before any fork failure).
  const hooks: SpawnHooks = { respawn: () => dispatch(input) };
  if (mode === 'auto') {
    hooks.onForkUnavailable = () => fallBackToInProcess(input);
  }
  childProcessStrategy.spawn(input, hooks);
}

export function spawnPluginSandbox(
  pluginId: string,
  workspaceId: string,
  bundlePath: string,
  dataAccess: readonly PluginPermission[],
  tables: string[],
  db: Kysely<Database>,
  listens: readonly string[] = [],
  manifest?: PluginManifest,
): void {
  dispatch({ pluginId, workspaceId, bundlePath, dataAccess, tables, db, listens, manifest });
}

export function getSandboxRouter(pluginId: string, workspaceId: string): Router | null {
  return childProcessStrategy.getRouter(pluginId, workspaceId)
    ?? inProcessStrategy.getRouter(pluginId, workspaceId);
}

/**
 * Sends a bus-style event to whichever strategy owns the sandbox (used by the
 * plugin cron worker to fire `cron:<name>` handlers and by hook-features).
 * Returns false when no sandbox is running for the plugin.
 */
export function sendBusEventToSandbox(
  pluginId: string,
  workspaceId: string,
  event: string,
  payload: unknown,
): boolean {
  return childProcessStrategy.sendBusEvent(pluginId, workspaceId, event, payload)
    || inProcessStrategy.sendBusEvent(pluginId, workspaceId, event, payload);
}

export function isSandboxRunning(pluginId: string, workspaceId: string): boolean {
  return childProcessStrategy.isRunning(pluginId, workspaceId)
    || inProcessStrategy.isRunning(pluginId, workspaceId);
}

export function killSandbox(pluginId: string, workspaceId: string): void {
  childProcessStrategy.kill(pluginId, workspaceId);
  inProcessStrategy.kill(pluginId, workspaceId);
}

export function killAllSandboxes(): void {
  childProcessStrategy.killAll();
  inProcessStrategy.killAll();
}
