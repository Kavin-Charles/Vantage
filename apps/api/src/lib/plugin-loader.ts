import fs from 'fs';
import path from 'path';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { PluginManifest, PluginPermission } from '@vencore/plugin-types';
import { Router } from 'express';
import { expandListenTopics } from '@vencore/plugin-runtime';
import { spawnPluginSandbox, getSandboxRouter, killSandbox } from './plugin-sandbox/manager';

export function pluginStorageDir(): string {
  return process.env['PLUGIN_STORAGE_DIR'] ?? path.join(process.cwd(), 'plugin-storage');
}

export function pluginBundlePath(pluginId: string, file: string): string {
  return path.join(pluginStorageDir(), pluginId, file);
}

export function savePluginFile(pluginId: string, filename: string, data: Buffer): void {
  const dir = path.join(pluginStorageDir(), pluginId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), data);
}

export function loadPluginManifest(pluginId: string): PluginManifest | null {
  const p = pluginBundlePath(pluginId, 'plugin.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as PluginManifest;
  } catch {
    return null;
  }
}

/**
 * Loads a plugin backend by spawning an isolated child process sandbox.
 * The sandbox communicates with the parent via IPC for all bridge calls.
 * Each (pluginId, workspaceId) pair gets its own sandboxed process.
 */
export function loadPluginBackend(pluginId: string, workspaceId: string, db: Kysely<Database>): void {
  const bundlePath = pluginBundlePath(pluginId, 'server.cjs');
  if (!fs.existsSync(bundlePath)) return;

  const manifest = loadPluginManifest(pluginId);
  const dataAccess = (manifest?.data_access ?? []) as PluginPermission[];
  const tables = (manifest?.tables ?? []).map((t) => t.name);

  // Bus topics forwarded into the sandbox: system hook events, declared
  // cross-plugin listens, and hub change topics for every consumed contract.
  // Legacy hook/listen names (contact.created, …) are translated to their
  // contract-based equivalents so old manifests keep working after the rename.
  const listens = [
    ...expandListenTopics([...(manifest?.hooks ?? []), ...(manifest?.listens ?? [])]),
    ...(manifest?.consumes ?? []).map((c) => `hub:${c.contract}:changed`),
    ...(manifest?.consumes ?? []).map((c) => `hub:${c.contract}:provider_removed`),
  ];

  spawnPluginSandbox(pluginId, workspaceId, bundlePath, dataAccess, tables, db, listens, manifest ?? undefined);
}

export function getPluginRouter(pluginId: string, workspaceId: string): Router | null {
  return getSandboxRouter(pluginId, workspaceId);
}

export function invalidatePlugin(pluginId: string, workspaceId: string): void {
  killSandbox(pluginId, workspaceId);
}
