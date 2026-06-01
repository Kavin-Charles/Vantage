import fs from 'fs';
import path from 'path';
import type { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { logger } from './logger';

const routerCache = new Map<string, Router>();

export function pluginStorageDir(): string {
  return process.env['PLUGIN_STORAGE_DIR'] ?? path.join(process.cwd(), 'plugin-storage');
}

export function pluginBundlePath(pluginId: string): string {
  return path.join(pluginStorageDir(), pluginId, 'server.cjs');
}

export function savePluginBundle(pluginId: string, bundle: Buffer): void {
  const dir = path.join(pluginStorageDir(), pluginId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'server.cjs'), bundle);
  // Invalidate cache so next request picks up new bundle
  routerCache.delete(pluginId);
}

export function loadPluginRouter(pluginId: string, db: Kysely<Database>): Router | null {
  if (routerCache.has(pluginId)) return routerCache.get(pluginId)!;

  const bundlePath = pluginBundlePath(pluginId);
  if (!fs.existsSync(bundlePath)) return null;

  try {
    // Clear require cache so re-installs pick up fresh bundle
    delete require.cache[require.resolve(bundlePath)];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(bundlePath) as { createRouter: (db: Kysely<Database>) => Router };
    if (typeof mod.createRouter !== 'function') {
      logger.warn({ pluginId }, 'Plugin bundle missing createRouter export');
      return null;
    }
    const router = mod.createRouter(db);
    routerCache.set(pluginId, router);
    logger.info({ pluginId }, 'Plugin bundle loaded');
    return router;
  } catch (err) {
    logger.warn({ err, pluginId }, 'Failed to load plugin bundle');
    return null;
  }
}
